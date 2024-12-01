export interface ServerMetrics {
    incomingTraffic: number
    outgoingTraffic: number
    activeConnections: number
    totalRequests: number
  }
  
  export interface SystemMetrics {
    cpuUsage: number
    memoryUsage: number
    diskIO: number
  }
  
  export interface MetricsData {
    activeConnections: number
    totalRequests: number
    serverMetrics: Record<string, ServerMetrics>
    systemMetrics: SystemMetrics
    timestamp: number
  }