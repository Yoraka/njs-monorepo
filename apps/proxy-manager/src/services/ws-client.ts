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
  private static instance: WebSocketClient | null = null
  public ws: WebSocket | null = null
  private url: string
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectTimeout = 1000
  private static instanceCount = 0
  private reconnecting = false
  private instanceId: string
  private connectionState: 'connecting' | 'connected' | 'disconnected' | 'failed' = 'disconnected'
  private messageQueue: Array<PendingMessage> = [];
  private messageTimeout = 30000; // 30秒超时

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
    if (!this.instance) {
      this.instance = new WebSocketClient(url)
    }
    return this.instance
  }

  private connect() {
    if (this.reconnecting || this.ws?.readyState === WebSocket.CONNECTING) {
      return
    }

    try {
      this.connectionState = 'connecting'
      console.log('Debug - 开始创建 WebSocket 连接', {
        instanceId: this.instanceId,
        url: this.url
      })

      const connectionTimeout = setTimeout(() => {
        if (this.connectionState === 'connecting') {
          console.error('Debug - WebSocket 连接超时，尝试使用备用地址')
          this.url = this.url.replace('localhost', '127.0.0.1')
          this.ws?.close()
          this.connectionState = 'failed'
          this.emit('error', new Error('Connection timeout'))
        }
      }, 5000)

      this.ws = new WebSocket(this.url)
      
      this.ws.onopen = () => {
        clearTimeout(connectionTimeout)
        console.log('Debug - WebSocket 连接成功', {
          instanceId: this.instanceId,
          attempts: this.reconnectAttempts
        })
        this.connectionState = 'connected'
        this.reconnecting = false
        this.reconnectAttempts = 0
        this.emit('connected')
        this.send(JSON.stringify({ type: 'getMetrics' }))
      }

      this.ws.onmessage = this.handleMessage.bind(this)

      this.ws.onclose = (event) => {
        clearTimeout(connectionTimeout)
        console.log('WebSocket disconnected', {
          instanceId: this.instanceId,
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean
        })
        this.connectionState = 'disconnected'
        this.cleanup()
        this.handleReconnect()
      }

      this.ws.onerror = (error) => {
        clearTimeout(connectionTimeout)
        console.error('WebSocket error:', {
          instanceId: this.instanceId,
          error,
          connectionState: this.connectionState
        })
        this.connectionState = 'failed'
        this.emit('error', error)
      }

    } catch (error) {
      console.error('Debug - 创建 WebSocket 连接失败:', {
        instanceId: this.instanceId,
        error
      })
      this.connectionState = 'failed'
      this.emit('error', error)
      this.handleReconnect()
    }
  }

  private handleReconnect() {
    if (this.reconnecting) {
      return
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('达到最大重连次数', {
        instanceId: this.instanceId,
        attempts: this.reconnectAttempts
      })
      this.connectionState = 'failed'
      this.emit('maxReconnectAttemptsReached')
      return
    }

    this.reconnecting = true
    this.reconnectAttempts++
    const delay = Math.min(
      this.reconnectTimeout * Math.pow(2, this.reconnectAttempts - 1),
      30000
    )

    console.log('准备重连', {
      instanceId: this.instanceId,
      attempt: this.reconnectAttempts,
      delay,
      maxAttempts: this.maxReconnectAttempts
    })
    
    setTimeout(() => {
      this.reconnecting = false
      this.connect()
    }, delay)
  }

  private cleanup() {
    console.log('Debug - WebSocket清理资源', {
      instanceId: this.instanceId,
      hadWs: !!this.ws,
      connectionState: this.connectionState
    })
    if (this.ws) {
      this.ws.onclose = null
      this.ws.onerror = null
      this.ws.onmessage = null
      this.ws.onopen = null
      this.ws = null
    }
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

  private async sendWithResponse(message: any): Promise<any> {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }

    return new Promise((resolve, reject) => {
      const id = `${message.type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const timestamp = Date.now();

      // 添加到消息队列
      this.messageQueue.push({
        type: message.type,
        id,
        resolve,
        reject,
        timestamp
      });

      // 设置超时
      setTimeout(() => {
        const index = this.messageQueue.findIndex(msg => msg.id === id);
        if (index !== -1) {
          const msg = this.messageQueue[index];
          this.messageQueue.splice(index, 1);
          msg.reject(new Error('Request timeout'));
        }
      }, this.messageTimeout);

      // 发送消息
      this.send(JSON.stringify({
        ...message,
        id,
        timestamp
      }));
    });
  }

  private handleMessage(event: MessageEvent): void {
    try {
      const data = JSON.parse(event.data);
      
      // 处理监控数据
      if (data.type === 'metrics') {
        this.emit('metrics', data);
        return;
      }

      // 处理响应消息
      if (data.type.endsWith('Response')) {
        const requestType = data.type.replace('Response', '');
        const pendingMessage = this.messageQueue.find(
          msg => msg.type === requestType
        );

        if (pendingMessage) {
          this.messageQueue = this.messageQueue.filter(msg => msg !== pendingMessage);
          
          if (data.success) {
            pendingMessage.resolve(data.data);
          } else {
            pendingMessage.reject(new Error(data.error));
          }
        }
        return;
      }

      // 处理其他消息类型
      this.emit(data.type, data);
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  }
}

export function getWebSocketClient(): WebSocketClient {
  const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 
                'ws://127.0.0.1:3001/ws' || 
                'ws://localhost:3001/ws'
  return WebSocketClient.getInstance(wsUrl)
}