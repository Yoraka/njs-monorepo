/**
 * 上游服务器池接口
 * 前端配置使用
 */
export interface UpstreamPool {
    id: string;
    name: string;
    description?: string;
    servers: UpstreamServer[];
    healthCheck?: HealthCheckConfig;
    balancer: string;
}

/**
 * 主配置接口
 */
export interface JsonConfig {
    upstreams: UpstreamConfig[];
    servers: ServerConfig[];
    ssl?: SSLConfig;
    logging: LoggingConfig;
    monitoring: MonitoringConfig;
}

/**
 * 服务器配置接口
 */
export interface ServerConfig {
    name: string;
    listen: number;
    serverName?: string[];
    locations: LocationConfig[];
    healthCheck?: HealthCheckConfig;
    headers?: HeadersConfig;
    rateLimit?: RateLimitConfig;
    ipFilter?: IPFilterConfig;
    csrf?: CSRFConfig;
    ssl?: SSLConfig;
}

/**
 * 位置配置接口
 */
export interface LocationConfig {
    path: string;
    upstream?: string;
    proxy_pass?: string;
    targets?: UpstreamServer[];
    balancer: string;
    root?: string;
    return?: string;
    healthCheck?: HealthCheckConfig;
    headers?: HeadersConfig;
    rateLimit?: RateLimitConfig;
    ipFilter?: IPFilterConfig;
    proxyTimeout?: number;
    proxyBuffering?: boolean;
    caching?: {
        enabled: boolean;
        maxAge: number;
        methods: string[];
    };
    csrf?: CSRFConfig;
}

/**
 * CSRF 配置接口
 */
export interface CSRFConfig {
    enabled?: boolean;
    forced?: boolean;  // 强制所有请求都检查
    customPaths?: string[];  // 自定义保护路径
    excludePaths?: string[]; // 排除路径
    tokenNames?: string[];   // 自定义 token 名称
}

/**
 * 上游服务器接口
 */
export interface UpstreamServer {
    url: string;
    weight?: number;
    backup?: boolean;
    down?: boolean;
    secure?: boolean;
    headers?: {
        add?: { [key: string]: string };
        remove?: string[];
    };
}

/**
 * 请求头配置接口
 */
export interface HeadersConfig {
    add?: { [key: string]: string };
    remove?: string[];
}

/**
 * 速率限制配置接口
 */
export interface RateLimitConfig {
    windowMs: number;
    max: number;
    message?: string;
    statusCode?: number;
}

/**
 * IP过滤配置接口
 */
export interface IPFilterConfig {
    blacklist?: string[];
    whitelist?: string[];
}

/**
 * SSL配置接口
 */
export interface SSLConfig {
    enabled: boolean;
    cert: string;
    key: string;
    http2: boolean;
    protocols: string[];
    sslRedirect: boolean;
    clientCertificate: {
        enabled: boolean;
        verify: 'optional' | 'require';
    };
}

/**
 * 日志配置接口
 */
export interface LoggingConfig {
    level: string;
    file: string;
}

/**
 * 监控配置接口
 */
export interface MonitoringConfig {
    enabled: boolean;
    wsPort?: number;
    pushInterval: number;
    metrics: string[];
    dashboard?: {
        enabled: boolean;
        path: string;
        auth?: {
            username: string;
            password: string;
        }
    }
}

/**
 * 健康检查配置接口
 */
export interface HealthCheckConfig {
    type: 'http' | 'tcp';
    path?: string;
    interval: number;
    timeout: number;
    retries: number;
    enabled?: boolean;
    headers?: { [key: string]: string };
    expectedStatus?: number[];
    expectedBody?: string | RegExp;
    followRedirects?: boolean;
    allowInsecure?: boolean;
    tcpOptions?: {
        port?: number;
        host?: string;
    };
    onSuccess?: (target: string) => void;
    onError?: (target: string, error: Error) => void;
}

/**
 * 代理统计接口
 */
export interface ProxyStats {
    totalProxies: number;
    activeProxies: number;
    totalTraffic: string;
    activeConnections: number;
}

/**
 * 监控数据接���
 */
export interface MonitoringData {
    activeConnections: number;
    totalRequests: number;
    serverMetrics: { [serverName: string]: ServerMetrics };
    systemMetrics: SystemMetrics;
    timestamp: number;
}

/**
 * 服务器指标接口
 */
export interface ServerMetrics {
    incomingTraffic: number;
    outgoingTraffic: number;
    activeConnections: number;
    totalRequests: number;
}

/**
 * 系统指标接口
 */
export interface SystemMetrics {
    cpuUsage: number;
    memoryUsage: number;
    diskIO: number;
}

/**
 * 配置字段接口
 */
export interface ConfigField {
    id: string;
    title: string;
    type: 'text' | 'number' | 'boolean' | 'select' | 'array' | 'object' | 'keyValue';
    description?: string;
    required?: boolean;
    defaultValue?: any;
    options?: { label: string; value: any }[];
    validation?: {
        min?: number;
        max?: number;
        pattern?: string;
        message?: string;
    };
    children?: ConfigField[];
    fields?: ConfigField[];
}

/**
 * 配置组接口
 */
export interface ConfigGroup {
    id: string;
    title: string;
    fields: ConfigField[];
}

/**
 * 上游服务器组配置接口
 */
export interface UpstreamConfig {
    name: string;
    balancer: string;
    servers: UpstreamServer[];
    healthCheck?: HealthCheckConfig;
}

/**
 * WebSocket基础消息接口
 */
export interface WebSocketMessage {
  type: string;
  id: string;
  data: any;
  timestamp: number;
}

/**
 * 配置更新消息接口
 */
export interface ConfigUpdateMessage extends WebSocketMessage {
  type: 'configUpdate';
  data: {
    config: ServerConfig;
    files?: Array<{
      path: string;
      content: string;
    }>;
  };
}

/**
 * 文件上传消息接口
 */
export interface FileUploadMessage extends WebSocketMessage {
  type: 'fileUpload';
  data: {
    path: string;
    content: string;
    type: 'cert' | 'key' | 'other';
  };
}

/**
 * 配置验证结果接口
 */
export interface ValidationResult {
  valid: boolean;
  warnings: string[];
  errors: string[];
}

/**
 * 服务状态接口
 */
export interface ServiceStatus {
  isRunning: boolean;
  uptime: number;
  activeConnections: number;
  lastRestart?: number;
  version?: string;
  pid?: number;
  memoryUsage?: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
  };
}