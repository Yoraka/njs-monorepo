import * as WebSocket from 'ws';
import { Server } from 'http';
import { Config, MonitoringData, ServerMetrics, SystemMetrics } from './types';
import { Logger } from 'winston';
import { EventEmitter } from 'events';
import { collectSystemMetrics } from './utils/systemMetrics';
// import cors from 'cors';

/**
 * 监控模块类
 * 负责收集和推送监控数据
 */
export class Monitor extends EventEmitter {
  private wss: WebSocket.Server;
  private clients: Set<WebSocket> = new Set();
  private pushInterval: NodeJS.Timeout | null = null;
  private config: Config;
  private logger: Logger;
  private metrics: {
    activeConnections: number;
    totalRequests: number;
    serverMetrics: { [serverName: string]: ServerMetrics };
  } = {
    activeConnections: 0,
    totalRequests: 0,
    serverMetrics: {}
  };

  private systemMetricsInterval: NodeJS.Timeout | undefined = undefined;
  private currentSystemMetrics: SystemMetrics = {
    cpuUsage: 0,
    memoryUsage: 0,
    memoryPercentage: 0,
    diskUsage: 0
  };

  constructor(config: Config, logger: Logger) {
    super();
    this.setMaxListeners(20);
    this.config = config;
    this.logger = logger;

    // 使用配置的 WebSocket 端口
    const wsPort = this.config.monitoring?.wsPort || 3001;
    this.wss = new WebSocket.Server({ 
      host: '0.0.0.0',
      port: wsPort,
      // 添加 CORS 支持
      verifyClient: (info, cb) => {
        const origin = info.origin || info.req.headers.origin;
        const allowedOrigins = ['*'];
        
        if (!origin || allowedOrigins.includes(origin)) {
          cb(true);
        } else {
          cb(false, 403, 'Origin not allowed');
        }
      }
    });
    
    this.logger.info(`WebSocket monitoring server started on port ${wsPort}`);
    
    // 初始化服务器指标和WebSocket服务器
    this.initializeServerMetrics();
    this.setupWebSocketServer();

    // 启动系统指标收集
    this.startSystemMetricsCollection();
  }

  /**
   * 初始化服务器指标
   */
  private initializeServerMetrics(): void {
    // 清空现有指标
    this.metrics.serverMetrics = {};
    
    // 为每个服务器配置初始化指标
    this.config.servers.forEach(server => {
      this.metrics.serverMetrics[server.name] = {
        incomingTraffic: 0,
        outgoingTraffic: 0,
        activeConnections: 0,
        totalRequests: 0
      };
    });
  }

  /**
   * 设置 WebSocket 服务器
   */
  private setupWebSocketServer(): void {
    this.wss.setMaxListeners(20);

    this.wss.on('connection', (ws: WebSocket) => {
      ws.setMaxListeners(5);
      
      this.clients.add(ws);
      this.logger.info('New monitoring client connected');

      ws.once('close', () => {
        this.clients.delete(ws);
        this.logger.info('Monitoring client disconnected');
        ws.removeAllListeners();
      });

      ws.once('error', (error) => {
        this.logger.error('WebSocket error:', error);
        this.clients.delete(ws);
        ws.removeAllListeners();
      });
    });
  }

  /**
   * 启动监控
   */
  public start(): void {
    if (this.pushInterval) {
      this.stop();
    }

    this.pushInterval = setInterval(() => {
      this.pushMetrics();
    }, this.config.monitoring.pushInterval);

    this.logger.info('Monitoring started');
  }

  /**
   * 停止监控
   */
  public stop(): void {
    if (this.pushInterval) {
      clearInterval(this.pushInterval);
      this.pushInterval = null;
    }
    if (this.systemMetricsInterval) {
      clearInterval(this.systemMetricsInterval);
      this.systemMetricsInterval = undefined;
    }
    this.logger.info('Monitoring stopped');
  }

  /**
   * 启动系统指标收集
   */
  private startSystemMetricsCollection(): void {
    // 立即收集一次
    this.updateSystemMetrics();
    
    // 设置定时收集
    this.systemMetricsInterval = setInterval(() => {
      this.updateSystemMetrics();
    }, 1000); // 1秒间隔
  }

  /**
   * 更新系统指标
   */
  private async updateSystemMetrics(): Promise<void> {
    try {
      this.currentSystemMetrics = await collectSystemMetrics();
    } catch (error) {
      console.error('Error collecting system metrics:', error);
    }
  }

  /**
   * 收集系统指标
   */
  private async collectSystemMetrics(): Promise<SystemMetrics> {
    return collectSystemMetrics();
  }

  /**
   * 推送监控数据
   */
  private pushMetrics(): void {
    const monitoringData: MonitoringData = {
      activeConnections: this.metrics.activeConnections,
      totalRequests: this.metrics.totalRequests,
      serverMetrics: this.metrics.serverMetrics,
      systemMetrics: this.currentSystemMetrics, // 使用当前缓存的系统指标
      timestamp: Date.now()
    };

    const payload = JSON.stringify(monitoringData);
    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });

    this.emit('metricsPushed', monitoringData);
  }

  /**
   * 更新请求指标
   */
  public updateRequestMetrics(serverName: string, incomingBytes: number, outgoingBytes: number): void {
    this.logger.debug(`更新请求指标: ${serverName}`);
    const serverMetrics = this.metrics.serverMetrics[serverName];
    if (serverMetrics) {
      serverMetrics.incomingTraffic += incomingBytes;
      serverMetrics.outgoingTraffic += outgoingBytes;
      serverMetrics.totalRequests++;
      this.metrics.totalRequests++;
      
      this.logger.debug(
        `指标已更新: ` +
        `服务器=${serverName}, ` +
        `入站=${serverMetrics.incomingTraffic}, ` +
        `出站=${serverMetrics.outgoingTraffic}, ` +
        `请求数=${serverMetrics.totalRequests}`
      );
    } else {
      this.logger.warn(`未找到服务器的指标: ${serverName}`);
      this.logger.debug(`可用的服务器: ${Object.keys(this.metrics.serverMetrics).join(', ')}`);
    }
  }

  /**
   * 更新连接指标
   */
  public updateConnectionMetrics(serverName: string, delta: number): void {
    const serverMetrics = this.metrics.serverMetrics[serverName];
    if (serverMetrics) {
      serverMetrics.activeConnections += delta;
      this.metrics.activeConnections += delta;
      
      this.logger.debug(
        `更新了 ${serverName} 的连接: ` +
        `变化=${delta}, 活跃连接=${serverMetrics.activeConnections}`
      );
    } else {
      this.logger.warn(`未找到服务器的指标: ${serverName}`);
    }
  }

  /**
   * 更新配置
   */
  public updateConfig(newConfig: Config): void {
    this.config = newConfig;
    this.initializeServerMetrics(); // 重新初始化所有服务器的指标
    
    // 如果 WebSocket 端口改变，需要重新启动 WebSocket 服务器
    const newWsPort = newConfig.monitoring?.wsPort || 3001;
    if (this.wss.options.port !== newWsPort) {
      this.wss.close(() => {
        this.wss = new WebSocket.Server({ port: newWsPort });
        this.setupWebSocketServer();
        this.logger.info(`WebSocket monitoring server restarted on port ${newWsPort}`);
      });
    }

    if (this.pushInterval) {
      this.stop();
      this.start();
    }

    // 重启系统指标收集
    if (this.systemMetricsInterval) {
      clearInterval(this.systemMetricsInterval);
      this.startSystemMetricsCollection();
    }
  }

  /**
   * 获取当前指标
   */
  public getMetrics(): MonitoringData {
    return {
      activeConnections: this.metrics.activeConnections,
      totalRequests: this.metrics.totalRequests,
      serverMetrics: this.metrics.serverMetrics,
      systemMetrics: this.currentSystemMetrics, // 使用当前缓存的系统指标
      timestamp: Date.now()
    };
  }
}

/**
 * 创建监控实例
 */
export function createMonitor(
  config: Config,
  logger: Logger
): Monitor {
  return new Monitor(config, logger);
}
