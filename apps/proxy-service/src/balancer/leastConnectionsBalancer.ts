import { BaseBalancer } from './balancer';
import { UpstreamServer } from '../types';

/**
 * 服务器连接数追踪接口
 */
interface ServerConnection extends UpstreamServer {
  activeConnections: number;
}

/**
 * 最少连接数负载均衡器
 * 选择当前活动连接数最少的服务器
 */
export class LeastConnectionsBalancer extends BaseBalancer {
  private serverConnections: Map<string, number>;

  constructor(servers: UpstreamServer[]) {
    super(servers);
    this.serverConnections = new Map();
    this.initializeConnections();
  }

  /**
   * 获取当前连接数最少的可用服务器
   * @returns 返回连接数最少的服务器，如果没有可用服务器则返回 null
   */
  public getNextServer(): UpstreamServer | null {
    const availableServers = this.getAvailableServers();
    
    // 如果没有可用服务器，尝试使用备用服务器
    if (availableServers.length === 0) {
      const backupServer = this.tryGetBackupServer();
      if (backupServer) {
        this.incrementConnections(backupServer.url);
      }
      return backupServer;
    }

    // 获取连接数最少的服务器
    const server = this.findServerWithLeastConnections(availableServers);
    if (server) {
      this.incrementConnections(server.url);
    }
    
    return server;
  }

  /**
   * 更新服务器列表
   * @param servers 新的服务器列表
   */
  public updateServers(servers: UpstreamServer[]): void {
    super.updateServers(servers);
    this.initializeConnections();
  }

  /**
   * 增加服务器的连接数
   * @param serverUrl 服务器URL
   */
  public incrementConnections(serverUrl: string): void {
    const currentConnections = this.serverConnections.get(serverUrl) || 0;
    this.serverConnections.set(serverUrl, currentConnections + 1);
  }

  /**
   * 减少服务器的连接数
   * @param serverUrl 服务器URL
   */
  public decrementConnections(serverUrl: string): void {
    const currentConnections = this.serverConnections.get(serverUrl) || 0;
    if (currentConnections > 0) {
      this.serverConnections.set(serverUrl, currentConnections - 1);
    }
  }

  /**
   * 获取服务器当前的连接数
   * @param serverUrl 服务器URL
   * @returns 当前连接数
   */
  public getServerConnections(serverUrl: string): number {
    return this.serverConnections.get(serverUrl) || 0;
  }

  /**
   * 初始化连接数记录
   */
  private initializeConnections(): void {
    this.serverConnections.clear();
    this.servers.forEach(server => {
      this.serverConnections.set(server.url, 0);
    });
  }

  /**
   * 查找连接数最少的服务器
   * @param servers 可用的服务器列表
   * @returns 连接数最少的服务器
   */
  private findServerWithLeastConnections(servers: UpstreamServer[]): UpstreamServer | null {
    if (servers.length === 0) {
      return null;
    }

    // 转换为带连接数的服务器列表
    const serversWithConnections: ServerConnection[] = servers.map(server => ({
      ...server,
      activeConnections: this.getServerConnections(server.url)
    }));

    // 按连接数和权重排序
    serversWithConnections.sort((a, b) => {
      // 首先比较连接数
      const connectionsDiff = a.activeConnections - b.activeConnections;
      if (connectionsDiff !== 0) {
        return connectionsDiff;
      }

      // 如果连接数相同，考虑权重（权重大的优先）
      const weightA = a.weight || 1;
      const weightB = b.weight || 1;
      return weightB - weightA;
    });

    return serversWithConnections[0];
  }
}