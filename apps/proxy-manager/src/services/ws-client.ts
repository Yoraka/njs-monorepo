import { EventEmitter } from 'events'
import { MetricsData } from '@/types/metrics'
import { ServerConfig, ConfigUpdateMessage, FileUploadMessage, ValidationResult, ServiceStatus } from '@/types/proxy-config'

interface PendingMessage {
  type: string;
  id: string;
  resolve: (value: any) => void;
  reject: (error: any) => void;
  timestamp: number;
}

export class WebSocketClient extends EventEmitter {
  public static instance: WebSocketClient | null = null
  public ws: WebSocket | null = null
  private url: string
  private reconnectAttempts = 0
  private maxReconnectAttempts = 10
  private reconnectTimeout = 2000
  private static instanceCount = 0
  private reconnecting = false
  private instanceId: string
  private connectionState: 'connecting' | 'connected' | 'disconnected' | 'failed' = 'disconnected'
  private messageQueue: Array<PendingMessage> = [];
  private messageTimeout = 30000; // 30秒超时
  public static lastUrl: string | null = null;

  private constructor(url: string) {
    super()
    this.url = url
    this.instanceId = `ws-${Date.now()}`
    WebSocketClient.instanceCount++
    console.log('Debug - WebSocket实例创建', {
      instanceId: this.instanceId,
      instanceCount: WebSocketClient.instanceCount,
      url: url
    })
    this.connect()
  }

  public static getInstance(url: string): WebSocketClient {
    if (this.instance && this.lastUrl && this.lastUrl !== url) {
      console.log('Debug - WebSocket URL changed, creating new instance', {
        oldUrl: this.lastUrl,
        newUrl: url
      });
      this.instance.close();
      this.instance = null;
    }

    if (!this.instance) {
      this.lastUrl = url;
      this.instance = new WebSocketClient(url)
    }
    
    if (this.instance.connectionState === 'failed' || this.instance.connectionState === 'disconnected') {
      console.log('Debug - 重新尝试连接', {
        instanceId: this.instance.instanceId,
        connectionState: this.instance.connectionState
      });
      this.instance.reconnectAttempts = 0;
      this.instance.connect();
    }

    return this.instance
  }

  private connect() {
    if (this.connectionState === 'connected') {
      console.log('Debug - 已经连接，跳过', {
        instanceId: this.instanceId,
        readyState: this.ws?.readyState,
        connectionState: this.connectionState,
        reconnecting: this.reconnecting
      });
      return;
    }

    if (this.connectionState === 'connecting') {
      console.log('Debug - 正在连接中，跳过', {
        instanceId: this.instanceId,
        readyState: this.ws?.readyState,
        connectionState: this.connectionState,
        reconnecting: this.reconnecting
      });
      return;
    }

    if (this.reconnecting && this.connectionState !== 'disconnected') {
      console.log('Debug - 跳过连接，因为已经在重连中', {
        instanceId: this.instanceId,
        reconnecting: this.reconnecting,
        connectionState: this.connectionState,
        stack: new Error().stack
      });
      return;
    }

    try {
      this.connectionState = 'connecting';
      console.log('Debug - 开始创建 WebSocket 连接', {
        instanceId: this.instanceId,
        url: this.url,
        reconnectAttempts: this.reconnectAttempts,
        maxReconnectAttempts: this.maxReconnectAttempts,
        reconnecting: this.reconnecting,
        userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : 'unknown',
        protocol: typeof window !== 'undefined' ? window.location.protocol : 'unknown',
        hostname: typeof window !== 'undefined' ? window.location.hostname : 'unknown',
        stack: new Error().stack
      });

      if (typeof window !== 'undefined' && !window.navigator.onLine) {
        throw new Error('No network connection');
      }

      const connectionTimeout = setTimeout(() => {
        if (this.connectionState === 'connecting') {
          console.error('Debug - WebSocket 连接超时', {
            instanceId: this.instanceId,
            currentUrl: this.url,
            readyState: this.ws?.readyState,
            connectionState: this.connectionState,
            error: new Error().stack
          });
          this.ws?.close();
          this.connectionState = 'failed';
          this.emit('error', new Error('Connection timeout'));
        }
      }, 5000);

      console.log('Debug - WebSocket 连接前状态', {
        instanceId: this.instanceId,
        url: this.url,
        connectionState: this.connectionState,
        readyState: this.ws?.readyState,
        reconnecting: this.reconnecting
      });

      this.ws = new WebSocket(this.url);
      
      console.log('Debug - WebSocket 实例创建后状态', {
        instanceId: this.instanceId,
        url: this.url,
        connectionState: this.connectionState,
        readyState: this.ws?.readyState,
        reconnecting: this.reconnecting
      });

      this.ws.onopen = () => {
        clearTimeout(connectionTimeout);
        console.log('Debug - WebSocket 连接成功', {
          instanceId: this.instanceId,
          attempts: this.reconnectAttempts,
          url: this.url,
          readyState: this.ws?.readyState,
          protocol: this.ws?.protocol,
          extensions: this.ws?.extensions,
          stack: new Error().stack
        });
        this.connectionState = 'connected';
        this.reconnecting = false;
        this.reconnectAttempts = 0;
        this.emit('connected');
        
        setTimeout(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            console.log('Debug - 发送初始 getMetrics 请求', {
              instanceId: this.instanceId,
              readyState: this.ws.readyState
            });
            this.send(JSON.stringify({ type: 'getMetrics' }));
          }
        }, 100);
      };

      this.ws.onmessage = this.handleMessage.bind(this);

      this.ws.onclose = (event) => {
        clearTimeout(connectionTimeout);
        console.log('Debug - WebSocket 连接关闭', {
          instanceId: this.instanceId,
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
          connectionState: this.connectionState,
          stack: new Error().stack
        });
        
        this.cleanup();
        
        if (!event.wasClean) {
          this.handleReconnect();
        }
      };

      this.ws.onerror = (error) => {
        clearTimeout(connectionTimeout);
        console.error('Debug - WebSocket 错误', {
          instanceId: this.instanceId,
          error,
          connectionState: this.connectionState,
          url: this.url,
          readyState: this.ws?.readyState,
          stack: new Error().stack,
          errorType: error instanceof Error ? error.name : typeof error
        });
        this.connectionState = 'failed';
        this.emit('error', error);
      };

    } catch (error) {
      console.error('Debug - 创建 WebSocket 连接失败', {
        instanceId: this.instanceId,
        error,
        errorType: error instanceof Error ? error.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
        reconnecting: this.reconnecting,
        stack: new Error().stack
      });
      this.connectionState = 'failed';
      this.emit('error', error);
      this.handleReconnect();
    }
  }

  private handleReconnect() {
    if (this.reconnecting) {
      console.log('Debug - 已在重连中，跳过', {
        instanceId: this.instanceId,
        connectionState: this.connectionState,
        reconnectAttempts: this.reconnectAttempts
      });
      return;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Debug - 达到最大重连次数', {
        instanceId: this.instanceId,
        attempts: this.reconnectAttempts,
        connectionState: this.connectionState
      });
      this.connectionState = 'failed';
      this.emit('maxReconnectAttemptsReached');
      return;
    }

    this.reconnecting = true;
    this.reconnectAttempts++;
    
    const delay = Math.min(
      this.reconnectTimeout * Math.pow(2, this.reconnectAttempts - 1),
      30000
    );

    console.log('Debug - 准备重连', {
      instanceId: this.instanceId,
      attempt: this.reconnectAttempts,
      delay,
      maxAttempts: this.maxReconnectAttempts,
      connectionState: this.connectionState,
      reconnecting: this.reconnecting
    });

    if ((this as any).reconnectTimer) {
      clearTimeout((this as any).reconnectTimer);
      (this as any).reconnectTimer = null;
    }

    (this as any).reconnectTimer = setTimeout(() => {
      console.log('Debug - 执行重连', {
        instanceId: this.instanceId,
        connectionState: this.connectionState,
        reconnecting: this.reconnecting,
        reconnectAttempts: this.reconnectAttempts
      });

      if (this.connectionState === 'connected') {
        console.log('Debug - 已连接，取消重连', {
          instanceId: this.instanceId,
          connectionState: this.connectionState
        });
        this.reconnecting = false;
        return;
      }

      if (this.connectionState === 'connecting') {
        console.log('Debug - 正在连接中，等待连接完成', {
          instanceId: this.instanceId,
          connectionState: this.connectionState
        });
        return;
      }

      this.connectionState = 'disconnected';
      this.connect();
    }, delay);
  }

  private cleanup() {
    console.log('Debug - WebSocket清理资源', {
      instanceId: this.instanceId,
      hadWs: !!this.ws,
      connectionState: this.connectionState,
      reconnecting: this.reconnecting,
      reconnectAttempts: this.reconnectAttempts
    });
    
    if ((this as any).reconnectTimer) {
      clearTimeout((this as any).reconnectTimer);
      (this as any).reconnectTimer = null;
    }
    
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.onopen = null;
      this.ws = null;
    }
    
    this.connectionState = 'disconnected';
  }

  public close() {
    console.log('Debug - WebSocket关闭连接', {
      instanceId: this.instanceId,
      url: this.url,
      readyState: this.ws?.readyState,
      connectionState: this.connectionState
    })
    this.reconnecting = false
    if (this.ws) {
      this.ws.close()
    }
    this.cleanup()
    this.removeAllListeners()
    WebSocketClient.instanceCount--
    WebSocketClient.instance = null
    WebSocketClient.lastUrl = null
    this.messageQueue.forEach(msg => {
      msg.reject(new Error('WebSocket connection closed'));
    });
    this.messageQueue = [];
  }

  public send(data: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data)
    } else {
      console.warn('Debug - WebSocket 未连接，无法发送数据', {
        instanceId: this.instanceId,
        connectionState: this.connectionState,
        readyState: this.ws?.readyState
      })
    }
  }

  public getStatus() {
    return {
      instanceId: this.instanceId,
      connectionState: this.connectionState,
      reconnectAttempts: this.reconnectAttempts,
      readyState: this.ws?.readyState
    }
  }

  public async sendConfigUpdate(config: ServerConfig, files?: Array<{ path: string; content: string }>): Promise<void> {
    return this.sendWithResponse({
      type: 'configUpdate',
      data: {
        config,
        files
      }
    });
  }

  public async sendFileUpload(path: string, content: string, type: 'cert' | 'key' | 'other'): Promise<void> {
    return this.sendWithResponse({
      type: 'fileUpload',
      data: {
        path,
        content,
        type
      }
    });
  }

  public async validateConfig(config: ServerConfig): Promise<ValidationResult> {
    return this.sendWithResponse({
      type: 'configValidate',
      data: config
    });
  }

  public async deleteFile(path: string): Promise<void> {
    return this.sendWithResponse({
      type: 'deleteFile',
      data: { path }
    });
  }

  public async getServiceStatus(): Promise<ServiceStatus> {
    return this.sendWithResponse({
      type: 'getServiceStatus',
      data: null
    });
  }

  private async sendWithResponse<T>(message: { type: string; data?: any }): Promise<T> {
    return new Promise((resolve, reject) => {
      try {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
          throw new Error('WebSocket is not connected');
        }

        const id = Math.random().toString(36).substring(2, 15);
        const pendingMessage: PendingMessage = {
          type: message.type,
          id,
          resolve,
          reject,
          timestamp: Date.now()
        };

        this.messageQueue.push(pendingMessage);

        setTimeout(() => {
          const index = this.messageQueue.findIndex(msg => msg === pendingMessage);
          if (index !== -1) {
            this.messageQueue.splice(index, 1);
            reject(new Error('Request timeout'));
          }
        }, this.messageTimeout);

        this.send(JSON.stringify({ ...message, id }));

      } catch (error) {
        reject(error);
      }
    });
  }

  private handleMessage(event: MessageEvent) {
    try {
      const data = JSON.parse(event.data);
      
      console.log('Debug - 收到 WebSocket 消息:', {
        instanceId: this.instanceId,
        data
      });

      if (!data || typeof data !== 'object') {
        console.warn('Debug - 收到无效的消息格式:', data);
        return;
      }

      if (data.metrics || (data.serverMetrics && data.systemMetrics)) {
        this.emit('metrics', {
          serverMetrics: data.serverMetrics || data.metrics?.serverMetrics,
          systemMetrics: data.systemMetrics || data.metrics?.systemMetrics,
          timestamp: data.timestamp,
          totalRequests: data.totalRequests,
          activeConnections: data.activeConnections
        });
        return;
      }

      if (data.type && typeof data.type === 'string' && data.type.endsWith('Response')) {
        const requestType = data.type.replace('Response', '');
        const pendingMessage = this.messageQueue.find(
          msg => msg.type === requestType
        );

        if (pendingMessage) {
          this.messageQueue = this.messageQueue.filter(msg => msg !== pendingMessage);

          if (data.error) {
            pendingMessage.reject(new Error(data.error));
          } else {
            pendingMessage.resolve(data.data);
          }
        }
        return;
      }

      if (data.status) {
        this.emit('status', data.status);
        return;
      }

      if (data.error) {
        this.emit('error', new Error(data.error));
        return;
      }

      if (data.type) {
        this.emit(data.type, data);
        return;
      }

      console.warn('Debug - 未处理的消息类型:', {
        instanceId: this.instanceId,
        data
      });

    } catch (error) {
      console.error('Debug - 解析 WebSocket 消息失败:', {
        instanceId: this.instanceId,
        error,
        rawData: event.data
      });
      this.emit('error', error);
    }
  }
}

export function getWebSocketClient(): WebSocketClient {
  const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  const wsProtocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  
  const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 
                `${wsProtocol}//${hostname}:3001`;
  
  if (!WebSocketClient.instance || WebSocketClient.lastUrl !== wsUrl) {
    console.log('Debug - 初始化 WebSocket 客户端:', {
      wsUrl,
      env: process.env.NEXT_PUBLIC_WS_URL,
      hostname,
      protocol: wsProtocol,
      userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : 'unknown'
    });
  }
  
  return WebSocketClient.getInstance(wsUrl);
}