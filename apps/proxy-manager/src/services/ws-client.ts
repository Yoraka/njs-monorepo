import { EventEmitter } from 'events'
import { MetricsData } from '@/types/metrics'

export class WebSocketClient extends EventEmitter {
  public ws: WebSocket | null = null
  private url: string
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectTimeout = 1000
  private static instanceCount = 0;

  constructor(url: string) {
    super()
    WebSocketClient.instanceCount++;
    console.log('Debug - WebSocket实例创建', {
      instanceCount: WebSocketClient.instanceCount,
      url: url
    })
    this.url = url
    this.connect()
  }

  private connect() {
    try {
      this.ws = new WebSocket(this.url)
      
      this.ws.onopen = () => {
        console.log('Debug - WebSocket 连接成功')
        this.reconnectAttempts = 0
        this.emit('connected')
        this.send(JSON.stringify({ type: 'getMetrics' }))
      }

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as MetricsData
          console.log('Debug - WebSocket 收到数据:', {
            timestamp: data.timestamp,
            serverCount: Object.keys(data.serverMetrics || {}).length,
            servers: Object.keys(data.serverMetrics || {})
          })
          this.emit('metrics', data)
        } catch (error) {
          console.error('Debug - 解析 WebSocket 消息失败:', error)
        }
      }

      this.ws.onclose = (event) => {
        console.log('WebSocket disconnected, code:', event.code, 'reason:', event.reason)
        this.cleanup()
        this.handleReconnect()
      }

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error)
      }

    } catch (error) {
      console.error('Debug - 创建 WebSocket 连接失败:', error)
      this.handleReconnect()
    }
  }

  private handleReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++
      const delay = this.reconnectTimeout
      console.log(`Attempting to reconnect in ${delay}ms...`)
      
      setTimeout(() => {
        this.connect()
      }, delay)
    } else {
      console.error('Max reconnection attempts reached')
      this.emit('maxReconnectAttemptsReached')
    }
  }

  private cleanup() {
    console.log('Debug - WebSocket清理资源', {
      hadWs: !!this.ws
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
      url: this.url,
      readyState: this.ws?.readyState
    })
    if (this.ws) {
      this.ws.close()
    }
    this.cleanup()
    this.removeAllListeners()
    WebSocketClient.instanceCount--;
  }

  public send(data: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data)
    } else {
      console.warn('Debug - WebSocket 未连接，无法发送数据')
    }
  }
}

// 创建单例实例
let wsClientInstance: WebSocketClient | null = null

export function getWebSocketClient(): WebSocketClient {
  if (!wsClientInstance) {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080/ws'
    wsClientInstance = new WebSocketClient(wsUrl)
  }
  return wsClientInstance
}