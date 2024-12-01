import { Balancer } from './balancer';
import { RoundRobinBalancer } from './roundRobinBalancer';
import { LeastConnectionsBalancer } from './leastConnectionsBalancer';
import { LocationConfig, UpstreamServer } from '../types';

/**
 * 负载均衡器配置接口
 */
export interface BalancerConfig {
  balancer: string;
  targets: UpstreamServer[];
  path?: string;  // 可选，用于 location 配置
}

/**
 * 负载均衡器类型枚举
 */
export enum BalancerType {
  ROUND_ROBIN = 'round-robin',
  LEAST_CONNECTIONS = 'least-connections'
}

/**
 * 负载均衡器工厂类
 * 根据配置创建相应的负载均衡器实例
 */
export class BalancerFactory {
  private static balancers: Map<string, Balancer> = new Map();

  /**
   * 创建或获取负载均衡器实例
   * @param location 位置配置
   * @returns 负载均衡器实例
   * @throws Error 如果指定了未知的负载均衡算法
   */
  public static createBalancer(config: BalancerConfig): Balancer {
    const balancerKey = config.path || 'default';
    
    // 检查是否已存在该路径的负载均衡器
    const existingBalancer = this.balancers.get(balancerKey);
    if (existingBalancer) {
      existingBalancer.updateServers(config.targets);
      return existingBalancer;
    }

    // 创建新的负载均衡器实例
    const newBalancer = this.createNewBalancer(config.balancer, config.targets);
    this.balancers.set(balancerKey, newBalancer);
    return newBalancer;
  }

  /**
   * 更新指定路径的负载均衡器配置
   * @param location 位置配置
   * @returns 更新后的负载均衡器实例
   */
  public static updateBalancer(config: BalancerConfig): Balancer {
    const balancer = this.createBalancer(config);
    if (config.path) {
      this.balancers.set(config.path, balancer);
    }
    return balancer;
  }

  /**
   * 删除指定路径的负载均衡器
   * @param path 路由路径
   */
  public static removeBalancer(path: string): void {
    this.balancers.delete(path);
  }

  /**
   * 创建新的负载均衡器实例
   * @param type 负载均衡器类型
   * @param servers 上游服务器列表
   * @returns 新的负载均衡器实例
   * @throws Error 如果指定了未知的负载均衡算法
   */
  private static createNewBalancer(type: string, servers: UpstreamServer[]): Balancer {
    switch (type.toLowerCase()) {
      case BalancerType.ROUND_ROBIN:
        return new RoundRobinBalancer(servers);
      
      case BalancerType.LEAST_CONNECTIONS:
        return new LeastConnectionsBalancer(servers);
      
      default:
        throw new Error(`Unknown balancer type: ${type}`);
    }
  }

  /**
   * 获取所有已创建的负载均衡器
   * @returns 负载均衡器Map
   */
  public static getAllBalancers(): Map<string, Balancer> {
    return this.balancers;
  }

  /**
   * 清除所有负载均衡器
   */
  public static clearBalancers(): void {
    this.balancers.clear();
  }
}

// 这个实现包含以下主要特点：
// 单例模式：
// 使用静态 Map 存储所有负载均衡器实例
// 按照 location 复用负载均衡器实例
// 工厂方法：
// 根据配置类型创建对应的负载均衡器
// 支持轮询和最少连接数两种算法
// 可以方便地扩展新的负载均衡算法
// 实例管理：
// 提供创建、更新、删除和清理方法
// 支持获取所有已创建的负载均衡器
// 确保每个 location 只有一个负载均衡器实例
// 类型安全：
// 使用枚举定义支持的负载均衡器类型
// 完整的类型注解和错误处理
// 配置更新：
// 支持动态更新服务器列表
// 保持负载均衡器实例的状态