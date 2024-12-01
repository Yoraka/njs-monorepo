import { createServer, ProxyServer } from './server';
import { createConfigLoader, ConfigLoader } from './configLoader';
import { setupLogger, updateLogger } from './logger';
import { createMonitor } from './monitor';
import { createHealthChecker } from './healthChecker';
import { ProxyManager } from './proxyManager';
import { Config, UpstreamServer } from './types';
import { Logger } from 'winston';
import * as path from 'path';
import { Server } from 'http';

class ProxyApplication {
  private server: ProxyServer | null = null;
  private configLoader: ConfigLoader;
  private logger: Logger;
  private monitor: any; // Monitor实例
  private healthChecker: any; // HealthChecker实例
  private proxyManager: ProxyManager;
  private config: Config;

  constructor(configPath: string) {
    // 初始化配置加载器
    this.configLoader = createConfigLoader(configPath, console as any);
    
    // 加载初始配置
    this.config = this.configLoader.loadConfig();
    
    // 初始化日志记录器
    this.logger = setupLogger(this.config.logging);
    
    // 初始化健康检查器
    this.healthChecker = createHealthChecker(
      this.getAllUpstreamServers(),
      this.config.servers[0].healthCheck!, // 假设至少有一个服务器配置
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
  }

  /**
   * 获取所有上游服务器列表
   */
  private getAllUpstreamServers(): UpstreamServer[] {
    return this.config.servers.reduce<UpstreamServer[]>((servers, serverConfig) => {
      // 从每个 location 中收集 targets
      const locationTargets = serverConfig.locations.reduce<UpstreamServer[]>(
        (targets, location) => [...targets, ...(location.targets || [])],
        []
      );
      return [...servers, ...locationTargets];
    }, []);
  }

  /**
   * 设置配置热重载
   */
  private setupHotReload(): void {
    this.configLoader.on('configUpdated', async (newConfig: Config) => {
      try {
        this.logger.info('检测到配置文件更改，开始热重载...');

        // 更新配置
        this.config = newConfig;

        // 更新日志配置
        updateLogger(this.logger, newConfig.logging);

        // 更新健康检查器
        this.healthChecker.updateConfig(
          this.getAllUpstreamServers(),
          newConfig.servers[0].healthCheck!
        );

        // 更新代理管理器
        this.proxyManager.updateConfig(newConfig);

        // 更新监控配置
        if (this.monitor) {
          this.monitor.updateConfig(newConfig);
        }

        // 更新服务器配置
        if (this.server) {
          await this.server.updateConfig(newConfig);
        }

        this.logger.info('配置热重载完成');
      } catch (error) {
        this.logger.error('配置热重载失败:', error);
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
      // 创建并启动服务器
      this.server = createServer(
        this.config,
        this.proxyManager,
        this.logger
      );

      // 启动健康检查
      this.healthChecker.start();

      // 如果启用了监控，启动 monitor
      if (this.monitor) {
        this.monitor.start();
      }

      // 启动服务器
      await this.server.start();

      this.logger.info('代理服务器启动成功');

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

      // 停止监控
      if (this.monitor) {
        this.monitor.stop();
      }

      // 停止健康检查
      this.healthChecker.stop();

      // 停止服务器
      if (this.server) {
        await this.server.stop();
      }

      this.logger.info('服务器已安全关闭');
      process.exit(0);
    };

    // 监听退出信号
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  }
}

/**
 * 主函数
 */
async function main() {
  try {
    const configPath = path.resolve(process.cwd(), 'config/config.json');
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

export { ProxyApplication };
