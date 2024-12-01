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
  }> = new Map();

  private static readonly DEFAULT_CONFIG: Required<HealthCheckConfig> = {
    enabled: true,
    type: 'http',
    path: '/health',
    interval: 30000,    // 30 秒
    timeout: 5000,      // 5 秒
    retries: 3,
    headers: {},
    expectedStatus: [200],
    expectedBody: '',
    followRedirects: true,
    allowInsecure: false,
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
        isDown: false
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

    this.checkInterval = setInterval(() => {
      this.checkAllServers();
    }, this.config.interval);

    this.logger.info('Health checker started');
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
    for (const server of this.servers) {
      if (!server.backup) { // 只检查非备份服务器
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
      const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: this.config.type === 'http' ? (this.config.path || '/') : '',
        timeout: this.config.timeout,
        method: 'GET',
      };

      const requestCallback = (res: http.IncomingMessage) => {
        resolve(res.statusCode !== undefined && res.statusCode < 500);
      };

      const request = (url.protocol === 'https:' ? https : http).request(
        options,
        requestCallback
      );

      request.on('error', () => {
        resolve(false);
      });

      request.on('timeout', () => {
        request.destroy();
        resolve(false);
      });

      request.end();
    });
  }

  /**
   * 处理成功的健康检查
   */
  private handleSuccessfulCheck(server: UpstreamServer, status: { failures: number; lastCheck: number; isDown: boolean }): void {
    status.failures = 0;
    status.lastCheck = Date.now();

    if (status.isDown) {
      status.isDown = false;
      server.down = false;
      this.emit('serverUp', server);
      this.logger.info(`Server ${server.url} is back online`);
    }
  }

  /**
   * 处理失败的健康检查
   */
  private handleFailedCheck(server: UpstreamServer, status: { failures: number; lastCheck: number; isDown: boolean }): void {
    status.failures++;
    status.lastCheck = Date.now();

    const retries = this.config?.retries ?? HealthChecker.DEFAULT_CONFIG.retries;

    if (status.failures >= retries && !status.isDown) {
      status.isDown = true;
      server.down = true;
      this.emit('serverDown', server);
      this.logger.warn(`Server ${server.url} is marked as down after ${status.failures} failures`);
    }
  }

  /**
   * 获取服务器的健康状态
   */
  public getServerStatus(serverUrl: string): boolean {
    const status = this.serverStatus.get(serverUrl);
    return status ? !status.isDown : false;
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
