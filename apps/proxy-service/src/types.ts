/**
 * 主配置接口
 */
export interface Config {
    upstreams: UpstreamConfig[];
    servers: ServerConfig[];
    ssl?: SSLConfig;
    logging: LoggingConfig;
    monitoring: MonitoringConfig;
  }
  
  /**
   * 上游服务器组配置
   */
  export interface UpstreamConfig {
    name: string;
    balancer: string;
    servers: UpstreamServer[];
    healthCheck?: HealthCheckConfig;
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
    key: string;
    cert: string;
    http2?: boolean;
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
    enabled?: boolean;
    type?: 'http' | 'tcp';
    path?: string;
    interval?: number;
    timeout?: number;
    retries?: number;
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
   * 监控数据接口
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
    memoryPercentage: number;
    diskUsage: number;
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
    forced?: boolean;     // 强制所有请求都检查
    customPaths?: string[]; // 自定义保护路径
    excludePaths?: string[]; // 排除路径
    tokenNames?: string[];   // 自定义 token 名称
  }