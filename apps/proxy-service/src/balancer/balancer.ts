import { UpstreamServer } from '../types';

/**
 * 负载均衡器基础接口
 * 所有具体的负载均衡器实现都需要实现这个接口
 */
export interface Balancer {
  /**
   * 获取下一个可用的上游服务器
   * @returns 返回一个上游服务器，如果没有可用服务器则返回 null
   */
  getNextServer(): UpstreamServer | null;

  /**
   * 更新上游服务器列表
   * @param servers 新的上游服务器列表
   */
  updateServers(servers: UpstreamServer[]): void;
}

/**
 * 负载均衡器的抽象基类
 * 提供一些通用的实现和工具方法
 */
export abstract class BaseBalancer implements Balancer {
  protected servers: UpstreamServer[];

  constructor(servers: UpstreamServer[]) {
    this.servers = [...servers];
  }

  /**
   * 获取下一个可用的上游服务器
   * 具体的选择算法由子类实现
   */
  abstract getNextServer(): UpstreamServer | null;

  /**
   * 更新上游服务器列表
   * @param servers 新的上游服务器列表
   */
  updateServers(servers: UpstreamServer[]): void {
    this.servers = [...servers];
  }

  /**
   * 检查服务器是否可用
   * @param server 要检查的服务器
   * @returns 如果服务器可用返回 true，否则返回 false
   */
  protected isServerAvailable(server: UpstreamServer): boolean {
    // 检查服务器是否被标记为不可用或是备用服务器
    return !server.down && !server.backup;
  }

  /**
   * 获取所有可用的服务器
   * @returns 可用服务器列表
   */
  protected getAvailableServers(): UpstreamServer[] {
    return this.servers.filter(server => this.isServerAvailable(server));
  }

  /**
   * 获取备用服务器列表
   * @returns 备用服务器列表
   */
  protected getBackupServers(): UpstreamServer[] {
    return this.servers.filter(server => !server.down && server.backup);
  }

  /**
   * 当没有可用服务器时尝试使用备用服务器
   * @returns 一个备用服务器，如果没有可用的备用服务器则返回 null
   */
  protected tryGetBackupServer(): UpstreamServer | null {
    const backupServers = this.getBackupServers();
    return backupServers.length > 0 ? backupServers[0] : null;
  }
}