import { UpstreamServer, HealthCheckConfig } from './types';
import { EventEmitter } from 'events';
import * as http from 'http';
import * as https from 'https';
import { Logger } from 'winston';
import { URL } from 'url';

/**
 * 健康检查模块
 * 负责检查上游服务器的健康状态
 */
export class HealthChecker extends EventEmitter {
  private servers: UpstreamServer[];
  private config: HealthCheckConfig;
  private logger: Logger;
  private checkInterval: NodeJS.Timeout | null = null;
  private serverStatus: Map<string, { 
    failures: number;
    lastCheck: number;
    isDown: boolean;
    isBackup: boolean;
    successCount: number;  // 添加连续成功次数计数
    currentInterval: number;  // 添加当前检查间隔
  }> = new Map();

  // 定义间隔配置
  private static readonly INTERVAL_CONFIG = {
    MIN_INTERVAL: 1000,     // 最小间隔 1 秒
    MAX_INTERVAL: 30000,    // 最大间隔 30 秒
    INITIAL_INTERVAL: 5000, // 初始间隔 5 秒
    INCREASE_FACTOR: 2,     // 成功后增加间隔的倍数
    SUCCESS_THRESHOLD: 3    // 连续成功多少次后增加间隔
  };

  private static readonly DEFAULT_CONFIG: Required<HealthCheckConfig> = {
    enabled: true,
    type: 'http',
    path: '',
    interval: HealthChecker.INTERVAL_CONFIG.INITIAL_INTERVAL,
    timeout: 5000,
    retries: 3,
    headers: {},
    expectedStatus: [200, 201, 202, 301, 302, 303, 307, 308, 404],
    expectedBody: '',
    followRedirects: true,
    allowInsecure: true,
    tcpOptions: {
      port: undefined,
      host: undefined
    },
    onSuccess: () => {},
    onError: () => {}
  };

  constructor(servers: UpstreamServer[], config: HealthCheckConfig, logger: Logger) {
    super();
    this.servers = servers;
    this.config = config;
    this.logger = logger;
    this.initializeServerStatus();
  }

  /**
   * 初始化服务器状态记录
   */
  private initializeServerStatus(): void {
    this.serverStatus.clear();
    this.servers.forEach(server => {
      this.serverStatus.set(server.url, {
        failures: 0,
        lastCheck: 0,
        isDown: false,
        isBackup: server.backup || false,
        successCount: 0,
        currentInterval: HealthChecker.INTERVAL_CONFIG.INITIAL_INTERVAL
      });
    });
  }

  /**
   * 启动健康检查
   */
  public start(): void {
    if (!this.config) {
      this.logger.warn('No health check configuration provided, using defaults');
      this.config = { ...HealthChecker.DEFAULT_CONFIG };
    }

    this.config = {
      ...HealthChecker.DEFAULT_CONFIG,
      ...this.config
    };

    if (this.checkInterval) {
      this.stop();
    }

    // 立即进行一次检查
    this.checkAllServers();

    this.checkInterval = setInterval(() => {
      this.checkAllServers();
    }, this.config.interval);

    this.logger.info('Health checker started', {
      interval: this.config.interval,
      timeout: this.config.timeout,
      retries: this.config.retries,
      servers: this.servers.map(s => ({
        url: s.url,
        isBackup: s.backup
      }))
    });
  }

  /**
   * 停止健康检查
   */
  public stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      this.logger.info('Health checker stopped');
    }
  }

  /**
   * 更新配置和服务器列表
   */
  public updateConfig(servers: UpstreamServer[], config: HealthCheckConfig): void {
    this.servers = servers;
    this.config = config;
    this.initializeServerStatus();
    
    if (this.checkInterval) {
      this.stop();
      this.start();
    }
  }

  /**
   * 检查所有服务器
   */
  private async checkAllServers(): Promise<void> {
    const now = Date.now();

    for (const server of this.servers) {
      const status = this.serverStatus.get(server.url);
      if (!status) continue;

      // 检查是否需要进行健康检查
      if (now - status.lastCheck >= status.currentInterval) {
        await this.checkServer(server);
      }
    }
  }

  /**
   * 检查单个服务器
   */
  private async checkServer(server: UpstreamServer): Promise<void> {
    const status = this.serverStatus.get(server.url);
    if (!status) return;

    try {
      const isHealthy = await this.performHealthCheck(server);
      
      if (isHealthy) {
        this.handleSuccessfulCheck(server, status);
      } else {
        this.handleFailedCheck(server, status);
      }
    } catch (error) {
      this.handleFailedCheck(server, status);
      this.logger.error(`Health check error for ${server.url}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * 执行健康检查
   */
  private async performHealthCheck(server: UpstreamServer): Promise<boolean> {
    return new Promise((resolve) => {
      const url = new URL(server.url);
      
      // 优先使用服务器自己的健康检查配置
      const serverConfig = server.healthCheck || this.config;
      
      // 如果配置了健康检查路径，使用配置的路径
      // 否则使用URL中的原始路径，如果原始路径为空则使用根路径
      const checkPath = serverConfig.path || url.pathname || '/';
      
      // 保持原始URL的查询参数
      const searchParams = url.search || '';
      
      const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: checkPath + searchParams,  // 加入查询参数
        timeout: serverConfig.timeout || this.config.timeout || 5000,  // 确保有默认值
        method: 'GET',
        headers: {
          ...this.config.headers,
          'User-Agent': 'HealthChecker/1.0',
          'Host': url.host,  // 添加 Host 头，某些服务器可能需要
          'Accept': '*/*',
          'Connection': 'close'  // 确保连接关闭
        },
        // HTTPS 选项
        rejectUnauthorized: false,  // 不验证证书
        agent: false  // 禁用 keep-alive
      };

      this.logger.debug(`Starting health check for ${server.url}`, {
        options,
        serverConfig: {
          path: serverConfig.path,
          timeout: serverConfig.timeout,
          expectedStatus: serverConfig.expectedStatus
        }
      });

      // 处理重定向的最大次数
      let redirectCount = 0;
      const MAX_REDIRECTS = 5;

      const makeRequest = (requestUrl: string, redirectCount: number) => {
        const currentUrl = new URL(requestUrl);
        const isHttps = currentUrl.protocol === 'https:';
        
        const currentOptions = {
          ...options,
          hostname: currentUrl.hostname,
          port: currentUrl.port || (isHttps ? 443 : 80),
          path: currentUrl.pathname + (currentUrl.search || ''),
          headers: {
            ...options.headers,
            'Host': currentUrl.host
          }
        };

        this.logger.debug(`Making request to ${requestUrl}`, {
          attempt: redirectCount + 1,
          options: currentOptions
        });

        const requestCallback = (res: http.IncomingMessage) => {
          this.logger.debug(`Received response from ${requestUrl}`, {
            statusCode: res.statusCode,
            headers: res.headers
          });

          // 处理重定向
          if ([301, 302, 307, 308].includes(res.statusCode || 0) && res.headers.location && redirectCount < MAX_REDIRECTS) {
            const location = new URL(res.headers.location, requestUrl);
            this.logger.debug(`Following redirect for ${server.url} to ${location.href}`, {
              redirectCount: redirectCount + 1,
              maxRedirects: MAX_REDIRECTS,
              location: location.href
            });
            makeRequest(location.href, redirectCount + 1);
            return;
          }

          // 检查状态码是否在预期范围内
          const expectedStatus = serverConfig.expectedStatus || this.config.expectedStatus || [200, 301, 302, 404];
          const isValidStatus = expectedStatus.includes(res.statusCode || 500);

          if (isValidStatus) {
            let body = '';
            res.on('data', chunk => { body += chunk; });
            res.on('end', () => {
              // 如果配置了期望的响应体，则进行检查
              if (serverConfig.expectedBody) {
                const pattern = typeof serverConfig.expectedBody === 'string' 
                  ? new RegExp(serverConfig.expectedBody)
                  : serverConfig.expectedBody;
                const matches = pattern.test(body);
                this.logger.debug(`Checking response body for ${server.url}`, {
                  pattern: serverConfig.expectedBody.toString(),
                  matches,
                  bodyPreview: body.substring(0, 200)
                });
                resolve(matches);
              } else {
                this.logger.debug(`Health check successful for ${server.url}`, {
                  statusCode: res.statusCode,
                  bodyLength: body.length
                });
                resolve(true);
              }
            });
          } else {
            this.logger.debug(`Health check failed for ${server.url}`, {
              expectedStatus,
              actualStatus: res.statusCode,
              checkPath: currentOptions.path,
              redirectCount,
              headers: res.headers
            });
            resolve(false);
          }
        };

        const request = (isHttps ? https : http).request(
          currentOptions,
          requestCallback
        );

        request.on('error', (error: NodeJS.ErrnoException) => {
          this.logger.debug(`Health check request failed for ${server.url}:`, {
            error: error.message,
            code: error.code,
            checkPath: currentOptions.path,
            options: currentOptions,
            isHttps,
            redirectCount
          });
          resolve(false);
        });

        request.on('timeout', () => {
          request.destroy();
          this.logger.debug(`Health check timeout for ${server.url}`, {
            timeout: currentOptions.timeout,
            checkPath: currentOptions.path,
            redirectCount
          });
          resolve(false);
        });

        // 设置请求超时
        request.setTimeout(options.timeout);

        request.end();
      };

      // 开始第一个请求
      makeRequest(server.url, 0);
    });
  }

  /**
   * 处理成功的健康检查
   */
  private handleSuccessfulCheck(server: UpstreamServer, status: { 
    failures: number; 
    lastCheck: number; 
    isDown: boolean; 
    isBackup: boolean;
    successCount: number;
    currentInterval: number;
  }): void {
    status.failures = 0;
    status.lastCheck = Date.now();
    status.successCount++;

    // 如果连续成功次数达到阈值，增加检查间隔
    if (status.successCount >= HealthChecker.INTERVAL_CONFIG.SUCCESS_THRESHOLD) {
      const newInterval = Math.min(
        status.currentInterval * HealthChecker.INTERVAL_CONFIG.INCREASE_FACTOR,
        HealthChecker.INTERVAL_CONFIG.MAX_INTERVAL
      );
      
      if (newInterval !== status.currentInterval) {
        this.logger.debug(`增加健康检查间隔 ${server.url}:`, {
          oldInterval: status.currentInterval,
          newInterval: newInterval,
          successCount: status.successCount
        });
        status.currentInterval = newInterval;
      }
    }

    if (status.isDown) {
      status.isDown = false;
      server.down = false;
      this.emit('serverUp', server);
      this.logger.info(`服务器 ${server.url} 恢复在线`, {
        isBackup: status.isBackup,
        lastCheck: new Date(status.lastCheck).toISOString(),
        currentInterval: status.currentInterval
      });

      // 如果是备份服务器恢复，检查是否需要切换回主服务器
      if (status.isBackup) {
        this.checkPrimaryServers();
      }
    }
  }

  /**
   * 处理失败的健康检查
   */
  private handleFailedCheck(server: UpstreamServer, status: { 
    failures: number; 
    lastCheck: number; 
    isDown: boolean; 
    isBackup: boolean;
    successCount: number;
    currentInterval: number;
  }): void {
    status.failures++;
    status.lastCheck = Date.now();
    status.successCount = 0;  // 重置连续成功次数

    // 立即降低检查间隔到最小值
    if (status.currentInterval > HealthChecker.INTERVAL_CONFIG.MIN_INTERVAL) {
      this.logger.debug(`降低健康检查间隔 ${server.url}:`, {
        oldInterval: status.currentInterval,
        newInterval: HealthChecker.INTERVAL_CONFIG.MIN_INTERVAL,
        failures: status.failures
      });
      status.currentInterval = HealthChecker.INTERVAL_CONFIG.MIN_INTERVAL;
    }

    const retries = this.config?.retries ?? HealthChecker.DEFAULT_CONFIG.retries;

    if (status.failures >= retries && !status.isDown) {
      status.isDown = true;
      server.down = true;
      this.emit('serverDown', server);
      this.logger.warn(`服务器 ${server.url} 标记为离线，连续失败 ${status.failures} 次`, {
        isBackup: status.isBackup,
        failures: status.failures,
        lastCheck: new Date(status.lastCheck).toISOString(),
        currentInterval: status.currentInterval
      });

      // 如果是主服务器宕机，尝试激活备份服务器
      if (!status.isBackup) {
        this.activateBackupServers();
      }
    }
  }

  /**
   * 检查主服务器状态
   */
  private async checkPrimaryServers(): Promise<void> {
    const primaryServers = this.servers.filter(s => !s.backup);
    let anyPrimaryUp = false;

    for (const server of primaryServers) {
      await this.checkServer(server);
      const status = this.serverStatus.get(server.url);
      if (status && !status.isDown) {
        anyPrimaryUp = true;
      }
    }

    // 如果有主服务器恢复，停用所有备份服务器
    if (anyPrimaryUp) {
      this.deactivateBackupServers();
    }
  }

  /**
   * 停用备份服务器
   */
  private deactivateBackupServers(): void {
    const backupServers = this.servers.filter(s => s.backup);
    
    for (const server of backupServers) {
      const status = this.serverStatus.get(server.url);
      if (status && !status.isDown) {
        status.isDown = true;
        server.down = true;
        this.emit('serverDown', server);
        this.logger.info(`主服务器恢复在线，停用备份服务器 ${server.url}`, {
          isBackup: true,
          lastCheck: new Date(status.lastCheck).toISOString()
        });
      }
    }
  }

  /**
   * 激活备份服务器
   */
  private async activateBackupServers(): Promise<void> {
    const backupServers = this.servers.filter(s => s.backup);
    if (backupServers.length === 0) {
      this.logger.warn('没有可用的备份服务器');
      return;
    }

    // 检查所有主服务器是否都已宕机
    const allPrimaryDown = this.servers
      .filter(s => !s.backup)
      .every(s => {
        const status = this.serverStatus.get(s.url);
        return status?.isDown;
      });

    // 只有在所有主服务器都宕机时才激活备份服务器
    if (allPrimaryDown) {
      this.logger.info('所有主服务器都已宕机，正在激活备份服务器', {
        count: backupServers.length,
        servers: backupServers.map(s => s.url)
      });

      for (const server of backupServers) {
        await this.checkServer(server);
      }
    }
  }

  /**
   * 获取服务器的健康状态
   */
  public getServerStatus(serverUrl: string): boolean {
    const status = this.serverStatus.get(serverUrl);
    return status ? !status.isDown : false;
  }

  /**
   * 获取所有服务器的状态
   */
  public getAllServerStatus(): Array<{
    url: string;
    isDown: boolean;
    isBackup: boolean;
    failures: number;
    lastCheck: number;
  }> {
    return Array.from(this.serverStatus.entries()).map(([url, status]) => ({
      url,
      ...status
    }));
  }

  /**
   * 紧急健康检查
   * 立即检查指定服务器，不考虑检查间隔
   */
  public async checkServerUrgent(serverUrl: string): Promise<void> {
    const server = this.servers.find(s => s.url === serverUrl);
    if (!server) {
      this.logger.warn(`紧急健康检查：未找到服务器 ${serverUrl}`);
      return;
    }

    this.logger.info(`执行紧急健康检查: ${serverUrl}`);
    
    const status = this.serverStatus.get(serverUrl);
    if (!status) return;

    // 重置检查间隔到最小值
    status.currentInterval = HealthChecker.INTERVAL_CONFIG.MIN_INTERVAL;
    
    // 立即执行检查
    await this.checkServer(server);
  }
}

/**
 * 创建健康检查器实例
 */
export function createHealthChecker(
  servers: UpstreamServer[],
  config: HealthCheckConfig,
  logger: Logger
): HealthChecker {
  return new HealthChecker(servers, config, logger);
}
