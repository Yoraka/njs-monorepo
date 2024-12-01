import { NextResponse } from 'next/server'
import { getMetricsManager } from '@/services/metrics-manager'

export async function GET() {
  try {
    const metricsManager = getMetricsManager()
    const systemMetrics = metricsManager.getLatestSystemMetrics()

    if (!systemMetrics) {
      return NextResponse.json(
        { error: 'No system metrics available' },
        { status: 404 }
      )
    }

    return NextResponse.json(systemMetrics)
  } catch (error) {
    console.error('Error fetching system metrics:', error)
    return NextResponse.json(
      { error: 'Failed to fetch system metrics' },
      { status: 500 }
    )
  }
}