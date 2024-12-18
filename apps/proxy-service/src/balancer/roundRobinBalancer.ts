import { BaseBalancer } from './balancer';
import { UpstreamServer } from '../types';

/**
 * 轮询负载均衡器
 * 按照权重顺序循环选择可用的上游服务器
 */
export class RoundRobinBalancer extends BaseBalancer {
  private currentIndex: number;
  private currentWeight: number;
  private maxWeight: number = 0;
  private gcd: number = 1; // 最大公约数，默认为1
  private currentServer: UpstreamServer | null = null;  // 添加当前服务器的引用

  constructor(servers: UpstreamServer[]) {
    super(servers);
    this.currentIndex = -1;
    this.currentWeight = 0;
    this.initializeWeights();
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
    
    // 如果没有可用服务器，尝试使用备用服务器
    if (availableServers.length === 0) {
      this.currentServer = this.tryGetBackupServer();
      return this.currentServer;
    }

    // 如果只有一个可用服务器，直接返回
    if (availableServers.length === 1) {
      this.currentServer = availableServers[0];
      return this.currentServer;
    }

    // 使用加权轮询算法选择服务器
    const server = this.getNextWeightedServer(availableServers);
    this.currentServer = server;
    return server;
  }

  /**
   * 更新服务器列表
   * @param servers 新的服务器列表
   */
  public updateServers(servers: UpstreamServer[]): void {
    super.updateServers(servers);
    this.currentIndex = -1;
    this.currentWeight = 0;
    this.currentServer = null;  // 重置当前服务器引用
    this.initializeWeights();
  }

  /**
   * 初始化权重相关的计算
   * 计算最大权重和权重的最大公约数
   */
  private initializeWeights(): void {
    this.maxWeight = 0;
    let weights: number[] = [];

    // 收集所有权重并找出最大权重
    this.servers.forEach(server => {
      const weight = server.weight || 1;
      weights.push(weight);
      this.maxWeight = Math.max(this.maxWeight, weight);
    });

    // 计算所有权重的最大公约数
    this.gcd = this.calculateGCD(weights);
    
    // 重置当前权重和索引
    this.currentWeight = 0;
    this.currentIndex = -1;
  }

  /**
   * 使用加权轮询算法选择下一个服务器
   * 实现平滑的加权轮询
   * @param servers 可用的服务器列表
   * @returns 选中的服务器
   */
  private getNextWeightedServer(servers: UpstreamServer[]): UpstreamServer {
    let server: UpstreamServer | null = null;
    
    // 实现平滑加权轮询算法
    while (server === null) {
      this.currentIndex = (this.currentIndex + 1) % servers.length;
      
      if (this.currentIndex === 0) {
        this.currentWeight = this.currentWeight - this.gcd;
        if (this.currentWeight <= 0) {
          this.currentWeight = this.maxWeight;
          if (this.currentWeight === 0) {
            this.currentServer = servers[0];
            return servers[0]; // 如果所有权重都是0，直接返回第一个服务器
          }
        }
      }
      
      const currentServer = servers[this.currentIndex];
      if ((currentServer.weight || 1) >= this.currentWeight) {
        server = currentServer;
        this.currentServer = server;  // 更新当前服务器引用
      }
    }
    
    return server;
  }

  /**
   * 计算最大公约数
   * @param numbers 需要计算最大公约数的数字数组
   * @returns 最大公约数
   */
  private calculateGCD(numbers: number[]): number {
    if (numbers.length === 0) return 1;
    
    const gcd = (a: number, b: number): number => {
      if (b === 0) return a;
      return gcd(b, a % b);
    };

    let result = numbers[0];
    for (let i = 1; i < numbers.length; i++) {
      result = gcd(result, numbers[i]);
    }
    
    return result || 1;
  }
}