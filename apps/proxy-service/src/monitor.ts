import * as WebSocket from 'ws';
import { Server } from 'http';
import { Config, MonitoringData, ServerMetrics, SystemMetrics, ValidationResult } from './types';
import { Logger } from 'winston';
import { EventEmitter } from 'events';
import { collectSystemMetrics } from './utils/systemMetrics';
import * as fs from 'fs/promises';
import * as path from 'path';

interface WebSocketMessage {
  type: string;
  id: string;
  data: any;
  timestamp: number;
}

interface ConfigUpdateMessage extends WebSocketMessage {
  type: 'configUpdate';
  data: {
    config: Config;
    files?: Array<{
      path: string;
      content: string;
    }>;
  };
}

interface FileUploadMessage extends WebSocketMessage {
  type: 'fileUpload';
  data: {
    path: string;
    content: string;
    type: 'cert' | 'key' | 'other';
  };
}

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

      ws.on('message', async (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString()) as WebSocketMessage;
          await this.handleMessage(ws, message);
        } catch (error) {
          this.logger.error('Failed to handle WebSocket message:', error);
          this.sendErrorResponse(ws, 'messageError', 'Failed to process message');
        }
      });

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
   * 处理WebSocket消息
   */
  private async handleMessage(ws: WebSocket, message: WebSocketMessage): Promise<void> {
    this.logger.debug('Received message:', message);

    try {
      switch (message.type) {
        case 'configUpdate':
          await this.handleConfigUpdate(ws, message as ConfigUpdateMessage);
          break;
        case 'fileUpload':
          await this.handleFileUpload(ws, message as FileUploadMessage);
          break;
        case 'configValidate':
          await this.handleConfigValidate(ws, message);
          break;
        case 'getMetrics':
          this.handleGetMetrics(ws);
          break;
        default:
          this.sendErrorResponse(ws, message.id, `Unknown message type: ${message.type}`);
      }
    } catch (error) {
      this.logger.error('Error handling message:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.sendErrorResponse(ws, message.id, errorMessage);
    }
  }

  /**
   * 处理配置更新
   */
  private async handleConfigUpdate(ws: WebSocket, message: ConfigUpdateMessage): Promise<void> {
    try {
      // 验证配置
      const validationResult = await this.validateConfig(message.data.config);
      if (!validationResult.valid) {
        this.sendResponse(ws, message.id, {
          type: 'configUpdateResponse',
          success: false,
          error: 'Invalid configuration',
          validationResult
        });
        return;
      }

      // 保存文件
      if (message.data.files) {
        await this.saveFiles(message.data.files);
      }

      // 更新配置
      this.updateConfig(message.data.config);

      // 发送成功响应
      this.sendResponse(ws, message.id, {
        type: 'configUpdateResponse',
        success: true,
        validationResult
      });

      // 广播配置更新事件
      this.broadcastMessage({
        type: 'configChanged',
        timestamp: Date.now()
      });
    } catch (error) {
      this.logger.error('Failed to update config:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.sendErrorResponse(ws, message.id, errorMessage);
    }
  }

  /**
   * 处理文件上传
   */
  private async handleFileUpload(ws: WebSocket, message: FileUploadMessage): Promise<void> {
    try {
      const { path: filePath, content, type } = message.data;
      
      // 验证文件类型和路径
      if (!this.validateFilePath(filePath, type)) {
        throw new Error('Invalid file path or type');
      }

      // 保存文件
      await this.saveFile(filePath, content);

      // 发送成功响应
      this.sendResponse(ws, message.id, {
        type: 'fileUploadResponse',
        success: true
      });
    } catch (error) {
      this.logger.error('Failed to upload file:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.sendErrorResponse(ws, message.id, errorMessage);
    }
  }

  /**
   * 处理配置验证
   */
  private async handleConfigValidate(ws: WebSocket, message: WebSocketMessage): Promise<void> {
    try {
      const validationResult = await this.validateConfig(message.data);
      this.sendResponse(ws, message.id, {
        type: 'configValidateResponse',
        success: true,
        data: validationResult
      });
    } catch (error) {
      this.logger.error('Failed to validate config:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.sendErrorResponse(ws, message.id, errorMessage);
    }
  }

  /**
   * 处理获取指标请求
   */
  private handleGetMetrics(ws: WebSocket): void {
    const metrics = this.getMetrics();
    ws.send(JSON.stringify({
      type: 'metrics',
      data: metrics,
      timestamp: Date.now()
    }));
  }

  /**
   * 验证配置
   */
  private async validateConfig(config: Config): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // 验证基本字段
      if (!config.servers || !Array.isArray(config.servers)) {
        errors.push('Missing or invalid servers configuration');
      }

      // 验证每个服务器配置
      config.servers?.forEach((server, index) => {
        if (!server.name) {
          errors.push(`Server ${index + 1} is missing name`);
        }
        if (!server.listen) {
          errors.push(`Server ${server.name || index + 1} is missing listen port`);
        }
        if (server.ssl?.enabled) {
          if (!server.ssl.cert) {
            errors.push(`Server ${server.name} is missing SSL certificate`);
          }
          if (!server.ssl.key) {
            errors.push(`Server ${server.name} is missing SSL key`);
          }
        }
      });

      // 验证上游服务器配置
      config.upstreams?.forEach((upstream, index) => {
        if (!upstream.name) {
          errors.push(`Upstream ${index + 1} is missing name`);
        }
        if (!upstream.servers || upstream.servers.length === 0) {
          errors.push(`Upstream ${upstream.name || index + 1} has no servers`);
        }
      });

      // 添加警告
      if (config.servers?.some(server => !server.healthCheck)) {
        warnings.push('Some servers do not have health checks configured');
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings
      };
    } catch (error) {
      this.logger.error('Config validation error:', error);
      return {
        valid: false,
        errors: ['Internal validation error'],
        warnings
      };
    }
  }

  /**
   * 验证文件路径
   */
  private validateFilePath(filePath: string, type: string): boolean {
    // 规范化路径
    const normalizedPath = path.normalize(filePath).replace(/^(\.\.(\/|\\|$))+/, '');
    
    // 检查文件类型和路径
    switch (type) {
      case 'cert':
        return /\.(crt|pem)$/.test(normalizedPath) && normalizedPath.startsWith('certs/');
      case 'key':
        return /\.(key|pem)$/.test(normalizedPath) && normalizedPath.startsWith('certs/');
      case 'other':
        return !normalizedPath.includes('..') && !path.isAbsolute(normalizedPath);
      default:
        return false;
    }
  }

  /**
   * 保存文件
   */
  private async saveFile(filePath: string, content: string): Promise<void> {
    try {
      // 规范化路径
      const normalizedPath = path.normalize(filePath);
      
      // 创建目录
      await fs.mkdir(path.dirname(normalizedPath), { recursive: true });
      
      // 写入文件
      await fs.writeFile(normalizedPath, content, 'utf8');
      
      this.logger.info(`File saved: ${normalizedPath}`);
    } catch (error) {
      this.logger.error('Failed to save file:', error);
      throw new Error(`Failed to save file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * 批量保存文件
   */
  private async saveFiles(files: Array<{ path: string; content: string }>): Promise<void> {
    for (const file of files) {
      await this.saveFile(file.path, file.content);
    }
  }

  /**
   * 发送WebSocket响应
   */
  private sendResponse(ws: WebSocket, id: string, response: any): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        ...response,
        id,
        timestamp: Date.now()
      }));
    }
  }

  /**
   * 发送错误响应
   */
  private sendErrorResponse(ws: WebSocket, id: string, error: string): void {
    this.sendResponse(ws, id, {
      type: 'error',
      success: false,
      error
    });
  }

  /**
   * 广播消息给所有客户端
   */
  private broadcastMessage(message: any): void {
    const payload = JSON.stringify(message);
    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });
  }

  /**
   * 启动监控
   */
  public start(): void {
    if (this.pushInterval) {
      this.stop();
    }

    this.startSystemMetricsCollection();
    this.logger.info('监控已启动', {
      pushInterval: this.config.monitoring.pushInterval,
      wsPort: this.config.monitoring?.wsPort || 3001
    });
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
    this.logger.info('监控已停止');
  }

  /**
   * 启动系统指标收集
   */
  private startSystemMetricsCollection(): void {
    // 立即收集一次
    this.updateSystemMetrics();
    
    // 使用固定的收集间隔，不受 pushInterval 影响
    this.systemMetricsInterval = setInterval(async () => {
      await this.updateSystemMetrics();
      this.pushMetrics();
    }, Math.min(this.config.monitoring.pushInterval || 5000, 5000)); // 最大5秒更新一次
  }

  /**
   * 更新系统指标
   */
  private async updateSystemMetrics(): Promise<void> {
    try {
      const metrics = await collectSystemMetrics();
      this.currentSystemMetrics = metrics;
      
      // 添加调试日志
      this.logger.debug('系统指标已更新:', {
        timestamp: new Date().toISOString(),
        metrics: this.currentSystemMetrics
      });
    } catch (error) {
      this.logger.error('收集系统指标时出错:', error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * 推送监控数据
   */
  private pushMetrics(): void {
    const monitoringData: MonitoringData = {
      activeConnections: this.metrics.activeConnections,
      totalRequests: this.metrics.totalRequests,
      serverMetrics: this.metrics.serverMetrics,
      systemMetrics: this.currentSystemMetrics,
      timestamp: Date.now()
    };

    // 添加调试日志
    this.logger.debug('准备推送监控数据:', {
      timestamp: new Date().toISOString(),
      clientCount: this.clients.size,
      systemMetrics: this.currentSystemMetrics
    });

    const payload = JSON.stringify(monitoringData);
    let pushCount = 0;
    
    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
        pushCount++;
      }
    });

    // 记录推送结果
    this.logger.debug('监控数据推送完成:', {
      timestamp: new Date().toISOString(),
      totalClients: this.clients.size,
      successfulPushes: pushCount
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
