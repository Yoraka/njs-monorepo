import { BaseBalancer } from './balancer';
import { UpstreamServer } from '../types';
import { Logger } from 'winston';

interface ServerWeight {
  server: UpstreamServer;
  currentWeight: number;
  effectiveWeight: number;
}

/**
 * 轮询负载均衡器
 * 按照权重顺序循环选择可用的上游服务器
 */
export class RoundRobinBalancer extends BaseBalancer {
  private serverWeights: Map<string, ServerWeight> = new Map();
  private currentServer: UpstreamServer | null = null;
  private logger: Logger;

  constructor(servers: UpstreamServer[], logger: Logger) {
    super(servers);
    this.logger = logger;
    this.initializeWeights();
    this.logger.info('初始化负载均衡器', {
      serversCount: servers.length,
      servers: servers.map(s => s.url)
    });
  }

  /**
   * 获取当前正在使用的服务器
   * @returns 返回当前服务器，如果没有则返回 null
   */
  public getCurrentServer(): UpstreamServer | null {
    return this.currentServer;
  }

  /**
   * 获取下一个可用的上游服务器
   * 实现加权轮询算法
   * @returns 返回下一个可用的服务器，如果没有可用服务器则返回 null
   */
  public getNextServer(): UpstreamServer | null {
    // 获取可用的服务器列表
    const availableServers = this.getAvailableServers();
    
    this.logger.info('获取可用服务器列表', {
      availableCount: availableServers.length,
      availableServers: availableServers.map(s => s.url),
      totalServers: this.servers.length
    });

    // 如果没有可用服务器，尝试使用备用服务器
    if (availableServers.length === 0) {
      this.currentServer = this.tryGetBackupServer();
      this.logger.info('没有可用服务器，尝试使用备用服务器', {
        backupServer: this.currentServer?.url
      });
      return this.currentServer;
    }

    // 如果只有一个可用服务器，直接返回
    if (availableServers.length === 1) {
      this.currentServer = availableServers[0];
      this.logger.info('只有一个可用服务器', {
        server: this.currentServer.url
      });
      return this.currentServer;
    }

    // 使用加权轮询算法选择服务器
    const server = this.getNextWeightedServer(availableServers);
    this.currentServer = server;
    this.logger.info('选择下一个服务器', {
      selectedServer: server.url,
      weights: Array.from(this.serverWeights.values()).map(sw => ({
        url: sw.server.url,
        currentWeight: sw.currentWeight
      }))
    });
    return server;
  }

  /**
   * 更新服务器列表
   * @param servers 新的服务器列表
   */
  public updateServers(servers: UpstreamServer[]): void {
    super.updateServers(servers);
    this.currentServer = null;
    this.initializeWeights();
  }

  /**
   * 初始化权重相关的计算
   */
  private initializeWeights(): void {
    this.serverWeights.clear();
    this.servers.forEach(server => {
      this.serverWeights.set(server.url, {
        server,
        currentWeight: 0,
        effectiveWeight: server.weight || 1
      });
    });
  }

  /**
   * 使用加权轮询算法选择下一个服务器
   * 实现平滑的加权轮询
   * @param servers 可用的服务器列表
   * @returns 选中的服务器
   */
  private getNextWeightedServer(servers: UpstreamServer[]): UpstreamServer {
    // 更新当前权重
    let totalWeight = 0;
    servers.forEach(server => {
      const weight = this.serverWeights.get(server.url)!;
      weight.currentWeight += weight.effectiveWeight;
      totalWeight += weight.effectiveWeight;
    });

    this.logger.warn('更新服务器权重', {
      weights: Array.from(this.serverWeights.values()).map(sw => ({
        url: sw.server.url,
        currentWeight: sw.currentWeight,
        effectiveWeight: sw.effectiveWeight
      }))
    });

    // 找到当前权重最大的服务器
    let maxWeightServer = this.serverWeights.get(servers[0].url)!;
    servers.forEach(server => {
      const weight = this.serverWeights.get(server.url)!;
      if (weight.currentWeight > maxWeightServer.currentWeight) {
        maxWeightServer = weight;
      }
    });

    // 选中的服务器权重减去总权重
    maxWeightServer.currentWeight -= totalWeight;

    this.logger.warn('选择权重最大的服务器', {
      selectedServer: maxWeightServer.server.url,
      selectedWeight: maxWeightServer.currentWeight,
      totalWeight,
      weights: Array.from(this.serverWeights.values()).map(sw => ({
        url: sw.server.url,
        currentWeight: sw.currentWeight
      }))
    });

    return maxWeightServer.server;
  }
}