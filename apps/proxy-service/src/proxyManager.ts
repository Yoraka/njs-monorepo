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

    // 监听健康检查事件
    this.setupHealthCheckListeners();
  }

  /**
   * 初始化上游服务器组
   */
  private initializeUpstreams(): void {
    this.upstreamMap.clear();
    this.backupMode.clear();
    
    this.config.upstreams.forEach(upstream => {
      // 为每个服务器添加归属信息
      const serversWithOwnership = upstream.servers.map(server => ({
        ...server,
        _upstream: upstream.name
      }));

      // 更新 upstream 配置
      const upstreamWithOwnership = {
        ...upstream,
        servers: serversWithOwnership
      };
      
      this.upstreamMap.set(upstream.name, upstreamWithOwnership);
      this.backupMode.set(upstream.name, false);
      
      // 确保健康检查配置正确继承
      upstreamWithOwnership.servers.forEach(server => {
        if (!server.healthCheck && upstream.healthCheck) {
          server.healthCheck = { ...upstream.healthCheck };
        }
      });
    });

    // 为每个 location 的 targets 添加归属信息
    this.config.servers.forEach(serverConfig => {
      serverConfig.locations.forEach(location => {
        if (location.targets) {
          location.targets = location.targets.map(server => ({
            ...server,
            _location: `${serverConfig.name}:${location.path}`
          }));
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
    this.upstreamMap.forEach((upstream, upstreamName) => {
      const availableServers = this.filterAvailableServers(upstream.servers, upstreamName);
      this.logger.warn(`初始化 upstream 负载均衡器`, {
        upstreamName,
        availableServers: availableServers.map(s => s.url),
        totalServers: upstream.servers.length
      });

      const balancer = BalancerFactory.createBalancer({
        balancer: upstream.balancer,
        targets: availableServers,
        logger: this.logger
      });
      this.balancers.set(upstreamName, balancer);
    });

    // 为直接配置 targets 的 location 创建负载均衡器
    this.config.servers.forEach(serverConfig => {
      serverConfig.locations.forEach(location => {
        if (location.targets) {
          const balancerKey = `${serverConfig.name}:${location.path}`;
          // 确保 targets 有正确的归属信息
          const targetsWithOwnership = location.targets.map(server => ({
            ...server,
            _location: balancerKey
          }));
          const availableServers = this.filterAvailableServers(targetsWithOwnership, balancerKey);
          
          this.logger.warn(`初始化 location 负载均衡器`, {
            serverName: serverConfig.name,
            path: location.path,
            availableServers: availableServers.map(s => s.url),
            totalServers: location.targets.length
          });

          const balancer = BalancerFactory.createBalancer({
            balancer: location.balancer || 'round-robin',
            targets: availableServers,
            path: location.path,
            logger: this.logger
          });
          this.balancers.set(balancerKey, balancer);
        }
      });
    });

    // 记录所有初始化的负载均衡器
    this.logger.debug(`已初始化的负载均衡器`, {
      balancers: Array.from(this.balancers.keys())
    });
  }

  /**
   * 过滤可用的服务器
   */
  private filterAvailableServers(servers: UpstreamServer[], upstreamName: string): UpstreamServer[] {
    const isInBackupMode = this.backupMode.get(upstreamName) || false;
    
    // 只处理属于当前 upstream 的服务器
    const upstreamServers = servers.filter(server => {
      // 如果是 location 的 targets，检查 _location
      if (server._location) {
        return server._location === upstreamName;
      }
      // 如果是 upstream 的 servers，检查 _upstream
      return server._upstream === upstreamName;
    });

    this.logger.warn(`过滤可用服务器`, {
      upstreamName,
      isInBackupMode,
      totalServers: upstreamServers.length,
      servers: upstreamServers.map(s => ({
        url: s.url,
        backup: s.backup,
        down: s.down,
        _upstream: s._upstream,
        _location: s._location,
        status: this.healthChecker.getServerStatus(s.url)
      }))
    });

    // 先尝试获取主服务器
    const availablePrimary = upstreamServers.filter(server => 
      !server.backup && 
      !server.down && 
      this.healthChecker.getServerStatus(server.url)
    );

    this.logger.warn(`可用的主服务器`, {
      upstreamName,
      count: availablePrimary.length,
      servers: availablePrimary.map(s => ({
        url: s.url,
        _upstream: s._upstream,
        _location: s._location
      }))
    });

    // 如果有可用的主服务器，直接返回
    if (availablePrimary.length > 0) {
      this.backupMode.set(upstreamName, false); // 确保退出备份模式
      return availablePrimary;
    }

    // 如果没有可用的主服务器，尝试使用备份服务器
    const availableBackup = upstreamServers.filter(server => 
      server.backup && 
      !server.down && 
      this.healthChecker.getServerStatus(server.url)
    );

    this.logger.warn(`可用的备份服务器`, {
      upstreamName,
      count: availableBackup.length,
      servers: availableBackup.map(s => ({
        url: s.url,
        _upstream: s._upstream,
        _location: s._location
      }))
    });

    if (availableBackup.length > 0) {
      this.backupMode.set(upstreamName, true);
      return availableBackup;
    }

    // 如果既没有可用的主服务器也没有可用的备份服务器，返回空数组
    this.logger.warn(`${upstreamName} 没有可用的服务器`);
    return [];
  }

  /**
   * 设置健康检查监听器
   */
  private setupHealthCheckListeners(): void {
    this.healthChecker.on('serverDown', (server) => {
      this.logger.info(`Server ${server.url} is down, updating balancers`);
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

    // 找出这个服务器属于哪些 upstream 组
    const affectedUpstreams = Array.from(this.upstreamMap.entries())
      .filter(([_, upstream]) => 
        upstream.servers.some(s => s.url === changedServer.url)
      );

    this.logger.debug(`受影响的上游服务器组`, {
      server: changedServer.url,
      affectedUpstreams: affectedUpstreams.map(([name]) => name)
    });

    // 只处理受影响的 upstream 组
    affectedUpstreams.forEach(([upstreamName, upstream]) => {
      const isCurrentlyInBackupMode = this.backupMode.get(upstreamName);
      
      this.logger.debug(`检查上游服务器组状态`, {
        upstreamName,
        isCurrentlyInBackupMode,
        changedServerUrl: changedServer.url,
        isBackup: changedServer.backup,
        isUp
      });

      if (isUp && !changedServer.backup && isCurrentlyInBackupMode) {
        const hasAvailablePrimary = upstream.servers.some(s =>
          !s.backup && !s.down && this.healthChecker.getServerStatus(s.url)
        );
        if (hasAvailablePrimary) {
          this.backupMode.set(upstreamName, false);
          this.logger.info(`主服务器恢复，切回主服务器模式: ${upstreamName}`);
        }
      } else if (!isUp && !changedServer.backup && !isCurrentlyInBackupMode) {
        // 主服务器宕机时，只检查前 upstream 组是否需要切换到备份模式
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

      // 只更新受影响的负载均衡器
      const balancer = this.balancers.get(upstreamName);
      if (balancer) {
        const availableServers = this.filterAvailableServers(upstream.servers, upstreamName);
        this.logger.debug(`更新负载均衡器`, {
          upstreamName,
          availableServers: availableServers.map(s => s.url),
          backupMode: this.backupMode.get(upstreamName)
        });
        balancer.updateServers(availableServers);
      }
    });
  }

  /**
   * 在服务器状态变化时更新负载均衡器
   */
  private updateBalancersForServerChange(): void {
    // 不再需要这个方法，因为在 handleServerStateChange 中已经更新了受影响的负载均衡器
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
      const balancer = this.getUpstreamBalancer(location.upstream);
      if (!balancer) {
        throw new Error(`Upstream not found: ${location.upstream}`);
      }

      const server = balancer.getNextServer();
      if (!server) {
        throw new Error(`Failed to get next server from upstream: ${location.upstream}`);
      }

      this.logger.debug(`Selected target server for upstream ${location.upstream}:`, {
        server: server.url,
        isBackup: server.backup,
        isBackupMode: this.backupMode.get(location.upstream)
      });

      return this.normalizeTargetUrl(server.url);
    }

    // 如果直接配置了targets
    if (location.targets) {
      const balancerKey = `${serverConfig.name}:${location.path}`;
      const balancer = this.balancers.get(balancerKey);
      
      if (!balancer) {
        throw new Error(`No balancer found for location: ${location.path} in server ${serverConfig.name}`);
      }

      // 使用 getUpstreamBalancer 的逻辑来处理 targets
      const availableServers = this.filterAvailableServers(location.targets, balancerKey);
      const currentServer = balancer.getCurrentServer();
      
      if (!currentServer || 
          !availableServers.find(s => s.url === currentServer.url) ||
          balancer.getAvailableServers().length !== availableServers.length) {
        this.logger.warn(`更新负载均衡器服务器列表`, {
          balancerKey,
          availableServers: availableServers.map(s => s.url)
        });
        balancer.updateServers(availableServers);
      }

      const server = balancer.getNextServer();
      if (!server) {
        throw new Error(`Failed to get next server for location: ${location.path}`);
      }

      const targetUrl = this.normalizeTargetUrl(server.url);
      this.logger.debug(`Selected target server for location ${location.path}:`, {
        server: targetUrl,
        isBackup: server.backup,
        isBackupMode: this.backupMode.get(balancerKey)
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
    // 确保 upstream 存在
    if (!this.upstreamMap.has(upstreamName)) {
      this.logger.error(`尝试获取不存在的 upstream 的负载均衡器: ${upstreamName}`);
      return undefined;
    }

    // 获取 balancer
    const balancer = this.balancers.get(upstreamName);
    if (!balancer) {
      this.logger.error(`upstream ${upstreamName} 的负载均衡器未初始化`);
      return undefined;
    }

    // 只在服务器状态发生变化时更新服务器列表
    const upstream = this.upstreamMap.get(upstreamName)!;
    const availableServers = this.filterAvailableServers(upstream.servers, upstreamName);
    const currentServer = balancer.getCurrentServer();
    
    // 只在以下情况更新服务器列表：
    // 1. 当前没有服务器
    // 2. 当前服务器不在可用服务器列表中
    // 3. 可用服务器数量发生变化
    if (!currentServer || 
        !availableServers.find(s => s.url === currentServer.url) ||
        balancer.getAvailableServers().length !== availableServers.length) {
      this.logger.warn(`更新负载均衡器服务器列表`, {
        upstreamName,
        availableServers: availableServers.map(s => s.url)
      });
      balancer.updateServers(availableServers);
    }

    return balancer;
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
