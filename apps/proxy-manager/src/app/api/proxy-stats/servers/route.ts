import { NextResponse } from 'next/server'
import { getProxyConfig } from '@/lib/config'
import { getMetricsManager } from '@/services/metrics-manager'
import type { ServerConfig } from '@/types/proxy-config'

export async function GET() {
  try {
    const config = await getProxyConfig()
    const metricsManager = getMetricsManager()

    // 获取所有服务器配置
    const servers = config.servers || []
    const latestMetrics = metricsManager.getLatestMetrics()

    // 格式化服务器信息并添加指标数据
    const formattedServers = servers.map((server: ServerConfig) => {
      const serverName = server.name
      const serverMetrics = latestMetrics?.serverMetrics[serverName]
      
      return {
        name: serverName,
        listen: server.listen,
        serverName: server.serverName,
        locations: server.locations.map(loc => ({
          path: loc.path,
          targets: loc.targets?.length || 0,
          balancer: loc.balancer
        })),
        status: 'active',
        metrics: serverMetrics || null,
        healthCheck: server.healthCheck ? true : false
      }
    })

    return NextResponse.json(formattedServers)
  } catch (error) {
    console.error('Error fetching server list:', error)
    return NextResponse.json(
      { error: '获取服务器列表失败' },
      { status: 500 }
    )
  }
}