import { prisma } from '@/prisma'
import { ServerMetrics } from '@/types/metrics'

export class MetricsAggregator {
  // 获取指定时间范围内的服务器指标
  async getServerMetrics(serverName: string, startTime: Date, endTime: Date) {
    const metrics = await prisma.serverMetrics.findMany({
      where: {
        serverName,
        timestamp: {
          gte: startTime,
          lte: endTime
        }
      },
      orderBy: {
        timestamp: 'asc'
      }
    })

    return this.aggregateServerMetrics(metrics)
  }

  // 获取所有服务器在指定时间范围内的指标
  async getAllServerMetrics(startTime: Date, endTime: Date) {
    const metrics = await prisma.serverMetrics.findMany({
      where: {
        timestamp: {
          gte: startTime,
          lte: endTime
        }
      },
      orderBy: {
        timestamp: 'asc'
      }
    })

    // 按服务器分组
    const serverGroups = new Map<string, typeof metrics>()
    metrics.forEach(metric => {
      if (!serverGroups.has(metric.serverName)) {
        serverGroups.set(metric.serverName, [])
      }
      serverGroups.get(metric.serverName)?.push(metric)
    })

    // 聚合每个服务器的数据
    const result = new Map<string, ReturnType<typeof this.aggregateServerMetrics>>()
    for (const [serverName, serverMetrics] of serverGroups) {
      result.set(serverName, this.aggregateServerMetrics(serverMetrics))
    }

    return result
  }

  // 聚合服务器指标数据
  private aggregateServerMetrics(metrics: any[]) {
    if (!metrics.length) {
      console.log('Debug - 没有数据需要聚合')
      return null
    }

    console.log('Debug - 开始聚合数据:', {
      数据点数量: metrics.length,
      首条数据: metrics[0],
      末条数据: metrics[metrics.length - 1]
    })

    const timePoints = metrics.map(m => m.timestamp.getTime())
    const interval = this.calculateInterval(timePoints)
    
    // 按时间间隔分组
    const groups = new Map<number, typeof metrics>()
    metrics.forEach(metric => {
      const timeGroup = Math.floor(metric.timestamp.getTime() / interval) * interval
      if (!groups.has(timeGroup)) {
        groups.set(timeGroup, [])
      }
      groups.get(timeGroup)?.push(metric)
    })

    // 计算每个时间段的增量
    const result = Array.from(groups.entries()).map(([timestamp, groupMetrics], index, array) => {
      // 按时间排序
      const sortedMetrics = groupMetrics.sort((a, b) => 
        a.timestamp.getTime() - b.timestamp.getTime()
      )

      // 获取这个时间段的第一个和最后一个数据点
      const firstMetric = sortedMetrics[0]
      const lastMetric = sortedMetrics[sortedMetrics.length - 1]

      // 计算时间差（秒）
      const timeSpan = (lastMetric.timestamp.getTime() - firstMetric.timestamp.getTime()) / 1000
      const effectiveTimeSpan = timeSpan || (interval / 1000) // 如果时间差为0，使用间隔时间

      // 计算增量和速率
      const aggregated = {
        timestamp: new Date(timestamp),
        metrics: {
          // 请求数增量转换为每秒速率
          requestCount: Math.max(0, Math.round(
            (lastMetric.requestCount - firstMetric.requestCount) / effectiveTimeSpan
          )),
          // 入站流量增量转换为每秒速率（转换为KB/s）
          inboundTraffic: Math.max(0, Math.round(
            (lastMetric.inboundTraffic - firstMetric.inboundTraffic) / effectiveTimeSpan / 1024
          )),
          // 出站流量增量转换为每秒速率（转换为KB/s）
          outboundTraffic: Math.max(0, Math.round(
            (lastMetric.outboundTraffic - firstMetric.outboundTraffic) / effectiveTimeSpan / 1024
          )),
          // 连接数取平均值（因为这是即时值）
          connections: Math.round(
            sortedMetrics.reduce((sum, m) => sum + m.connections, 0) / sortedMetrics.length
          )
        }
      }

      console.log('Debug - 聚合结果:', {
        时间: aggregated.timestamp,
        时间跨度_秒: effectiveTimeSpan,
        原始数据点数: sortedMetrics.length,
        首个数据点: firstMetric,
        末个数据点: lastMetric,
        计算结果: aggregated.metrics
      })

      return aggregated
    })

    return result
  }

  // 计算合适的时间间隔
  private calculateInterval(timePoints: number[]): number {
    if (timePoints.length <= 1) return 60000 // 默认1分钟

    const totalDuration = Math.max(...timePoints) - Math.min(...timePoints)
    const targetPoints = 100 // 目标数据点数量

    // 根据总时间跨度选择合适的间隔
    let interval = Math.max(60000, Math.floor(totalDuration / targetPoints))
    
    // 将间隔调整为整分钟
    interval = Math.ceil(interval / 60000) * 60000

    return interval
  }
}

// 创建单例实例
let aggregatorInstance: MetricsAggregator | null = null

export function getMetricsAggregator(): MetricsAggregator {
  if (!aggregatorInstance) {
    aggregatorInstance = new MetricsAggregator()
  }
  return aggregatorInstance
}