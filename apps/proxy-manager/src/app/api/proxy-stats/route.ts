import { NextResponse } from 'next/server'
import { getMetricsManager } from '@/services/metrics-manager'
import { getProxyConfig } from '@/lib/config'
import type { ServerMetrics } from '@/types/proxy-config'

let initializePromise: Promise<void> | null = null;

export async function GET(request: Request) {
  try {
    // 确保只初始化一次
    if (!initializePromise) {
      console.log('Debug - 首次初始化 MetricsManager')
      const metricsManager = getMetricsManager()
      initializePromise = metricsManager.initialize()
    }
    
    // 等待初始化完成
    await initializePromise

    const { searchParams } = new URL(request.url)
    const serverName = searchParams.get('server')
    const type = searchParams.get('type')
    
    const config = await getProxyConfig()
    const metricsManager = getMetricsManager()
    
    console.log('Debug - API请求参数:', { serverName, type })

    // 处理实时数据请求
    if (type === 'realtime' && serverName) {
      try {
        console.log(`Debug - 获取服务器 ${serverName} 的实时数据`)
        const rates = metricsManager.calculateRates(serverName)
        
        // 如果没有数据，返回默认值
        if (!rates) {
          return NextResponse.json({
            requestsPerSecond: 0,
            bandwidthIn: 0,
            bandwidthOut: 0,
            activeConnections: 0
          })
        }
        
        console.log('Debug - 实时数据:', rates)
        return NextResponse.json(rates)
      } catch (error) {
        console.error('获取实时数据失败:', error)
        // 出错时返回默认值而不是错误
        return NextResponse.json({
          requestsPerSecond: 0,
          bandwidthIn: 0,
          bandwidthOut: 0,
          activeConnections: 0
        })
      }
    }

    // 处理趋势数据请求
    if (type === 'trend') {
      const range = searchParams.get('range') || '1h'
      
      if (serverName) {
        // 单个服务器的趋势数据
        console.log(`Debug - 获取服务器 ${serverName} 的趋势数据, 范围: ${range}`)
        const trendData = await metricsManager.getTrendData(serverName, range)
        return NextResponse.json(trendData)
      } else {
        // 所有服务器的聚合趋势数据
        console.log(`Debug - 获取所有服务器的聚合趋势数据, 范围: ${range}`)
        const trendData = await metricsManager.getAggregatedTrendData(range)
        return NextResponse.json(trendData)
      }
    }

    // 处理概览请求
    if (type === 'overview') {
      const baseStats = {
        totalProxies: config.servers.length,
        activeProxies: 0,
        totalTraffic: 0,
        totalConnections: 0
      }

      // 获取所有服务器的metrics数据
      const allServerMetrics = config.servers.map(server => {
        const serverMetrics = metricsManager.getLatestServerMetrics(server.name)
        console.log(`Debug - 服务器 ${server.name} 的metrics:`, serverMetrics)
        return serverMetrics
      }).filter(Boolean) // 过滤掉null或undefined的数据

      console.log('Debug - 所有服务器的metrics:', allServerMetrics)

      if (allServerMetrics.length > 0) {
        baseStats.activeProxies = allServerMetrics.length
        baseStats.totalConnections = allServerMetrics.reduce((sum, metric) => 
          sum + (metric?.activeConnections || 0), 0)
        baseStats.totalTraffic = allServerMetrics.reduce((sum, metric) => 
          sum + ((metric?.incomingTraffic || 0) + (metric?.outgoingTraffic || 0)), 0)
        
        console.log('Debug - 计算后的baseStats:', baseStats)
      } else {
        console.log('Debug - 没有找到任何服务器的metrics数据')
      }

      return NextResponse.json(baseStats)
    }

    // 处理单个服务器的详细指标
    if (serverName && !type) {
      const serverMetrics = metricsManager.getLatestServerMetrics(serverName)
      return NextResponse.json({
        metrics: serverMetrics || null
      })
    }

    // 返回所有服务器的指标
    const latestMetrics = metricsManager.getLatestMetrics()
    return NextResponse.json({
      totalProxies: config.servers.length,
      activeProxies: Object.keys(latestMetrics?.serverMetrics || {}).length,
      metrics: latestMetrics || null
    })

  } catch (error) {
    console.error('Debug - API错误:', error)
    return NextResponse.json(
      { error: '获取代理统计信息失败' },
      { status: 500 }
    )
  }
}