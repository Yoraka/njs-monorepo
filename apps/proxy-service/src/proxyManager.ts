import { ServerConfig, Config, LocationConfig, UpstreamConfig } from './types';
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
  private balancers: Map<string, Balancer> = new Map();
  private upstreamMap: Map<string, UpstreamConfig> = new Map();
  private healthChecker: HealthChecker;
  private logger: Logger;
  private config: Config;
  public monitor?: Monitor;

  constructor(
    config: Config,
    healthChecker: HealthChecker,
    logger: Logger,
    monitor?: Monitor
  ) {
    this.config = config;
    this.healthChecker = healthChecker;
    this.logger = logger;
    this.monitor = monitor;
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
    this.config.upstreams.forEach(upstream => {
      this.upstreamMap.set(upstream.name, upstream);
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
        targets: upstream.servers
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
            targets: location.targets,
            path: location.path
          });
          this.balancers.set(balancerKey, balancer);
        }
      });
    });
  }

  /**
   * 设置健康检查监听器
   */
  private setupHealthCheckListeners(): void {
    this.healthChecker.on('serverDown', (server) => {
      this.logger.warn(`Server ${server.url} is down, updating balancers`);
      this.updateBalancersForServerChange();
    });

    this.healthChecker.on('serverUp', (server) => {
      this.logger.info(`Server ${server.url} is back online, updating balancers`);
      this.updateBalancersForServerChange();
    });
  }

  /**
   * 在服务器状态变化时更新负载均衡器
   */
  private updateBalancersForServerChange(): void {
    // 更新 upstream 的负载均衡器
    this.config.upstreams.forEach(upstream => {
      const balancer = this.balancers.get(upstream.name);
      if (balancer) {
        balancer.updateServers(upstream.servers);
      }
    });

    // 更新直接配置 targets 的 location 的负载均衡器
    this.config.servers.forEach(serverConfig => {
      serverConfig.locations.forEach(location => {
        if (location.targets) {
          const balancerKey = `${serverConfig.name}:${location.path}`;
          const balancer = this.balancers.get(balancerKey);
          if (balancer) {
            balancer.updateServers(location.targets);
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

      // 获取下一个可用的服务器
      const server = balancer.getNextServer();
      if (!server) {
        // 如果没有可用的服务器，尝试使用备份服务器
        const backupServer = this.findAvailableBackupServer(location);
        if (backupServer) {
          this.logger.info(`Using backup server: ${backupServer.url} for ${location.path}`);
          return this.normalizeTargetUrl(backupServer.url);
        }
        throw new Error(`No available servers for location: ${location.path}`);
      }

      const targetUrl = this.normalizeTargetUrl(server.url);
      this.logger.debug(`Selected target server: ${targetUrl} for ${location.path}`);
      return targetUrl;
    }

    throw new Error(`No proxy target specified for location: ${location.path}`);
  }

  /**
   * 查找可用的备份服务器
   */
  private findAvailableBackupServer(location: LocationConfig): { url: string } | null {
    // 如果是直接配置的 targets
    if (location.targets) {
      return location.targets.find(server => 
        server.backup && 
        !server.down && 
        this.healthChecker.getServerStatus(server.url)
      ) || null;
    }
    
    // 如果引用了 upstream
    if (location.upstream) {
      const upstream = this.config.upstreams.find(u => u.name === location.upstream);
      if (!upstream) {
        return null;
      }
      
      return upstream.servers.find(server => 
        server.backup && 
        !server.down && 
        this.healthChecker.getServerStatus(server.url)
      ) || null;
    }

    return null;
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
    }},
    servers: { [serverName: string]: { 
      [location: string]: {
        activeServers: number;
        totalServers: number;
        backupServers: number;
      }
    }}
  } {
    const stats: any = {
      upstreams: {},
      servers: {}
    };
    
    // 统计 upstream 信息
    this.config.upstreams.forEach(upstream => {
      const activeServers = upstream.servers.filter(
        server => this.isServerAvailable(server) && !server.backup
      ).length;

      const backupServers = upstream.servers.filter(
        server => this.isServerAvailable(server) && server.backup
      ).length;

      stats.upstreams[upstream.name] = {
        activeServers,
        totalServers: upstream.servers.length,
        backupServers
      };
    });
    
    // 统计 server location 信息
    this.config.servers.forEach(serverConfig => {
      stats.servers[serverConfig.name] = {};
      
      serverConfig.locations.forEach(location => {
        if (location.targets) {
          // 处理直接配置的 targets
          const activeServers = location.targets.filter(
            server => this.isServerAvailable(server) && !server.backup
          ).length;

          const backupServers = location.targets.filter(
            server => this.isServerAvailable(server) && server.backup
          ).length;

          stats.servers[serverConfig.name][location.path] = {
            activeServers,
            totalServers: location.targets.length,
            backupServers
          };
        } else if (location.upstream) {
          // 引用 upstream 的情况，复用 upstream 的统计信息
          const upstreamStats = stats.upstreams[location.upstream];
          if (upstreamStats) {
            stats.servers[serverConfig.name][location.path] = { ...upstreamStats };
          }
        } else if (location.proxy_pass) {
          // 直接 proxy_pass 的情况
          stats.servers[serverConfig.name][location.path] = {
            activeServers: 1,
            totalServers: 1,
            backupServers: 0
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
