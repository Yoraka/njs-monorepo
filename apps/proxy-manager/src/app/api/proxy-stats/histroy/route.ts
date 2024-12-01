import { NextResponse } from 'next/server'
import { getMetricsAggregator } from '@/services/metrics-aggregator'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const serverName = searchParams.get('server')
    const timeRange = searchParams.get('range') || '1h'

    if (!serverName) {
      return NextResponse.json(
        { error: '服务器名称参数是必需的' },
        { status: 400 }
      )
    }

    const endTime = new Date()
    const startTime = new Date(endTime.getTime() - parseTimeRange(timeRange))
    
    const aggregator = getMetricsAggregator()
    const metrics = await aggregator.getServerMetrics(serverName, startTime, endTime)

    if (!metrics || metrics.length === 0) {
      return NextResponse.json(
        { error: '未找到指定服务器和时间范围内的监控数据' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      serverName,
      timeRange,
      startTime,
      endTime,
      metrics
    })
  } catch (error) {
    console.error('获取历史监控数据失败:', error)
    return NextResponse.json(
      { error: '获取历史监控数据失败' },
      { status: 500 }
    )
  }
}

function parseTimeRange(range: string): number {
  const units: Record<string, number> = {
    'm': 60 * 1000,
    'h': 60 * 60 * 1000,
    'd': 24 * 60 * 60 * 1000
  }
  const match = range.match(/^(\d+)([mhd])$/)
  if (!match) return 60 * 60 * 1000 // 默认1小时
  return parseInt(match[1]) * units[match[2]]
}