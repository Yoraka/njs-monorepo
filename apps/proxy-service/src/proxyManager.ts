import { ServerConfig, Config, LocationConfig, UpstreamConfig, UpstreamServer } from './types';
import { Request } from 'express';
import { HealthChecker } from './healthChecker';
import { Logger } from 'winston';
import { BalancerFactory } from './balancer/balancerFactory';
import { Balancer } from './balancer/balancer';
import { URL } from 'url';
import { Monitor } from './monitor';

/**
 * 代理管理器类
 * 负责管理代理中间件、负载均衡和请求转发
 */
export class ProxyManager {
  public readonly healthChecker: HealthChecker;
  private balancers: Map<string, Balancer> = new Map();
  private upstreamMap: Map<string, UpstreamConfig> = new Map();
  private logger: Logger;
  private config: Config;
  public readonly monitor?: Monitor;
  private backupMode: Map<string, boolean> = new Map();

  constructor(
    config: Config,
    healthChecker: HealthChecker,
    logger: Logger,
    monitor?: Monitor
  ) {
    this.healthChecker = healthChecker;
    this.logger = logger;
    this.monitor = monitor;
    this.config = config;
    this.initializeUpstreams();
    this.initializeBalancers();

    // 监听健���检查事件
    this.setupHealthCheckListeners();
  }

  /**
   * 初始化上游服务器组
   */
  private initializeUpstreams(): void {
    this.upstreamMap.clear();
    this.backupMode.clear();
    
    this.config.upstreams.forEach(upstream => {
      this.upstreamMap.set(upstream.name, upstream);
      this.backupMode.set(upstream.name, false);
      
      // 确保健康检查配置正确继承
      upstream.servers.forEach(server => {
        if (!server.healthCheck && upstream.healthCheck) {
          server.healthCheck = { ...upstream.healthCheck };
        }
      });
    });
  }

  /**
   * 初始化所有负载均衡器
   */
  private initializeBalancers(): void {
    this.balancers.clear();
    
    // 为每个 upstream 创建负载均衡器
    this.config.upstreams.forEach(upstream => {
      const balancer = BalancerFactory.createBalancer({
        balancer: upstream.balancer,
        targets: this.filterAvailableServers(upstream.servers, upstream.name)
      });
      this.balancers.set(upstream.name, balancer);
    });

    // 为直接配置 targets 的 location 创建负载均衡器
    this.config.servers.forEach(serverConfig => {
      serverConfig.locations.forEach(location => {
        if (location.targets) {
          const balancerKey = `${serverConfig.name}:${location.path}`;
          const balancer = BalancerFactory.createBalancer({
            balancer: location.balancer || 'round-robin',
            targets: this.filterAvailableServers(location.targets, balancerKey),
            path: location.path
          });
          this.balancers.set(balancerKey, balancer);
        }
      });
    });
  }

  /**
   * 过滤可用的服务器
   */
  private filterAvailableServers(servers: UpstreamServer[], upstreamName: string): UpstreamServer[] {
    const isInBackupMode = this.backupMode.get(upstreamName) || false;
    
    if (isInBackupMode) {
      // 在备份模式下，只返回可用的备份服务器
      return servers.filter(server => 
        server.backup && 
        !server.down && 
        this.healthChecker.getServerStatus(server.url)
      );
    }

    // 在正常模式下，只返回可用的主服务器
    const availablePrimary = servers.filter(server => 
      !server.backup && 
      !server.down && 
      this.healthChecker.getServerStatus(server.url)
    );

    // 如果没有可用的主服务器，切换到备份模式
    if (availablePrimary.length === 0) {
      this.backupMode.set(upstreamName, true);
      const availableBackup = servers.filter(server => 
        server.backup && 
        !server.down && 
        this.healthChecker.getServerStatus(server.url)
      );
      
      if (availableBackup.length > 0) {
        this.logger.info(`Switching to backup servers for ${upstreamName}`, {
          backupServers: availableBackup.map(s => s.url)
        });
        return availableBackup;
      }
    }

    return availablePrimary;
  }

  /**
   * 设置健康检查监听器
   */
  private setupHealthCheckListeners(): void {
    this.healthChecker.on('serverDown', (server) => {
      this.logger.warn(`Server ${server.url} is down, updating balancers`);
      this.handleServerStateChange(server, false);
    });

    this.healthChecker.on('serverUp', (server) => {
      this.logger.info(`Server ${server.url} is back online, updating balancers`);
      this.handleServerStateChange(server, true);
    });
  }

  /**
   * 处理服务器状态变化
   */
  private handleServerStateChange(changedServer: UpstreamServer, isUp: boolean): void {
    // 更新服务器状态
    changedServer.down = !isUp;
    
    this.logger.debug(`处理服务器状态变化`, {
      server: changedServer.url,
      isUp,
      isBackup: changedServer.backup,
      down: changedServer.down
    });

    // 检查是否需要切换模式
    this.upstreamMap.forEach((upstream, upstreamName) => {
      const isCurrentlyInBackupMode = this.backupMode.get(upstreamName);
      const hasServer = upstream.servers.some(s => s.url === changedServer.url);
      
      if (!hasServer) return;

      // 添加详细日志
      this.logger.debug(`检查上游服务器组状态`, {
        upstreamName,
        isCurrentlyInBackupMode,
        changedServerUrl: changedServer.url,
        isBackup: changedServer.backup,
        isUp
      });

      if (isUp && !changedServer.backup) {
        // 主服务器恢复时，立即切回主服务器模式
        if (isCurrentlyInBackupMode) {
          this.backupMode.set(upstreamName, false);
          this.logger.info(`主服务器恢复，切换回主服务器模式: ${upstreamName}`, {
            server: changedServer.url
          });
        }
      } else if (!isUp && !changedServer.backup && !isCurrentlyInBackupMode) {
        // 主服务器宕机时的处理逻辑保持不变
        const hasAvailablePrimary = upstream.servers.some(s => 
          !s.backup && !s.down && this.healthChecker.getServerStatus(s.url)
        );
        
        if (!hasAvailablePrimary) {
          const hasAvailableBackup = upstream.servers.some(s => 
            s.backup && !s.down && this.healthChecker.getServerStatus(s.url)
          );
          
          if (hasAvailableBackup) {
            this.backupMode.set(upstreamName, true);
            this.logger.info(`所有主服务器不可用，切换到备份服务器: ${upstreamName}`);
          }
        }
      }
    });

    // 更新所有负载均衡器
    this.updateBalancersForServerChange();
  }

  /**
   * 在服务器状态变化时更新负载均衡器
   */
  private updateBalancersForServerChange(): void {
    // 更新 upstream 的负载均衡器
    this.config.upstreams.forEach(upstream => {
      const balancer = this.balancers.get(upstream.name);
      if (balancer) {
        const availableServers = this.filterAvailableServers(upstream.servers, upstream.name);
        balancer.updateServers(availableServers);
      }
    });

    // 更新直接配置 targets 的 location 的负载均衡器
    this.config.servers.forEach(serverConfig => {
      serverConfig.locations.forEach(location => {
        if (location.targets) {
          const balancerKey = `${serverConfig.name}:${location.path}`;
          const balancer = this.balancers.get(balancerKey);
          if (balancer) {
            const availableServers = this.filterAvailableServers(location.targets, balancerKey);
            balancer.updateServers(availableServers);
          }
        }
      });
    });
  }

  /**
   * 获取目标服务器
   */
  public getTarget(serverConfig: ServerConfig, location: LocationConfig, req: Request): string {
    // 如果location直接指定了proxy_pass
    if (location.proxy_pass) {
      return this.normalizeTargetUrl(location.proxy_pass);
    }

    // 如果location引用了upstream
    if (location.upstream) {
      const balancer = this.balancers.get(location.upstream);
      if (!balancer) {
        throw new Error(`Upstream not found: ${location.upstream}`);
      }
      const server = balancer.getNextServer();
      if (!server) {
        throw new Error(`No available servers in upstream: ${location.upstream}`);
      }
      return this.normalizeTargetUrl(server.url);
    }

    // 向后兼容：如果直接配置了targets
    if (location.targets) {
      const balancerKey = `${serverConfig.name}:${location.path}`;
      const balancer = this.balancers.get(balancerKey);
      
      if (!balancer) {
        throw new Error(`No balancer found for location: ${location.path} in server ${serverConfig.name}`);
      }

      const server = balancer.getNextServer();
      if (!server) {
        throw new Error(`No available servers for location: ${location.path}`);
      }

      const targetUrl = this.normalizeTargetUrl(server.url);
      this.logger.debug(`Selected target server: ${targetUrl} for ${location.path}`, {
        isBackupMode: this.backupMode.get(balancerKey),
        serverUrl: server.url,
        isBackup: server.backup
      });
      return targetUrl;
    }

    throw new Error(`No proxy target specified for location: ${location.path}`);
  }

  /**
   * 规范化目标URL
   */
  private normalizeTargetUrl(url: string): string {
    try {
      return url.replace(/\/$/, '')
        .replace('localhost', '127.0.0.1')
        .replace('::1', '127.0.0.1');
    } catch (error) {
      this.logger.error(`Invalid target URL: ${url}`);
      throw error;
    }
  }

  /**
   * 检查目标服务器是否可用
   */
  private isServerAvailable(server: { url: string; down?: boolean }): boolean {
    return !server.down && this.healthChecker.getServerStatus(server.url);
  }

  /**
   * 获取服务器配置的统计信息
   */
  public getStats(): {
    upstreams: { [upstreamName: string]: {
      activeServers: number;
      totalServers: number;
      backupServers: number;
      isInBackupMode: boolean;
    }},
    servers: { [serverName: string]: { 
      [location: string]: {
        activeServers: number;
        totalServers: number;
        backupServers: number;
        isInBackupMode: boolean;
      }
    }}
  } {
    const stats: any = {
      upstreams: {},
      servers: {}
    };
    
    // 统计 upstream 信息
    this.config.upstreams.forEach(upstream => {
      const isInBackupMode = this.backupMode.get(upstream.name) || false;
      const activeServers = this.filterAvailableServers(upstream.servers, upstream.name).length;
      const backupServers = upstream.servers.filter(s => s.backup).length;
      
      stats.upstreams[upstream.name] = {
        activeServers,
        totalServers: upstream.servers.length,
        backupServers,
        isInBackupMode
      };
    });

    // 统计 server location 信息
    this.config.servers.forEach(server => {
      stats.servers[server.name] = {};
      server.locations.forEach(location => {
        if (location.targets) {
          const balancerKey = `${server.name}:${location.path}`;
          const isInBackupMode = this.backupMode.get(balancerKey) || false;
          const activeServers = this.filterAvailableServers(location.targets, balancerKey).length;
          const backupServers = location.targets.filter(s => s.backup).length;
          
          stats.servers[server.name][location.path] = {
            activeServers,
            totalServers: location.targets.length,
            backupServers,
            isInBackupMode
          };
        }
      });
    });

    return stats;
  }

  /**
   * 更新配置
   */
  public updateConfig(newConfig: Config): void {
    this.config = newConfig;
    this.initializeUpstreams();
    this.initializeBalancers();
    this.logger.info('Proxy manager configuration updated');
  }

  /**
   * 获取指定 upstream 的负载均衡器
   */
  public getUpstreamBalancer(upstreamName: string): Balancer | undefined {
    return this.balancers.get(upstreamName);
  }
}

/**
 * 创建代理管理器实例
 */
export function createProxyManager(
  config: Config,
  healthChecker: HealthChecker,
  logger: Logger,
  monitor?: Monitor
): ProxyManager {
  return new ProxyManager(config, healthChecker, logger, monitor);
}
