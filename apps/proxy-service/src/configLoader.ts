import { Config, HealthCheckConfig, ServerConfig, SSLConfig } from './types';
import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import { Logger } from 'winston';
import * as crypto from 'crypto';
import * as tls from 'tls';

/**
 * 配置加载器类
 * 负责加载、验证、监听配置文件变化
 */
export class ConfigLoader extends EventEmitter {
  private configPath: string;
  private currentConfig: Config | null = null;
  private logger: Logger;
  private watcher: fs.FSWatcher | null = null;

  constructor(configPath: string, logger: Logger) {
    super();
    this.configPath = path.resolve(configPath);
    this.logger = logger;
  }

  /**
   * 默认配置
   */
  private static readonly DEFAULT_CONFIG: Required<Config> = {
    upstreams: [{
      name: 'default_backend',
      balancer: 'round-robin',
      servers: [{
        url: 'http://localhost:8080',
        weight: 1
      }]
    }],
    servers: [{
      name: 'default',
      listen: 9000,
      locations: [{
        path: '/',
        upstream: 'default_backend',
        balancer: 'round-robin'
      }]
    }],
    logging: {
      level: 'info',
      file: 'logs/access.log'
    },
    monitoring: {
      enabled: true,
      wsPort: 3001,
      pushInterval: 1000,
      metrics: ['cpuUsage', 'memoryUsage', 'serverMetrics']
    },
    captcha: {
      enabled: true,
      maxAttempts: 5,
      timeout: 300000,  // 5分钟
      blackholeThreshold: 10,  // 10次失败后进入黑洞
      banDuration: 900000,  // 15分钟封禁时长
      google: {
        siteKey: process.env.RECAPTCHA_SITE_KEY || '',
        secretKey: process.env.RECAPTCHA_SECRET_KEY || '',
        minScore: 0.5  // reCAPTCHA v3 最低分数要求
      }
    },
    ssl: {
      enabled: false,
      cert: '',
      key: ''
    }
  };

  /**
   * 默认健康检查配置
   */
  private static readonly DEFAULT_HEALTH_CHECK: HealthCheckConfig = {
    type: 'http',
    path: '/health',
    interval: 30000,
    timeout: 5000,
    retries: 3,
    enabled: true,
    headers: {},
    expectedStatus: [200]
  };

  /**
   * 默认SSL配置
   */
  private static readonly DEFAULT_SSL_CONFIG: SSLConfig = {
    enabled: false,
    cert: '',
    key: '',
    http2: false,
    ciphers: [
      'ECDHE-ECDSA-AES128-GCM-SHA256',
      'ECDHE-RSA-AES128-GCM-SHA256',
      'ECDHE-ECDSA-AES256-GCM-SHA384',
      'ECDHE-RSA-AES256-GCM-SHA384'
    ],
    protocols: ['TLSv1.2', 'TLSv1.3'],
    preferServerCiphers: true,
    sessionTimeout: 3600,
    sessionTickets: true,
    ocspStapling: true,
    sslRedirect: true,
    sslRedirectStatusCode: 301
  };

  /**
   * 加载并验证配置文件
   * @returns 配置对象
   */
  public loadConfig(): Config {
    try {
      if (!fs.existsSync(this.configPath)) {
        this.logger.warn(`Config file not found at ${this.configPath}, using default configuration`);
        return ConfigLoader.DEFAULT_CONFIG;
      }

      const configData = fs.readFileSync(this.configPath, 'utf-8');
      if (!configData.trim()) {
        this.logger.warn('Empty config file, using default configuration');
        return ConfigLoader.DEFAULT_CONFIG;
      }

      const config = this.parseConfig(configData);
      
      this.logger.debug('Parsed config:', JSON.stringify(config, null, 2));
      
      // 保留原始配置的结构，只合并必要的默认值
      const mergedConfig = {
        ...config,
        upstreams: this.mergeUpstreamConfigs(config.upstreams || []),
        servers: this.mergeServerConfigs(config.servers || []),
        ssl: config.ssl ? this.mergeSSLConfig(config.ssl) : undefined,
        logging: config.logging || ConfigLoader.DEFAULT_CONFIG.logging,
        monitoring: config.monitoring || ConfigLoader.DEFAULT_CONFIG.monitoring,
        captcha: config.captcha || ConfigLoader.DEFAULT_CONFIG.captcha
      };
      
      this.logger.debug('Pre-validation config:', JSON.stringify(mergedConfig, null, 2));
      
      this.validateConfig(mergedConfig);
      this.currentConfig = mergedConfig;

      this.logger.debug('Final config:', JSON.stringify(mergedConfig, null, 2));

      return mergedConfig;
    } catch (error) {
      this.logger.error(`Failed to load config file: ${error instanceof Error ? error.message : 'Unknown error'}`);
      // 如果配置文件存在但处理失败，保持原有配置
      if (this.currentConfig) {
        this.logger.info('Keeping current configuration');
        return this.currentConfig;
      }
      this.logger.info('Falling back to default configuration');
      return ConfigLoader.DEFAULT_CONFIG;
    }
  }

  /**
   * 将用户配置与默认配置合
   * @param userConfig 用户配置
   * @returns 合并后的配置
   */
  private mergeWithDefaults(userConfig: Partial<Config>): Config {
    this.logger.debug('Merging user config:', JSON.stringify(userConfig, null, 2));
    this.logger.debug('Default config:', JSON.stringify(ConfigLoader.DEFAULT_CONFIG, null, 2));

    // 确保必需的配置字段存在
    const mergedConfig: Config = {
      upstreams: this.mergeUpstreamConfigs(userConfig.upstreams || ConfigLoader.DEFAULT_CONFIG.upstreams),
      servers: this.mergeServerConfigs(userConfig.servers || ConfigLoader.DEFAULT_CONFIG.servers),
      ssl: this.mergeSSLConfig(userConfig.ssl),
      logging: {
        level: userConfig.logging?.level || ConfigLoader.DEFAULT_CONFIG.logging.level,
        file: userConfig.logging?.file || ConfigLoader.DEFAULT_CONFIG.logging.file
      },
      monitoring: {
        enabled: userConfig.monitoring?.enabled ?? ConfigLoader.DEFAULT_CONFIG.monitoring.enabled,
        wsPort: userConfig.monitoring?.wsPort || ConfigLoader.DEFAULT_CONFIG.monitoring.wsPort,
        pushInterval: userConfig.monitoring?.pushInterval || ConfigLoader.DEFAULT_CONFIG.monitoring.pushInterval,
        metrics: Array.from(new Set([
          ...ConfigLoader.DEFAULT_CONFIG.monitoring.metrics,
          ...(userConfig.monitoring?.metrics || [])
        ]))
      },
      // 合并人机验证配置，确保默认启用
      captcha: {
        enabled: userConfig.captcha?.enabled ?? true,
        maxAttempts: userConfig.captcha?.maxAttempts ?? ConfigLoader.DEFAULT_CONFIG.captcha.maxAttempts,
        timeout: userConfig.captcha?.timeout ?? ConfigLoader.DEFAULT_CONFIG.captcha.timeout,
        blackholeThreshold: userConfig.captcha?.blackholeThreshold ?? ConfigLoader.DEFAULT_CONFIG.captcha.blackholeThreshold,
        banDuration: userConfig.captcha?.banDuration ?? ConfigLoader.DEFAULT_CONFIG.captcha.banDuration,
        google: userConfig.captcha?.google ? {
          siteKey: userConfig.captcha.google.siteKey || ConfigLoader.DEFAULT_CONFIG.captcha.google!.siteKey,
          secretKey: userConfig.captcha.google.secretKey || ConfigLoader.DEFAULT_CONFIG.captcha.google!.secretKey,
          minScore: userConfig.captcha.google.minScore ?? ConfigLoader.DEFAULT_CONFIG.captcha.google!.minScore
        } : ConfigLoader.DEFAULT_CONFIG.captcha.google
      }
    };

    this.logger.debug('Merged config:', JSON.stringify(mergedConfig, null, 2));

    return mergedConfig;
  }

  /**
   * 合并服务器配置
   * @param userServers 用户配置的服务器
   * @returns 合并后的服务器配置
   */
  private mergeServerConfigs(userServers: Partial<ServerConfig>[]): ServerConfig[] {
    const defaultServer = ConfigLoader.DEFAULT_CONFIG.servers[0];
    
    return userServers.map(server => {
      // 确保 locations 存在且是数组
      if (!server.locations || !Array.isArray(server.locations)) {
        this.logger.warn(`Server ${server.name || 'unknown'} missing locations, using default location`);
        server.locations = defaultServer.locations;
      }

      return {
        name: server.name || defaultServer.name,
        listen: server.listen !== undefined ? server.listen : defaultServer.listen,
        serverName: server.serverName || [],
        locations: server.locations.map(location => ({
          path: location.path || '/',
          upstream: location.upstream,
          proxy_pass: location.proxy_pass,
          targets: location.targets,
          balancer: location.balancer || defaultServer.locations[0].balancer,
          healthCheck: location.healthCheck ? {
            ...ConfigLoader.DEFAULT_HEALTH_CHECK,
            ...location.healthCheck
          } : undefined,
          headers: location.headers,
          rateLimit: location.rateLimit,
          ipFilter: location.ipFilter,
          proxyTimeout: location.proxyTimeout,
          proxyBuffering: location.proxyBuffering,
          caching: location.caching
        })),
        healthCheck: server.healthCheck ? {
          ...ConfigLoader.DEFAULT_HEALTH_CHECK,
          ...server.healthCheck
        } : undefined,
        headers: server.headers,
        rateLimit: server.rateLimit,
        ipFilter: server.ipFilter,
        csrf: server.csrf
      } as ServerConfig;
    });
  }

  /**
   * 合并上游服务器组配置
   */
  private mergeUpstreamConfigs(userUpstreams: Config['upstreams']): Config['upstreams'] {
    const defaultUpstream = ConfigLoader.DEFAULT_CONFIG.upstreams[0];
    
    this.logger.debug('Merging upstreams:', {
      userUpstreams,
      defaultUpstream
    });

    const mergedUpstreams = userUpstreams.map(upstream => {
      // 合并 upstream 级别的 healthCheck
      const upstreamHealthCheck = upstream.healthCheck ? {
        ...ConfigLoader.DEFAULT_HEALTH_CHECK,
        ...upstream.healthCheck
      } : undefined;

      return {
        name: upstream.name,
        balancer: upstream.balancer || defaultUpstream.balancer,
        servers: upstream.servers.map(server => {
          // 合并 server 级别的 healthCheck，继承 upstream 级别的配置
          const serverHealthCheck = server.healthCheck ? {
            ...(upstreamHealthCheck || ConfigLoader.DEFAULT_HEALTH_CHECK),
            ...server.healthCheck
          } : upstreamHealthCheck;

          return {
            url: server.url,
            weight: server.weight || 1,
            backup: server.backup || false,
            down: server.down || false,
            healthCheck: serverHealthCheck
          };
        }),
        healthCheck: upstreamHealthCheck
      };
    });

    this.logger.debug('Merged upstreams:', mergedUpstreams);

    return mergedUpstreams;
  }

  /**
   * 开始监听配置文件变化
   */
  public watchConfig(): void {
    if (this.watcher) {
      this.stopWatching();
    }

    this.watcher = fs.watch(this.configPath, (eventType, filename) => {
      if (eventType === 'change') {
        this.logger.info(`检测到配置文件变化: ${filename}`);
        const newConfig = this.loadConfig();
        this.emit('configUpdated', newConfig);
      }
    });

    this.logger.info(`开始监听配置文件变化: ${this.configPath}`);
  }

  /**
   * 停止监听配置文件变化
   */
  public stopWatching(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
      this.logger.info(`停止监听配置文件变化: ${this.configPath}`);
    }
  }

  /**
   * 获取当前配置
   */
  public getCurrentConfig(): Config | null {
    return this.currentConfig;
  }

  /**
   * 解析配置文件内容
   * @param configData 配置文件内容
   * @returns 解析后的配置对象
   */
  private parseConfig(configData: string): Config {
    try {
      return JSON.parse(configData);
    } catch (error) {
      throw new Error(`Invalid JSON in config file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * 验证SSL配置
   */
  private async validateSSLConfig(ssl: SSLConfig): Promise<void> {
    if (!ssl.enabled) {
      return;
    }

    // 验证证书文件
    if (!ssl.cert || !ssl.key) {
      throw new Error('SSL enabled but certificate or key file not specified');
    }

    // 验证文件存在性
    const certPath = path.resolve(ssl.cert);
    const keyPath = path.resolve(ssl.key);

    if (!fs.existsSync(certPath)) {
      throw new Error(`SSL certificate file not found: ${certPath}`);
    }

    if (!fs.existsSync(keyPath)) {
      throw new Error(`SSL key file not found: ${keyPath}`);
    }

    try {
      // 验证证书和私钥是否匹配
      const cert = fs.readFileSync(certPath, 'utf8');
      const key = fs.readFileSync(keyPath, 'utf8');

      const certPem = crypto.createPublicKey(cert);
      const keyPem = crypto.createPrivateKey(key);

      // 创建测试上下文验证配置
      tls.createSecureContext({
        cert: cert,
        key: key,
        ciphers: ssl.ciphers?.join(':'),
        minVersion: ssl.protocols?.[0] as tls.SecureVersion,
        maxVersion: ssl.protocols?.[ssl.protocols.length - 1] as tls.SecureVersion
      });

      this.logger.info('SSL configuration validated successfully');
    } catch (error) {
      throw new Error(`Invalid SSL configuration: ${(error as Error).message}`);
    }

    // 验证DH参数文件
    if (ssl.dhparam) {
      const dhparamPath = path.resolve(ssl.dhparam);
      if (!fs.existsSync(dhparamPath)) {
        throw new Error(`DH parameters file not found: ${dhparamPath}`);
      }
    }

    // 验证客户端证书配置
    if (ssl.clientCertificate?.enabled) {
      if (!ssl.clientCertificate.path) {
        throw new Error('Client certificate CA path not specified');
      }
      const caPath = path.resolve(ssl.clientCertificate.path);
      if (!fs.existsSync(caPath)) {
        throw new Error(`Client certificate CA file not found: ${caPath}`);
      }
    }
  }

  /**
   * 合并SSL配置
   */
  private mergeSSLConfig(userSSL?: Partial<SSLConfig>): SSLConfig | undefined {
    if (!userSSL) {
      return undefined;
    }
  
    return {
      ...ConfigLoader.DEFAULT_SSL_CONFIG,
      ...userSSL,
      clientCertificate: userSSL.clientCertificate && {
        ...{
          enabled: false,
          verify: 'optional',
          path: ''
        },
        ...userSSL.clientCertificate
      }
    };
  }

  /**
   * 验证配置对象的有效性
   */
  private async validateConfig(config: Config): Promise<void> {
    // ��证 upstreams
    if (!config.upstreams || !Array.isArray(config.upstreams) || config.upstreams.length === 0) {
      throw new Error('Config must contain at least one upstream');
    }

    config.upstreams.forEach((upstream, index) => {
      if (!upstream.name) {
        throw new Error(`Upstream[${index}] must have a name`);
      }
      if (!upstream.servers || !Array.isArray(upstream.servers) || upstream.servers.length === 0) {
        throw new Error(`Upstream[${index}] must have at least one server`);
      }
      upstream.servers.forEach((server, serverIndex) => {
        if (!server.url) {
          throw new Error(`Upstream[${index}].servers[${serverIndex}] must have a url`);
        }
        try {
          new URL(server.url);
        } catch {
          throw new Error(`Invalid URL in Upstream[${index}].servers[${serverIndex}]: ${server.url}`);
        }
      });
    });

    if (!config.servers || !Array.isArray(config.servers) || config.servers.length === 0) {
      throw new Error('Config must contain at least one server in servers array');
    }

    // 创建一个 Set 来存储所有可用的 upstream 名称
    const upstreamNames = new Set(config.upstreams.map(u => u.name));

    // 验证 servers 配置
    config.servers.forEach((server, index) => {
      if (!server.locations || !Array.isArray(server.locations) || server.locations.length === 0) {
        throw new Error(`Server[${index}] must have at least one location`);
      }

      server.locations.forEach((location, locationIndex) => {
        if (!location.path) {
          throw new Error(`Server[${index}].locations[${locationIndex}] must have a path`);
        }

        // 验证 upstream 引用
        if (location.upstream && !upstreamNames.has(location.upstream)) {
          throw new Error(
            `Server[${index}].locations[${locationIndex}] references non-existent upstream "${location.upstream}". ` +
            `Available upstreams: ${Array.from(upstreamNames).join(', ')}`
          );
        }

        // 验证代理配置
        if (!location.targets && !location.upstream && !location.proxy_pass) {
          throw new Error(`Server[${index}].locations[${locationIndex}] must have either targets, upstream, or proxy_pass`);
        }

        if (location.targets) {
          if (!Array.isArray(location.targets) || location.targets.length === 0) {
            throw new Error(`Server[${index}].locations[${locationIndex}] must have at least one target`);
          }

          location.targets.forEach((target, targetIndex) => {
            if (!target.url) {
              throw new Error(`Server[${index}].locations[${locationIndex}].targets[${targetIndex}] must have a url`);
            }
            try {
              new URL(target.url);
            } catch {
              throw new Error(`Invalid URL in Server[${index}].locations[${locationIndex}].targets[${targetIndex}]: ${target.url}`);
            }
          });
        }
      });
    });

    // 验证SSL配置
    if (config.ssl) {
      await this.validateSSLConfig(config.ssl);
    }

    // 验证服务器SSL配置
    for (const server of config.servers) {
      if (server.ssl) {
        await this.validateSSLConfig(server.ssl);
      }
    }

    // 添加日志输出，帮助调试
    this.logger.debug('Config validation passed. Available upstreams:', Array.from(upstreamNames));
  }

  private async validateUpstreams(config: Config) {
    config.upstreams.forEach((upstream, index) => {
      // 如果 healthCheck 字段缺失，填充默认值
      if (!upstream.healthCheck) {
        upstream.healthCheck = { ...ConfigLoader.DEFAULT_HEALTH_CHECK };
      }

      // 只设置必要的默认值
      if (typeof upstream.healthCheck.enabled === 'undefined') {
        upstream.healthCheck.enabled = true;
      }

      // 如果代码要�� upstream.name 必须与 server.name 不重复，可在此做检查
      // if (config.servers.some(s => s.name === upstream.name)) {
      //   throw new Error(`Upstream name "${upstream.name}" conflicts with a server name!`);
      // }
    });
  }
}

/**
 * 创建配置加载器实例
 * @param configPath 配置文件路径
 * @param logger 日志记录器实例
 * @returns 配置加载器实例
 */
export function createConfigLoader(configPath: string, logger: Logger): ConfigLoader {
  return new ConfigLoader(configPath, logger);
}

// 这个实现包含以下主要特点：
// 配置加载和解析:
// 使用 fs.readFileSync 读取配置文件
// JSON 解析和验证
// 详细的错误处理和日志记录
// 配置验证:
// 验证所有必需的配置字段
// 验证服务器配置的完整性
// 验证 URL 格式
// 验证 SSL 证书文件存在性
// 热重载支持:
// 使用 fs.watch 监听配置文件变化
// 文件变化时自动重新加载
// 通过 EventEmitter 发送更新事件
// 类型安全:
// 完整的 TypeScript 类型支持
// 使用 types.ts 中定义的接口
// 错误处理:
// 详细的错误消息
// 使用 Winston logger 记录错误
// 优雅的错误传播
// 可扩展性:
// 支持添加新的配置验证规则
// 可以轻松扩展支持其他配置格式
