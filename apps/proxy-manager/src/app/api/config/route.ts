import { getProxyConfig } from '@/lib/config'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const config = await getProxyConfig()
    return NextResponse.json(config)
  } catch (error) {
    console.error('Error loading config:', error)
    return NextResponse.json(
      { error: 'Failed to load configuration' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const newConfig = await request.json()
    // TODO: 实现配置保存逻辑
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error saving config:', error)
    return NextResponse.json(
      { error: 'Failed to save configuration' },
      { status: 500 }
    )
  }
} 