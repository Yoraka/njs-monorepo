import { createServer, ProxyServer } from './server';
import { createConfigLoader, ConfigLoader } from './configLoader';
import { setupLogger, updateLogger } from './logger';
import { createMonitor } from './monitor';
import { createHealthChecker } from './healthChecker';
import { ProxyManager } from './proxyManager';
import { Config, UpstreamServer, LoggingConfig, HealthCheckConfig } from './types';
import { Logger } from 'winston';
import * as path from 'path';
import { Server } from 'http';
import * as dotenv from 'dotenv';

// 加载环境变量
dotenv.config({
  path: path.resolve(process.cwd(), '.env')
});

// 默认配置路径
const DEFAULT_CONFIG_PATH = path.join(process.cwd(), 'config', 'config.json');

class ProxyApplication {
  private servers: Map<string, ProxyServer> = new Map();
  private configLoader: ConfigLoader;
  private logger: Logger;
  private monitor: any; // Monitor实例
  private healthChecker: any; // HealthChecker实例
  private proxyManager: ProxyManager;
  private config: Config;

  constructor(configPath?: string) {
    // 初始化配置加载器，使用环境变量或默认路径
    this.configLoader = createConfigLoader(
      configPath || process.env.PROXY_CONFIG_PATH || DEFAULT_CONFIG_PATH,
      console as any
    );
    
    // 加载初始配置
    this.config = this.configLoader.loadConfig();
    
    // 初始化日志记录器，使用默认配置如果没有指定
    const loggingConfig: LoggingConfig = this.config.logging || {
      level: 'info',
      file: 'logs/access.log'
    };
    this.logger = setupLogger(loggingConfig);
    
    // 初始化健康检查器
    this.healthChecker = createHealthChecker(
      this.getAllUpstreamServers(),
      this.getDefaultHealthCheckConfig(),
      this.logger
    );

    // 如果启用了监控，先创建 monitor
    if (this.config.monitoring?.enabled) {
      this.monitor = createMonitor(
        this.config,
        this.logger
      );
    }

    // 初始化代理管理器，传入 monitor
    this.proxyManager = new ProxyManager(
      this.config,
      this.healthChecker,
      this.logger,
      this.monitor  // 传入 monitor 实例
    );

    // 设置配置热重载
    this.setupHotReload();

    // 设置进程退出处理
    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());
  }

  /**
   * 获取所有上游服务器列表
   */
  private getAllUpstreamServers(): UpstreamServer[] {
    const servers: UpstreamServer[] = [];
    const seen = new Map<string, string>(); // url -> upstream name

    // 从 upstreams 中收集服务器
    this.config.upstreams.forEach(upstream => {
      upstream.servers.forEach(server => {
        const existingUpstream = seen.get(server.url);
        if (existingUpstream && existingUpstream !== upstream.name) {
          this.logger.warn(`服务器 ${server.url} 在多个 upstream 中被定义: ${existingUpstream}, ${upstream.name}`);
          return; // 跳过重复的服务器
        }
        
        if (!seen.has(server.url)) {
          seen.set(server.url, upstream.name);
          // 继承 upstream 的健康检查配置
          if (!server.healthCheck && upstream.healthCheck) {
            server.healthCheck = { ...upstream.healthCheck };
          }
          // 添加 upstream 归属信息
          servers.push({
            ...server,
            _upstream: upstream.name // 添加内部标记，用于追踪服务器归属
          });
        }
      });
    });

    // 从每个 location 中收集 targets
    this.config.servers.forEach(serverConfig => {
      serverConfig.locations.forEach(location => {
        if (location.targets) {
          location.targets.forEach(server => {
            const existingUpstream = seen.get(server.url);
            if (existingUpstream) {
              this.logger.warn(`服务器 ${server.url} 已在 upstream ${existingUpstream} 中定义，跳过 location target`);
              return;
            }

            if (!seen.has(server.url)) {
              seen.set(server.url, `${serverConfig.name}:${location.path}`);
              // 继承 location 的健康检查配置
              if (!server.healthCheck && location.healthCheck) {
                server.healthCheck = { ...location.healthCheck };
              }
              // 如果 location 没有配置，继承 server 的健康检查配置
              if (!server.healthCheck && serverConfig.healthCheck) {
                server.healthCheck = { ...serverConfig.healthCheck };
              }
              // 添加 location 归属信息
              servers.push({
                ...server,
                _location: `${serverConfig.name}:${location.path}` // 添加内部标记，用于追踪服务器归属
              });
            }
          });
        }
      });
    });

    this.logger.debug('收集到的服务器列表:', {
      servers: servers.map(s => ({
        url: s.url,
        upstream: (s as any)._upstream,
        location: (s as any)._location
      }))
    });

    return servers;
  }

  /**
   * 获取默认的健康检查配置
   */
  private getDefaultHealthCheckConfig(): HealthCheckConfig {
    // 首先尝试使用第一个 upstream 的配置
    const firstUpstream = this.config.upstreams[0];
    if (firstUpstream?.healthCheck) {
      return firstUpstream.healthCheck;
    }

    // 然后尝试使用第一个服务器的配置
    const firstServer = this.config.servers[0];
    if (firstServer?.healthCheck) {
      return firstServer.healthCheck;
    }

    // 最后使用默认配置
    return {
      enabled: true,
      type: 'http',
      path: '/',
      interval: 1000,
      timeout: 1000,
      retries: 1,
      expectedStatus: [200, 301, 302, 404]
    };
  }

  /**
   * 设置配置热重载
   */
  private async setupHotReload(): Promise<void> {
    this.configLoader.on('configUpdated', async (newConfig: Config) => {
      try {
        this.logger.info('检测到配置文件更改，开始热重载...');

        // 停止健康检查器
        this.healthChecker.stop();

        // 新配置
        this.config = newConfig;

        // 更新日志配置
        if (newConfig.logging) {
          updateLogger(this.logger, newConfig.logging);
        }

        // 更新健康检查器
        this.healthChecker.updateConfig(
          this.getAllUpstreamServers(),
          this.getDefaultHealthCheckConfig()
        );

        // 重新启动健康检查器
        this.healthChecker.start();

        // 更新代理管理器
        await this.proxyManager.updateConfig(newConfig);

        // 处理监控配置更新
        if (newConfig.monitoring?.enabled) {
          if (!this.monitor) {
            // 如果之前没有启用监控，现在启用了，创建新的 monitor
            this.monitor = createMonitor(newConfig, this.logger);
            this.monitor.start();
          } else {
            // 更新现有的 monitor
            await this.monitor.updateConfig(newConfig);
          }
        } else if (this.monitor) {
          // 如果之前启用了监控，现在禁用了，关闭 monitor
          await this.monitor.shutdown();
          this.monitor = null;
        }

        // 更新所有服务器配置
        const currentServers = new Set(this.servers.keys());
        const newServers = new Set(newConfig.servers.map(s => s.name));

        // 停止已删除的服务器
        for (const serverName of currentServers) {
          if (!newServers.has(serverName)) {
            const server = this.servers.get(serverName);
            if (server) {
              await server.stop();
              this.servers.delete(serverName);
              this.logger.info(`服务器 ${serverName} 已停止并移除`);
            }
          }
        }

        // 更新或创建服务器
        for (const serverConfig of newConfig.servers) {
          const serverSpecificConfig: Config = {
            ...newConfig,
            servers: [serverConfig],
          };

          if (this.servers.has(serverConfig.name)) {
            // 更新现有服务器
            const server = this.servers.get(serverConfig.name);
            await server?.updateConfig(serverSpecificConfig);
            this.logger.info(`服务器 ${serverConfig.name} 配置已更新`);
          } else {
            // 创建新服务器
            const server = createServer(serverSpecificConfig, this.proxyManager, this.logger);
            this.servers.set(serverConfig.name, server);
            await server.start();
            this.logger.info(`新服务器 ${serverConfig.name} 已创建并启动`);
          }
        }

        this.logger.info('配置热重载完成');
      } catch (error) {
        this.logger.error('配置热重载失败:', error);
        // 在重载失败时不要退出进程，保持服务继续运行
      }
    });

    // 启动配置文件监听
    this.configLoader.watchConfig();
  }

  /**
   * 启动应用
   */
  public async start(): Promise<void> {
    try {
      // 为每个服务器配置创建并启动独立的服务器实例
      for (const serverConfig of this.config.servers) {
        // 创建该服务器的配置副本
        const serverSpecificConfig: Config = {
          ...this.config,
          servers: [serverConfig], // 只包含当前服务器的配置
        };

        // 创建服务器实例
        const server = createServer(
          serverSpecificConfig,
          this.proxyManager,
          this.logger
        );

        // 存储服务器实例
        this.servers.set(serverConfig.name, server);

        // 启动服务器
        await server.start();
        this.logger.info(`服务器 ${serverConfig.name} 启动成功，监听端口 ${serverConfig.listen}`);
      }

      // 启动健康检查
      this.healthChecker.start();

      // 如果启用了监控，启动 monitor
      if (this.monitor) {
        this.monitor.start();
      }

      this.logger.info('所有代理服务器启动成功');

      // 优雅退出处理
      this.setupGracefulShutdown();

    } catch (error) {
      this.logger.error('服务器启动失败:', error);
      throw error;
    }
  }

  /**
   * 设置优雅退出
   */
  private setupGracefulShutdown(): void {
    const shutdown = async () => {
      this.logger.info('正在关闭服务器...');

      try {
        // 停止配置文件监听
        this.configLoader.stopWatching();

        // 停止监控
        if (this.monitor) {
          await this.monitor.shutdown();
          this.monitor = null;
        }

        // 停止健康检查
        if (this.healthChecker) {
          this.healthChecker.stop();
        }

        // 停止所有服务器
        for (const [serverName, server] of this.servers) {
          await server.stop();
          this.logger.info(`服务器 ${serverName} 已安全关闭`);
        }
        this.servers.clear();

        this.logger.info('所有服务器已安全关闭');
        process.exit(0);
      } catch (error) {
        this.logger.error('服务器关闭过程中出错:', error);
        process.exit(1);
      }
    };

    // 监听退出信号
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
    
    // 处理未捕获的异常
    process.on('uncaughtException', (error) => {
      this.logger.error('未捕获的异常:', error);
      shutdown();
    });
    
    // 处理未处理的 Promise 拒绝
    process.on('unhandledRejection', (reason, promise) => {
      this.logger.error('未处理的 Promise 拒绝:', reason);
      shutdown();
    });
  }

  private async shutdown(): Promise<void> {
    this.logger.info('正在关闭应用程序...');
    
    // 停止监控系统
    if (this.monitor) {
      this.monitor.stop();
    }
    
    // 关闭所有服务器
    for (const [serverName, server] of this.servers) {
      await server.stop();
      this.logger.info(`服务器 ${serverName} 已关闭`);
    }
    this.servers.clear();
    
    // 等待所有日志写入完成
    await new Promise(resolve => setTimeout(resolve, 100));
    
    process.exit(0);
  }
}

/**
 * 主函数
 */
async function main() {
  try {
    // 从环境变量获取配置文件路径，如果没有则使用默认路径
    const configPath = process.env.PROXY_CONFIG_PATH || path.join(process.cwd(), 'config', 'config.json');
    const app = new ProxyApplication(configPath);
    await app.start();
  } catch (error) {
    console.error('程序启动失败:', error);
    process.exit(1);
  }
}

// 启动应用
if (require.main === module) {
  main();
}

// 只导出一次
export { ProxyApplication };
