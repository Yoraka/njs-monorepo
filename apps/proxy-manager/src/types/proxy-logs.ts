// 日志条目的基础接口
export interface BaseLogEntry {
  timestamp: string
  type: 'request' | 'response' | 'connection' | 'close' | 'other'
  headerSize?: number
  clientIp?: string
}

// 访问日志条目
export interface AccessLogEntry {
  timestamp: string
  clientIp: string
  url: string
  path: string
  query: string
  host: string
  status: string
  upStatus?: string
  referer: string
  userAgent: string
  cookie: string
  headerSize: number
}

// 默认日志的不同类型
export interface RequestLogEntry extends BaseLogEntry {
  type: 'request'
  host: string
  path: string
  bodySize: number
  headerSize: number
  clientIp?: string
}

export interface ResponseLogEntry extends BaseLogEntry {
  type: 'response'
  host: string
  status: string
  bodySize: number
  headerSize: number
}

// 连接相关的日志类型
export interface ConnectionLogEntry extends BaseLogEntry {
  type: 'connection'
  clientIp: string
  serverPort: string
  connectionType: 'client_connection' | 'client_disconnect'
}

export interface CloseLogEntry extends BaseLogEntry {
  type: 'close'
  closeType: 'socket_close'
}

// 统一的默认日志类型
export type DefaultLogEntry = 
  | RequestLogEntry 
  | ResponseLogEntry 
  | ConnectionLogEntry 
  | CloseLogEntry 
  | (BaseLogEntry & { type: 'other' })

// 域名流量统计保持不变
export interface DomainTraffic {
  domain: string
  headerSizeTotal: number
  bodySizeTotal: number
  requestCount: number
  lastUpdate: string
  trafficByHour: {
    [hour: string]: {
      headerSize: number
      bodySize: number
      count: number
    }
  }
}

// 总体流量统计保持不变
export interface TrafficStats {
  domains: { [domain: string]: DomainTraffic }
  totalTraffic: number
  totalRequests: number
  lastUpdate: string
}

// 数据库模型类型需要添加一些字段
export interface TrafficRecord {
  id: string
  timestamp: Date
  domain: string
  headerSize: number
  bodySize: number
  path: string
  clientIp: string
  status?: string        // 添加状态码字段
  requestType: string    // 添加请求类型字段
  responseTime?: number  // 可选：添加响应时间字段
}

interface LogPatterns {
  timestamp: string
  host?: string
  path?: string
  size?: number
  clientIp?: string
  status?: string
  type: 'request' | 'response' | 'connection' | 'close' | 'other'
  connectionType?: 'client_connection' | 'client_disconnect'
  closeType?: 'socket_close'
}