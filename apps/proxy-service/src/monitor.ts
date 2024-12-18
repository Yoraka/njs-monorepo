import * as WebSocket from 'ws';
import { Server } from 'http';
import { Config, MonitoringData, ServerMetrics, SystemMetrics, ValidationResult } from './types';
import { Logger } from 'winston';
import { EventEmitter } from 'events';
import { collectSystemMetrics } from './utils/systemMetrics';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as dotenv from 'dotenv';

// 加载环境变量
dotenv.config({
  path: path.resolve(process.cwd(), '.env')
});

// 默认配置路径
const DEFAULT_CONFIG_PATH = path.join(process.cwd(), 'config', 'proxy.json');

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
  private isShuttingDown: boolean = false;
  private updateLock: boolean = false;
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

  private lastUpdateTime: number = 0;
  private lastConfigBackup: Config | null = null;
  private updateCooldown: number = 1000;

  constructor(config: Config, logger: Logger) {
    super();
    this.setMaxListeners(20);
    this.config = config;
    this.logger = logger;

    // 使用配置的 WebSocket 端口
    const wsPort = this.config.monitoring?.wsPort || 3001;
    
    // 记录启动信息
    this.logger.info('正在启动 WebSocket 服务器', {
      port: wsPort,
      nodeEnv: process.env.NODE_ENV,
      platform: process.platform
    });

    try {
      this.wss = new WebSocket.Server({ 
        port: wsPort,
        host: '0.0.0.0',  // 允许所有地址访问
        perMessageDeflate: {
          zlibDeflateOptions: {
            chunkSize: 1024,
            memLevel: 7,
            level: 3
          },
          zlibInflateOptions: {
            chunkSize: 10 * 1024
          },
          clientNoContextTakeover: true,
          serverNoContextTakeover: true,
          serverMaxWindowBits: 10,
          concurrencyLimit: 10,
          threshold: 1024
        },
        verifyClient: (info, cb) => {
          const origin = info.origin || info.req.headers.origin;
          const host = info.req.headers.host;
          
          this.logger.debug('WebSocket 连接验证', {
            origin,
            host,
            headers: info.req.headers,
            url: info.req.url
          });
          
          // 允许所有连接
          cb(true);
        }
      });
      
      // 添加服务器级别的错误处理
      this.wss.on('error', (error) => {
        this.logger.error('WebSocket 服务器错误:', {
          error: error.message,
          stack: error.stack
        });
      });

      this.logger.info('WebSocket 服务器启动成功', {
        port: wsPort,
        address: this.wss.address()
      });
    } catch (error) {
      this.logger.error('WebSocket 服务器启动失败:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
    
    // 始化服务器指标和WebSocket服务器
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
          this.logger.info('收到WebSocket消息:', {
            type: message.type,
            id: message.id,
            timestamp: message.timestamp,
            data: message.type === 'configUpdate' ? {
              ...message.data,
              config: {
                ...message.data.config,
                // 只记录关键信息
                servers: message.data.config.servers?.map((s: any) => ({
                  name: s.name,
                  listen: s.listen
                }))
              }
            } : message.data
          });

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
        case 'getConfig':
          await this.handleGetConfig(ws, message);
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
      this.logger.info('开始处理配置更新请求', {
        messageId: message.id,
        configName: message.data.config.servers?.[0]?.name || 'unknown'
      });

      // 验证配置
      const validationResult = await this.validateConfig(message.data.config);
      this.logger.info('配置验证结果:', {
        messageId: message.id,
        valid: validationResult.valid,
        errors: validationResult.errors,
        warnings: validationResult.warnings
      });

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
        this.logger.info('开始保存配置文件', {
          messageId: message.id,
          fileCount: message.data.files.length
        });
        await this.saveFiles(message.data.files);
      }

      // 更新配置
      this.logger.info('开始更新运行时配置', {
        messageId: message.id
      });
      await this.updateConfig(message.data.config);

      // 发送成功响应
      this.logger.info('发送配置更新成功响应', {
        messageId: message.id
      });
      this.sendResponse(ws, message.id, {
        type: 'configUpdateResponse',
        success: true,
        validationResult,
        config: message.data.config
      });

      // 广播配置更新事件给所有连接的客户端
      this.logger.info('广播配置更新消息', {
        messageId: message.id,
        clientCount: this.clients.size
      });
      this.broadcastMessage({
        type: 'configChanged',
        data: {
          config: message.data.config,
          timestamp: Date.now()
        }
      });

      this.logger.info('配置更新处理完成', {
        messageId: message.id,
        configName: message.data.config.servers?.[0]?.name || 'unknown'
      });
    } catch (error) {
      this.logger.error('配置更新失败:', {
        messageId: message.id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
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
   * 处理获取配置请求
   */
  private async handleGetConfig(ws: WebSocket, message: WebSocketMessage): Promise<void> {
    try {
      this.logger.info('处理获取配置请求', {
        messageId: message.id,
        timestamp: new Date().toISOString()
      });

      // 发送当前配置
      this.sendResponse(ws, message.id, {
        type: 'getConfigResponse',
        success: true,
        data: {
          ...this.config,
          timestamp: Date.now()
        }
      });

      this.logger.debug('配置已发送', {
        messageId: message.id,
        configServers: this.config.servers.map(s => ({
          name: s.name,
          listen: s.listen
        }))
      });
    } catch (error) {
      this.logger.error('获取配置失败:', {
        messageId: message.id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.sendErrorResponse(ws, message.id, errorMessage);
    }
  }

  /**
   * 验证配置
   */
  private async validateConfig(config: Config): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // 验证基本段
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
      pushInterval: this.config.monitoring?.pushInterval || 5000,
      wsPort: this.config.monitoring?.wsPort || 3001
    });
  }

  /**
   * 停止监控
   */
  public async stop(): Promise<void> {
    if (this.pushInterval) {
      clearInterval(this.pushInterval);
      this.pushInterval = null;
    }
    if (this.systemMetricsInterval) {
      clearInterval(this.systemMetricsInterval);
      this.systemMetricsInterval = undefined;
    }

    await this.closeWebSocketServer();
    this.logger.info('监控已完全停止');
  }

  /**
   * 关闭监控器
   */
  public async shutdown(): Promise<void> {
    if (this.isShuttingDown) return;
    
    this.isShuttingDown = true;
    await this.stop();
    this.removeAllListeners();
    this.logger.info('监控器已完全关闭');
  }

  /**
   * 启动系统指标收集
   */
  private startSystemMetricsCollection(): void {
    // 立即收集一次
    this.updateSystemMetrics();
    
    // 使用固定的收集间隔，不受 pushInterval 影响
    const interval = this.config.monitoring?.pushInterval || 5000;
    this.systemMetricsInterval = setInterval(async () => {
      await this.updateSystemMetrics();
      this.pushMetrics();
    }, Math.min(interval, 5000)); // 最大5秒更新一次
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
  public async updateConfig(newConfig: Config): Promise<void> {
    if (this.isShuttingDown) {
      throw new Error('Monitor is shutting down');
    }

    if (this.updateLock) {
      throw new Error('Configuration update in progress');
    }

    this.updateLock = true;
    try {
      const now = Date.now();
      if (now - this.lastUpdateTime < this.updateCooldown) {
        this.logger.warn('配置更新太频繁，请稍后再试', {
          timeSinceLastUpdate: now - this.lastUpdateTime,
          cooldown: this.updateCooldown
        });
        throw new Error('配置更新太频繁，请等待1秒后再试');
      }

      // 在更新前备份当前配置
      if (!this.lastConfigBackup) {
        this.lastConfigBackup = JSON.parse(JSON.stringify(this.config));
      }

      this.lastUpdateTime = now;

      // 检查 WebSocket 配置变更
      const currentWsPort = this.config.monitoring?.wsPort || 3001;
      const newWsPort = newConfig.monitoring?.wsPort || 3001;
      const wsConfigChanged = currentWsPort !== newWsPort || 
                            this.config.monitoring?.enabled !== newConfig.monitoring?.enabled;

      // 如果 WebSocket 配置发生变化
      if (wsConfigChanged) {
        this.logger.info('WebSocket 配置已变更，准备重启服务', {
          oldPort: currentWsPort,
          newPort: newWsPort,
          oldEnabled: this.config.monitoring?.enabled,
          newEnabled: newConfig.monitoring?.enabled
        });

        // 先通知所有客户端即将重启
        this.broadcastMessage({
          type: 'serverRestart',
          data: {
            reason: 'WebSocket configuration changed',
            newPort: newWsPort,
            timestamp: Date.now()
          }
        });

        // 关闭当前的 WebSocket 服务器
        await this.closeWebSocketServer();

        // 如果新配置启用了监控，创建新的 WebSocket 服务器
        if (newConfig.monitoring?.enabled) {
          try {
            this.wss = new WebSocket.Server({ 
              port: newWsPort,
              host: '0.0.0.0'
            });
            this.setupWebSocketServer();
            this.logger.info('WebSocket 服务器已在新端口重启', {
              port: newWsPort
            });
          } catch (error) {
            this.logger.error('重启 WebSocket 服务器失败:', {
              error: error instanceof Error ? error.message : String(error),
              port: newWsPort
            });
            throw error;
          }
        }
      }

      // 更新内存中的配置
      this.config = newConfig;
      this.initializeServerMetrics();

      // 保存配置文件
      const configPath = process.env.PROXY_CONFIG_PATH || DEFAULT_CONFIG_PATH;
      const configDir = path.dirname(configPath);

      try {
        await fs.mkdir(configDir, { recursive: true });
        await fs.writeFile(configPath, JSON.stringify(newConfig, null, 2), 'utf8');
        
        this.logger.info('配置文件已更新', {
          path: configPath,
          timestamp: new Date().toISOString()
        });
        
        // 更新成功后，将当前配置设为新的备份
        this.lastConfigBackup = JSON.parse(JSON.stringify(newConfig));
        
        // 发出配置更新事件
        this.emit('configUpdated', newConfig);

        // 广播配置更新消息给所有客户端
        this.broadcastMessage({
          type: 'configChanged',
          data: {
            config: newConfig,
            timestamp: Date.now()
          }
        });
      } catch (error) {
        this.logger.error('保存配置文件失败:', {
          error: error instanceof Error ? error.message : String(error),
          path: configPath
        });
        throw error;
      }

      // 重启监控服务（如果需要）
      if (this.pushInterval) {
        clearInterval(this.pushInterval);
        this.start();
      }

      // 重启系统指标收集
      if (this.systemMetricsInterval) {
        clearInterval(this.systemMetricsInterval);
        this.startSystemMetricsCollection();
      }
    } catch (error) {
      this.logger.error('更新配置失败:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      // 如果更新失败且不是因为频率限制，恢复到备份配置
      if (this.lastConfigBackup && error instanceof Error && error.message !== '配置更新太频繁，请等待1秒后再试') {
        await this.restoreConfig();
      }
      throw error;
    } finally {
      this.updateLock = false;
    }
  }

  /**
   * 恢复到备份配置
   */
  private async restoreConfig(): Promise<void> {
    if (!this.lastConfigBackup) {
      this.logger.warn('没有可用的配置备份');
      return;
    }

    try {
      this.logger.info('正在恢复到上一次的配置');
      
      // 恢复内存中的配置
      this.config = JSON.parse(JSON.stringify(this.lastConfigBackup));
      this.initializeServerMetrics();

      // 恢复配置文件
      const configPath = process.env.PROXY_CONFIG_PATH || DEFAULT_CONFIG_PATH;
      await fs.writeFile(configPath, JSON.stringify(this.lastConfigBackup, null, 2), 'utf8');
      
      this.logger.info('配置已恢复到上一个版本', {
        timestamp: new Date().toISOString()
      });

      // 如果 WebSocket 端口改变，需要重新启动 WebSocket 服务器
      const wsPort = this.lastConfigBackup.monitoring?.wsPort || 3001;
      if (this.wss.options.port !== wsPort) {
        this.wss.close(() => {
          this.wss = new WebSocket.Server({ port: wsPort });
          this.setupWebSocketServer();
          this.logger.info(`WebSocket monitoring server restarted on port ${wsPort}`);
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

      // 发出配置更新事件
      this.emit('configUpdated', this.config);
    } catch (error) {
      this.logger.error('恢复配置失败:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
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

  /**
   * 关闭 WebSocket 服务器
   */
  private async closeWebSocketServer(): Promise<void> {
    if (!this.wss) return;

    // 关闭所有客户端连接
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.close(1000, 'Server shutting down');
      }
    }
    this.clients.clear();

    // 关闭 WebSocket 服务器
    await new Promise<void>((resolve, reject) => {
      this.wss.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
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
