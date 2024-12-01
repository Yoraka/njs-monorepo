import { RollingCache } from '@/lib/cache'
import { MetricsData, ServerMetrics, SystemMetrics } from '@/types/metrics'
import { prisma } from '@/prisma'
import { getWebSocketClient } from './ws-client'

export interface RateMetrics {
  requestsPerSecond: number
  bandwidthIn: number  // KB/s
  bandwidthOut: number // KB/s
  activeConnections: number
}

export class MetricsManager {
  private static instance: MetricsManager | null = null
  private metricsCache: RollingCache<MetricsData>
  private aggregationInterval: number
  private aggregationTimer: NodeJS.Timeout | null = null
  private wsClient: ReturnType<typeof getWebSocketClient>
  private isInitialized: boolean = false

  private constructor() {
    // 90秒的缓存，每5秒一条数据，所以是18条数据
    this.metricsCache = new RollingCache<MetricsData>(18)
    this.aggregationInterval = parseInt(process.env.METRICS_AGGREGATION_INTERVAL || '60', 10)
    
    // 验证聚合间隔
    if (this.aggregationInterval > 60) {
      this.aggregationInterval = 60
    }

    this.wsClient = getWebSocketClient()
  }

  public static getInstance(): MetricsManager {
    if (!MetricsManager.instance) {
      MetricsManager.instance = new MetricsManager()
    }
    return MetricsManager.instance
  }

  public async initialize() {
    if (this.isInitialized) {
      console.log('Debug - MetricsManager 已经初始化')
      return
    }

    try {
      console.log('Debug - 开始初始化 MetricsManager')
      
      // 监听 metrics 事件
      this.wsClient.on('metrics', (data: MetricsData) => {
        console.log('Debug - MetricsManager 收到新数据:', data)
        this.handleNewMetrics(data)
      })

      // 等待连接成功
      await new Promise<void>((resolve, reject) => {
        if (this.wsClient.ws?.readyState === WebSocket.OPEN) {
          console.log('Debug - WebSocket 已连接')
          resolve()
        } else {
          this.wsClient.once('connected', () => {
            console.log('Debug - WebSocket 连接成功')
            resolve()
          })
          
          setTimeout(() => {
            reject(new Error('WebSocket 连接超时'))
          }, 5000)
        }
      })

      this.startAggregation()
      console.log('Debug - 聚合定时器已启动')

      this.isInitialized = true
      console.log('Debug - MetricsManager 初始化完成')
    } catch (error) {
      console.error('Debug - MetricsManager 初始化失败:', error)
      this.isInitialized = false
      throw error
    }
  }

  private startAggregation() {
    if (this.aggregationTimer) {
      clearInterval(this.aggregationTimer)
    }

    console.log('Debug - 启动聚合定时器', {
      聚合间隔: this.aggregationInterval,
      单位: '秒'
    })

    this.aggregationTimer = setInterval(() => {
      this.aggregateAndSave()
    }, this.aggregationInterval * 1000)
  }

  private async aggregateAndSave() {
    const metrics = this.metricsCache.getAll()
    console.log('Debug - 开始聚合数据', {
      缓存数据量: metrics.length,
      时间范围: metrics.length > 0 ? {
        开始: new Date(metrics[0].timestamp),
        结束: new Date(metrics[metrics.length - 1].timestamp)
      } : null
    })

    if (metrics.length < 2) return

    // 按服务器名称分组
    const serverGroups = new Map<string, MetricsData[]>()
    metrics.forEach(metric => {
      Object.entries(metric.serverMetrics).forEach(([serverName, _]) => {
        if (!serverGroups.has(serverName)) {
          serverGroups.set(serverName, [])
        }
        serverGroups.get(serverName)?.push(metric)
      })
    })

    // 聚合并保存每个服务器的指标
    const timestamp = new Date()
    for (const [serverName, serverMetrics] of serverGroups) {
      // 按时间戳排序
      const sortedMetrics = serverMetrics.sort((a, b) => a.timestamp - b.timestamp)
      if (sortedMetrics.length < 2) continue

      // 获取时间窗口的第一个和最后一个数据点
      const firstMetric = sortedMetrics[0]
      const lastMetric = sortedMetrics[sortedMetrics.length - 1]
      
      // 计算整个时间窗口的时间差（秒）
      const timeSpan = (lastMetric.timestamp - firstMetric.timestamp) / 1000
      if (timeSpan <= 0) continue

      const firstServerMetrics = firstMetric.serverMetrics[serverName]
      const lastServerMetrics = lastMetric.serverMetrics[serverName]

      // 计算整个时间窗口的总增量
      const requestDiff = lastServerMetrics.totalRequests - firstServerMetrics.totalRequests
      const inboundDiff = lastServerMetrics.incomingTraffic - firstServerMetrics.incomingTraffic
      const outboundDiff = lastServerMetrics.outgoingTraffic - firstServerMetrics.outgoingTraffic

      console.log('Debug - 保存增量数据', {
        服务器: serverName,
        时间戳: timestamp,
        时间窗口: {
          开始: new Date(firstMetric.timestamp),
          结束: new Date(lastMetric.timestamp),
          时间差_秒: timeSpan
        },
        数据点数量: sortedMetrics.length,
        总请求增量: requestDiff,
        总入站流量增量: inboundDiff,
        总出站流量增量: outboundDiff,
        当前连接数: lastServerMetrics.activeConnections
      })

      // 保存90秒窗口的总增量
      await prisma.serverMetrics.create({
        data: {
          timestamp,
          serverName,
          requestCount: Math.max(0, requestDiff),
          inboundTraffic: Math.max(0, inboundDiff),
          outboundTraffic: Math.max(0, outboundDiff),
          connections: lastServerMetrics.activeConnections
        }
      })
    }
  }

  private calculateServerAverage(metrics: MetricsData[], serverName: string): ServerMetrics {
    const validMetrics = metrics.filter(m => m.serverMetrics[serverName])
    const count = validMetrics.length

    return {
      incomingTraffic: validMetrics.reduce((sum, m) => sum + m.serverMetrics[serverName].incomingTraffic, 0) / count,
      outgoingTraffic: validMetrics.reduce((sum, m) => sum + m.serverMetrics[serverName].outgoingTraffic, 0) / count,
      activeConnections: Math.round(validMetrics.reduce((sum, m) => sum + m.serverMetrics[serverName].activeConnections, 0) / count),
      totalRequests: validMetrics.reduce((sum, m) => sum + m.serverMetrics[serverName].totalRequests, 0)
    }
  }

  // 处理新的指标数据
  private handleNewMetrics(data: MetricsData) {
    if (!data || !data.serverMetrics) {
      console.warn('Debug - 收到无效的 metrics 数据')
      return
    }
    
    console.log('Debug - 处理新的 metrics 数据 - 详细信息:', {
      新数据: {
        timestamp: data.timestamp,
        totalRequests: data.totalRequests,
        serverMetrics: data.serverMetrics
      },
      缓存中最新数据: {
        timestamp: this.metricsCache.getLast(1)[0]?.timestamp,
        totalRequests: this.metricsCache.getLast(1)[0]?.totalRequests,
        serverMetrics: this.metricsCache.getLast(1)[0]?.serverMetrics
      },
      缓存大小: this.metricsCache.getAll().length
    })

    const metricsData = {
      ...data,
      timestamp: data.timestamp || Date.now()
    }

    console.log('Debug - 添加到缓存前的数据:', metricsData)
    this.metricsCache.add(metricsData)
    console.log('Debug - 添加到缓存后的验证:', this.metricsCache.getLast(1)[0])
    
    // 验证数据是否成功添加到缓存
    const cacheData = this.metricsCache.getAll()
    // console.log('Debug - 缓存完整状态:', {
    //   缓存大小: cacheData.length,
    //   所有时间戳: cacheData.map(d => ({
    //     timestamp: d.timestamp,
    //     totalRequests: d.totalRequests,
    //     serverMetrics: d.serverMetrics
    //   }))
    // })
  }

  // 获取最新的系统指标
  public getLatestSystemMetrics(): SystemMetrics | null {
    const latest = this.metricsCache.getLast(1)[0]
    return latest?.systemMetrics || null
  }

  // 获取最新的服务器指标
  public getLatestServerMetrics(serverName: string): ServerMetrics | null {
    const latest = this.metricsCache.getLast(1)[0]
    return latest?.serverMetrics[serverName] || null
  }

  // 获取所有最新指标
  public getLatestMetrics(): MetricsData | null {
    return this.metricsCache.getLast(1)[0] || null
  }

  // 清理资源
  public dispose() {
    if (this.isInitialized) {
      if (this.aggregationTimer) {
        clearInterval(this.aggregationTimer)
        this.aggregationTimer = null
      }
      this.wsClient.close()
      this.isInitialized = false
    }
  }

  // 新增：计算速率的方法
  public calculateRates(serverName: string): RateMetrics {
    const latestMetrics = this.metricsCache.getLast(2)
    
    // 确保按时间戳降序排序（最新的在前）
    latestMetrics.sort((a, b) => b.timestamp - a.timestamp)
    
    console.log('Debug - calculateRates 原始数据:', {
      newest: latestMetrics[0]?.serverMetrics[serverName],
      older: latestMetrics[1]?.serverMetrics[serverName],
      newestTime: latestMetrics[0]?.timestamp,
      olderTime: latestMetrics[1]?.timestamp
    })
    
    if (latestMetrics.length < 2) {
      console.log('Debug - 数据点不足')
      return {
        requestsPerSecond: 0,
        bandwidthIn: 0,
        bandwidthOut: 0,
        activeConnections: 0
      }
    }

    const newest = latestMetrics[0]
    const older = latestMetrics[1]
    
    // 确保有指定服务器的数据
    if (!newest?.serverMetrics[serverName] || !older?.serverMetrics[serverName]) {
      console.log('Debug - 服务器数据缺失')
      return {
        requestsPerSecond: 0,
        bandwidthIn: 0,
        bandwidthOut: 0,
        activeConnections: 0
      }
    }

    // 直接使用时间戳计算时间差（毫秒转秒）
    const timeSpan = (newest.timestamp - older.timestamp) / 1000
    console.log('Debug - 时间差(秒):', timeSpan)

    if (timeSpan <= 0) {
      console.log('Debug - 时间差异常')
      return {
        requestsPerSecond: 0,
        bandwidthIn: 0,
        bandwidthOut: 0,
        activeConnections: 0
      }
    }

    const currentMetrics = newest.serverMetrics[serverName]
    const previousMetrics = older.serverMetrics[serverName]

    // 计算差值
    const requestDiff = currentMetrics.totalRequests - previousMetrics.totalRequests
    const inboundDiff = currentMetrics.incomingTraffic - previousMetrics.incomingTraffic
    const outboundDiff = currentMetrics.outgoingTraffic - previousMetrics.outgoingTraffic

    console.log('Debug - 计算差值:', {
      requestDiff,
      inboundDiff,
      outboundDiff,
      timeSpan,
      currentConnections: currentMetrics.activeConnections
    })

    const rates = {
      requestsPerSecond: Math.max(0, Math.round(requestDiff / timeSpan)),
      bandwidthIn: Math.max(0, Math.round((inboundDiff / 1024) / timeSpan)),
      bandwidthOut: Math.max(0, Math.round((outboundDiff / 1024) / timeSpan)),
      activeConnections: Math.max(0, currentMetrics.activeConnections || 0)
    }

    console.log('Debug - 计算结果:', rates)
    return rates
  }

  // 添加一个辅助函数来生成完整的时间点序列
  private generateTimePoints(startDate: Date, endDate: Date, intervalMinutes: number): Date[] {
    const timePoints: Date[] = []
    let currentTime = new Date(startDate)
    
    while (currentTime <= endDate) {
      timePoints.push(new Date(currentTime))
      currentTime = new Date(currentTime.getTime() + intervalMinutes * 60 * 1000)
    }
    
    return timePoints
  }

  // 修改获取趋势数据的方法
  public async getTrendData(serverName: string, timeRange: string): Promise<Array<RateMetrics & { timestamp: Date }>> {
    const duration = parseInt(timeRange.replace(/[mh]/g, ''))
    const unit = timeRange.slice(-1)
    const minutes = unit === 'h' ? duration * 60 : duration
    
    const endDate = new Date()
    const startDate = new Date(endDate.getTime() - minutes * 60 * 1000)
    
    // 从数据库获取数据
    const metrics = await prisma.serverMetrics.findMany({
      where: {
        serverName,
        timestamp: {
          gte: startDate,
          lte: endDate
        }
      },
      orderBy: {
        timestamp: 'asc'
      }
    })

    if (!metrics.length) {
      console.log(`Debug - 没有找到服务器 ${serverName} 在时间范围 ${timeRange} 内的数据`)
      return []
    }

    // 确定聚合间隔（分钟）
    let aggregateInterval = 1
    if (minutes > 1440) { // 24小时以上
      aggregateInterval = 30
    } else if (minutes > 360) { // 6小时以上
      aggregateInterval = 10
    } else if (minutes > 180) { // 3小时以上
      aggregateInterval = 5
    } else if (minutes > 60) { // 1小时以上
      aggregateInterval = 2
    } else { // 1小时以内
      aggregateInterval = 1
    }

    const timePoints = this.generateTimePoints(startDate, endDate, aggregateInterval)

    const processedData = new Map<string, RateMetrics & { timestamp: Date }>()

    console.log('Debug - 趋势数据处理:', {
      timeRange,
      aggregateInterval: `${aggregateInterval}分钟`,
      原始数据点数: metrics.length
    })

    // 按时间分组并去重（处理重复聚合的问题）
    const timeGroups = new Map<string, typeof metrics[0][]>()
    metrics.forEach(metric => {
      // 对于1小时内的数据，保留分钟和秒
      const timeKey = new Date(metric.timestamp)
      if (minutes <= 60) {
        // 保留到秒级别，但按30秒分组
        timeKey.setSeconds(Math.floor(timeKey.getSeconds() / 30) * 30)
      } else {
        // 其他情况按分钟分组
        timeKey.setSeconds(0)
      }
      const key = timeKey.getTime().toString()
      
      if (!timeGroups.has(key)) {
        timeGroups.set(key, [])
      }
      timeGroups.get(key)?.push(metric)
    })

    // 对每个时间点的重复数据取平均值
    const deduplicatedMetrics: typeof metrics[0][] = []
    for (const [_, groupMetrics] of timeGroups) {
      if (groupMetrics.length > 0) {
        // 如果有多条数据，取平均值
        const avgMetric = {
          ...groupMetrics[0],
          requestCount: Math.round(groupMetrics.reduce((sum, m) => sum + m.requestCount, 0) / groupMetrics.length),
          inboundTraffic: Math.round(groupMetrics.reduce((sum, m) => sum + m.inboundTraffic, 0) / groupMetrics.length),
          outboundTraffic: Math.round(groupMetrics.reduce((sum, m) => sum + m.outboundTraffic, 0) / groupMetrics.length),
          connections: Math.round(groupMetrics.reduce((sum, m) => sum + m.connections, 0) / groupMetrics.length)
        }
        deduplicatedMetrics.push(avgMetric)
      }
    }

    // 按聚合间隔分组
    const aggregateGroups = new Map<string, typeof metrics[0][]>()
    deduplicatedMetrics.forEach(metric => {
      const timeKey = Math.floor(metric.timestamp.getTime() / (aggregateInterval * 60 * 1000)) * (aggregateInterval * 60 * 1000)
      if (!aggregateGroups.has(timeKey.toString())) {
        aggregateGroups.set(timeKey.toString(), [])
      }
      aggregateGroups.get(timeKey.toString())?.push(metric)
    })

    // 计算每个聚合时间点的速率
    const result: Array<RateMetrics & { timestamp: Date }> = []
    
    for (const [timeKey, groupMetrics] of aggregateGroups) {
      const timestamp = new Date(parseInt(timeKey))
      // 累加所有服务器的增量数据
      const totalRequests = groupMetrics.reduce((sum, m) => sum + m.requestCount, 0)
      const totalInbound = groupMetrics.reduce((sum, m) => sum + m.inboundTraffic, 0)
      const totalOutbound = groupMetrics.reduce((sum, m) => sum + m.outboundTraffic, 0)
      const totalConnections = groupMetrics.reduce((sum, m) => sum + m.connections, 0)

      // 转换为每秒速率
      const secondsInInterval = aggregateInterval * 60
      result.push({
        timestamp,
        requestsPerSecond: Math.round(totalRequests / secondsInInterval),
        bandwidthIn: Math.round((totalInbound / secondsInInterval)),
        bandwidthOut: Math.round((totalOutbound / secondsInInterval)),
        activeConnections: totalConnections
      })
    }

    result.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())

    return result
  }

  // 新增：获取所有服务器的聚合趋势数据
  public async getAggregatedTrendData(timeRange: string): Promise<Array<RateMetrics & { timestamp: Date }>> {
    const duration = parseInt(timeRange.replace(/[mh]/g, ''))
    const unit = timeRange.slice(-1)
    const minutes = unit === 'h' ? duration * 60 : duration
    
    const endDate = new Date()
    const startDate = new Date(endDate.getTime() - minutes * 60 * 1000)
    
    // 获取所有服务器的数据
    const metrics = await prisma.serverMetrics.findMany({
      where: {
        timestamp: {
          gte: startDate,
          lte: endDate
        }
      },
      orderBy: {
        timestamp: 'asc'
      }
    })

    if (!metrics.length) {
      console.log(`Debug - 在时间范围 ${timeRange} 内没有找到数据`)
      return []
    }

    // 确定聚合间隔（分钟）
    let aggregateInterval = 1
    if (minutes > 1440) { // 24小时以上
      aggregateInterval = 30
    } else if (minutes > 360) { // 6小时以上
      aggregateInterval = 10
    } else if (minutes > 180) { // 3小时以上
      aggregateInterval = 5
    } else if (minutes > 60) { // 1小时以上
      aggregateInterval = 2
    } else { // 1小时以内
      aggregateInterval = 1
    }

    console.log('Debug - 聚合趋势数据处理:', {
      timeRange,
      aggregateInterval: `${aggregateInterval}分钟`,
      原始数据点数: metrics.length
    })

    // 按时间分组并去重
    const timeGroups = new Map<string, typeof metrics[0][]>()
    metrics.forEach(metric => {
      // 对于1小时内的数据，保留分钟和秒
      const timeKey = new Date(metric.timestamp)
      if (minutes <= 60) {
        // 保留到秒级别，但按30秒分组
        timeKey.setSeconds(Math.floor(timeKey.getSeconds() / 30) * 30)
      } else {
        // 其他情况按分钟分组
        timeKey.setSeconds(0)
      }
      const key = timeKey.getTime().toString()
      
      if (!timeGroups.has(key)) {
        timeGroups.set(key, [])
      }
      timeGroups.get(key)?.push(metric)
    })

    // 对每个时间点的重复数据取平均值
    const deduplicatedMetrics: typeof metrics[0][] = []
    for (const [_, groupMetrics] of timeGroups) {
      if (groupMetrics.length > 0) {
        // 如果有多条数据，取平均值
        const avgMetric = {
          ...groupMetrics[0],
          requestCount: Math.round(groupMetrics.reduce((sum, m) => sum + m.requestCount, 0) / groupMetrics.length),
          inboundTraffic: Math.round(groupMetrics.reduce((sum, m) => sum + m.inboundTraffic, 0) / groupMetrics.length),
          outboundTraffic: Math.round(groupMetrics.reduce((sum, m) => sum + m.outboundTraffic, 0) / groupMetrics.length),
          connections: Math.round(groupMetrics.reduce((sum, m) => sum + m.connections, 0) / groupMetrics.length)
        }
        deduplicatedMetrics.push(avgMetric)
      }
    }

    // 按聚合间隔分组
    const aggregateGroups = new Map<string, typeof metrics[0][]>()
    deduplicatedMetrics.forEach(metric => {
      const timeKey = Math.floor(metric.timestamp.getTime() / (aggregateInterval * 60 * 1000)) * (aggregateInterval * 60 * 1000)
      if (!aggregateGroups.has(timeKey.toString())) {
        aggregateGroups.set(timeKey.toString(), [])
      }
      aggregateGroups.get(timeKey.toString())?.push(metric)
    })

    // 计算每个聚合时间点的速率
    const result: Array<RateMetrics & { timestamp: Date }> = []
    
    for (const [timeKey, groupMetrics] of aggregateGroups) {
      const timestamp = new Date(parseInt(timeKey))
      // 累加所有服务器的增量数据
      const totalRequests = groupMetrics.reduce((sum, m) => sum + m.requestCount, 0)
      const totalInbound = groupMetrics.reduce((sum, m) => sum + m.inboundTraffic, 0)
      const totalOutbound = groupMetrics.reduce((sum, m) => sum + m.outboundTraffic, 0)
      const totalConnections = groupMetrics.reduce((sum, m) => sum + m.connections, 0)

      // 转换为每秒速率
      const secondsInInterval = aggregateInterval * 60
      result.push({
        timestamp,
        requestsPerSecond: Math.round(totalRequests / secondsInInterval),
        bandwidthIn: Math.round((totalInbound / secondsInInterval)),
        bandwidthOut: Math.round((totalOutbound / secondsInInterval)),
        activeConnections: totalConnections
      })
    }

    return result.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
  }



  // 添加一个方法来检查缓存状态
  public debugCacheStatus() {
    const allData = this.metricsCache.getAll()
    console.log('Debug - Cache Status:', {
      totalItems: allData.length,
      timestamps: allData.map(d => d.timestamp),
      servers: allData.map(d => Object.keys(d.serverMetrics))
    })
  }
}

// 导出获取实例的方法
export function getMetricsManager(): MetricsManager {
  return MetricsManager.getInstance()
}