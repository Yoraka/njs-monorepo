"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { format } from "date-fns"
import { getMetricsManager } from '@/services/metrics-manager'
import { useTranslation } from 'react-i18next'

interface ServerMetrics {
  incomingTraffic: number
  outgoingTraffic: number
  activeConnections: number
  totalRequests: number
}

interface Server {
  name: string
  listen: number
  location: string
  targets: number
  status: string
  metrics: ServerMetrics
  balancer: string
  healthCheck: boolean
}

interface RealtimeStats {
  requestsPerSecond: number
  bandwidthIn: number
  bandwidthOut: number
  activeConnections: number
}

// 修改带宽格式化函数，使其更准确
const formatBandwidth = (value: number): string => {
  if (value === 0) return '0 B/s'
  const k = 1024
  const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s', 'TB/s']
  const i = Math.floor(Math.log(value) / Math.log(k))
  return `${parseFloat((value / Math.pow(k, i)).toFixed(2))} ${sizes[Math.min(i, sizes.length - 1)]}`
}

// 添加缓存相关的工具函数和类型
interface CachedRealtimeStats extends RealtimeStats {
  timestamp: number
}

const REALTIME_CACHE_KEY = 'traffic_monitor_realtime_cache'
const CACHE_DURATION = 5 * 60 * 1000 // 5分钟缓存

const getRealtimeStatsCache = (serverName: string): RealtimeStats | null => {
  try {
    const cached = localStorage.getItem(REALTIME_CACHE_KEY)
    if (!cached) return null
    
    const allData = JSON.parse(cached) as Record<string, CachedRealtimeStats>
    const serverData = allData[serverName]
    
    if (!serverData) return null
    
    // 检查缓存是否过期
    if (Date.now() - serverData.timestamp < CACHE_DURATION) {
      // 返回数据时排除timestamp字段
      const { timestamp, ...stats } = serverData
      return stats
    }
    return null
  } catch (error) {
    console.error('Failed to get realtime stats cache:', error)
    return null
  }
}

const setRealtimeStatsCache = (serverName: string, data: RealtimeStats) => {
  try {
    // 获取现有缓存
    const cached = localStorage.getItem(REALTIME_CACHE_KEY)
    const allData = cached ? JSON.parse(cached) : {}
    
    // 更新特定服务器的数据
    allData[serverName] = {
      ...data,
      timestamp: Date.now()
    }
    
    localStorage.setItem(REALTIME_CACHE_KEY, JSON.stringify(allData))
  } catch (error) {
    console.error('Failed to set realtime stats cache:', error)
  }
}

// 添加时间范围的类型和工具函数
type TimeRange = {
  [key: string]: {
    yAxisMax: number,
    xAxisTicks: number,
    interval: number
  }
}

const TIME_RANGES: TimeRange = {
  '1h': { yAxisMax: 100, xAxisTicks: 12, interval: 5 },  // 5分钟一个刻度
  '3h': { yAxisMax: 100, xAxisTicks: 12, interval: 15 }, // 15分钟一个刻度
  '6h': { yAxisMax: 100, xAxisTicks: 12, interval: 30 }, // 30分钟一个刻度
  '12h': { yAxisMax: 100, xAxisTicks: 12, interval: 60 }, // 1小时一个刻度
  '24h': { yAxisMax: 100, xAxisTicks: 12, interval: 120 } // 2小时一个刻度
}

// 生成初始时间轴数据
const generateInitialTimeAxis = (range: string) => {
  const now = new Date()
  const points = TIME_RANGES[range].xAxisTicks
  const interval = TIME_RANGES[range].interval
  const data = []
  
  for (let i = points - 1; i >= 0; i--) {
    data.push({
      timestamp: new Date(now.getTime() - i * interval * 60 * 1000),
      requestsPerSecond: 0,
      bandwidthIn: 0,
      bandwidthOut: 0,
      activeConnections: 0
    })
  }
  
  return data
}

export default function TrafficMonitor() {
  const { t } = useTranslation()
  const [servers, setServers] = useState<Server[]>([])
  const [selectedServer, setSelectedServer] = useState<string>("")
  const [timeRange, setTimeRange] = useState<string>("1h")
  const [realtimeStats, setRealtimeStats] = useState<RealtimeStats>(() => {
    // 初始化时尝试从缓存获取数据
    return getRealtimeStatsCache(selectedServer) || {
      requestsPerSecond: 0,
      bandwidthIn: 0,
      bandwidthOut: 0,
      activeConnections: 0
    }
  })
  const [trendData, setTrendData] = useState(() => generateInitialTimeAxis('1h'))
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isInitialLoading, setIsInitialLoading] = useState(true)  // 初始加载状态
  const [isStatsLoading, setIsStatsLoading] = useState(true)     // 统计数据加载状态
  const [isTrendLoading, setIsTrendLoading] = useState(true)     // 趋势数据加载状态

  // 获取服务器列表
  useEffect(() => {
    const fetchServers = async () => {
      try {
        const response = await fetch('/api/proxy-stats/servers')
        if (!response.ok) throw new Error('Failed to fetch servers')
        const data = await response.json()
        
        if (!Array.isArray(data) || data.length === 0) {
          setError('No servers available')
          return
        }

        setServers(data)
        const defaultServer = data[0].name
        setSelectedServer(defaultServer)
      } catch (error) {
        console.error('Error fetching servers:', error)
        setError('Failed to load servers')
      } finally {
        setIsInitialLoading(false)
      }
    }

    fetchServers()
  }, [])

  // 添加监听器来追踪状态变化
  useEffect(() => {
    console.log('Current servers:', servers)
    console.log('Selected server:', selectedServer)
  }, [servers, selectedServer])

  // 修改获取实时统计数据的方法
  useEffect(() => {
    if (!selectedServer) return
    
    setIsStatsLoading(true)  // 开始加载
    const cachedData = getRealtimeStatsCache(selectedServer)
    if (cachedData) {
      setRealtimeStats(cachedData)
      setIsStatsLoading(false)  // 如果有缓存数据，立即结束加载状态
    }
    
    const fetchRealtimeStats = async () => {
      try {
        const response = await fetch(`/api/proxy-stats?type=realtime&server=${selectedServer}`)
        if (!response.ok) throw new Error('Failed to fetch realtime stats')
        const data = await response.json()
        
        const newStats = {
          requestsPerSecond: data.requestsPerSecond || 0,
          bandwidthIn: data.bandwidthIn || 0,
          bandwidthOut: data.bandwidthOut || 0,
          activeConnections: data.activeConnections || 0
        }
        
        setRealtimeStats(newStats)
        setRealtimeStatsCache(selectedServer, newStats)
        setIsStatsLoading(false)
      } catch (error) {
        console.error('Error fetching realtime stats:', error)
        if (!cachedData) {
          setIsStatsLoading(true)  // 如果没有缓存数据，保持加载状态
        }
      }
    }

    fetchRealtimeStats()
    const intervalId = setInterval(fetchRealtimeStats, 2000)
    return () => clearInterval(intervalId)
  }, [selectedServer])

  // 修改获取趋势数据的方法
  useEffect(() => {
    if (!selectedServer) return

    setIsTrendLoading(true)
    const fetchTrendData = async () => {
      try {
        const response = await fetch(`/api/proxy-stats?type=trend&server=${selectedServer}&range=${timeRange}`)
        if (!response.ok) throw new Error('Failed to fetch trend data')
        const data = await response.json()
        
        // 确保数据格式正确
        const formattedData = data.map((point: any) => ({
          timestamp: new Date(point.timestamp).getTime(),
          requestsPerSecond: point.requestsPerSecond || 0,
          bandwidthIn: point.bandwidthIn || 0,
          bandwidthOut: point.bandwidthOut || 0,
          activeConnections: point.activeConnections || 0
        }))

        console.log('Debug - 趋势数据:', formattedData)
        setTrendData(formattedData)
      } catch (error) {
        console.error('Error fetching trend data:', error)
        // 错误时使用初始化数据
        setTrendData(generateInitialTimeAxis(timeRange))
      } finally {
        setIsTrendLoading(false)
      }
    }

    fetchTrendData()
    const intervalId = setInterval(fetchTrendData, 60000)
    return () => clearInterval(intervalId)
  }, [selectedServer, timeRange])

  return (
    <Card className="col-span-3">
      <CardHeader>
        <CardTitle>{t('trafficMonitor.title')}</CardTitle>
        <CardDescription>{t('trafficMonitor.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        {isInitialLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="flex flex-col items-center gap-2">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              <div className="text-sm text-muted-foreground">{t('trafficMonitor.loadingServers')}</div>
            </div>
          </div>
        ) : error ? (
          <div className="text-center text-red-500 p-4">{error}</div>
        ) : servers.length === 0 ? (
          <div className="text-center text-gray-500 p-4">{t('trafficMonitor.noServersConfigured')}</div>
        ) : (
          <div className="space-y-4">
            <div className="flex gap-4">
              <Select
                value={selectedServer}
                onValueChange={(value) => {
                  console.log('Selected new server:', value)
                  setSelectedServer(value)
                }}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Select server">
                    {selectedServer || 'Select server'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {servers && servers.length > 0 ? (
                    servers.map((server) => (
                      <SelectItem key={server.name} value={server.name}>
                        {server.name}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="" disabled>
                      {t('trafficMonitor.noServersAvailable')}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              <Select value={timeRange} onValueChange={setTimeRange}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder={t('trafficMonitor.timeRange')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15m">{t('trafficMonitor.last15Minutes')}</SelectItem>
                  <SelectItem value="30m">{t('trafficMonitor.last30Minutes')}</SelectItem>
                  <SelectItem value="1h">{t('trafficMonitor.lastHour')}</SelectItem>
                  <SelectItem value="3h">{t('trafficMonitor.last3Hours')}</SelectItem>
                  <SelectItem value="6h">{t('trafficMonitor.last6Hours')}</SelectItem>
                  <SelectItem value="12h">{t('trafficMonitor.last12Hours')}</SelectItem>
                  <SelectItem value="24h">{t('trafficMonitor.last24Hours')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {isStatsLoading ? (
                <Card className="col-span-full flex items-center justify-center h-[150px]">
                  <div className="flex flex-col items-center gap-2">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    <div className="text-sm text-muted-foreground">{t('trafficMonitor.loadingStatistics')}</div>
                  </div>
                </Card>
              ) : (
                <>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">{t('trafficMonitor.requestsPerSecond')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{realtimeStats.requestsPerSecond}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">{t('trafficMonitor.bandwidthIn')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{formatBandwidth(realtimeStats.bandwidthIn)}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">{t('trafficMonitor.bandwidthOut')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{formatBandwidth(realtimeStats.bandwidthOut)}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">{t('trafficMonitor.activeConnections')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {realtimeStats.activeConnections}
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>
            <Card>
              <CardHeader>
                <CardTitle>{t('trafficMonitor.trafficTrends')}</CardTitle>
              </CardHeader>
              <CardContent>
                {isTrendLoading ? (
                  <div className="flex items-center justify-center h-[300px]">
                    <div className="flex flex-col items-center gap-2">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                      <div className="text-sm text-muted-foreground">{t('trafficMonitor.loadingTrendData')}</div>
                    </div>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart 
                      data={trendData}
                      margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        dataKey="timestamp" 
                        type="number"
                        scale="time"
                        domain={['dataMin', 'dataMax']}
                        tickFormatter={(timestamp) => format(new Date(timestamp), "HH:mm:ss")}
                        interval="preserveStartEnd"
                      />
                      <YAxis 
                        yAxisId="left"
                        orientation="left"
                        label={{ 
                          value: `${t('trafficMonitor.requestsPerSecond')} & ${t('trafficMonitor.activeConnections')}`, 
                          angle: -90, 
                          position: 'insideLeft',
                          style: { textAnchor: 'middle' }
                        }}
                        domain={[0, 'dataMax']}
                        allowDecimals={false}
                      />
                      <YAxis 
                        yAxisId="right" 
                        orientation="right"
                        tickFormatter={(value) => formatBandwidth(Math.max(0, value))}
                        label={{ 
                          value: t('trafficMonitor.bandwidth'), 
                          angle: 90, 
                          position: 'insideRight',
                          style: { textAnchor: 'middle' }
                        }}
                        domain={[0, 'dataMax']}
                      />
                      <Tooltip 
                        labelFormatter={(label) => format(new Date(label), "yyyy-MM-dd HH:mm:ss")}
                        formatter={(value: number, name: string) => {
                          const positiveValue = Math.max(0, value)
                          switch (name) {
                            case t('trafficMonitor.requestsPerSecond'):
                              return [`${positiveValue.toFixed(2)} req/s`, t('trafficMonitor.requestRate')]
                            case t('trafficMonitor.bandwidthIn'):
                              return [formatBandwidth(positiveValue), t('trafficMonitor.inboundTraffic')]
                            case t('trafficMonitor.bandwidthOut'):
                              return [formatBandwidth(positiveValue), t('trafficMonitor.outboundTraffic')]
                            case t('trafficMonitor.activeConnections'):
                              return [`${positiveValue} conns`, name]
                            default:
                              return [positiveValue, name]
                          }
                        }}
                        isAnimationActive={false}
                      />
                      <Line 
                        yAxisId="left" 
                        type="monotone" 
                        dataKey={(v) => Math.max(0, v.requestsPerSecond)}
                        stroke="#8884d8" 
                        name={t('trafficMonitor.requestsPerSecond')}
                        dot={false}
                        strokeWidth={2}
                        isAnimationActive={false}
                        connectNulls
                      />
                      <Line 
                        yAxisId="right" 
                        type="monotone" 
                        dataKey={(v) => Math.max(0, v.bandwidthIn)}
                        stroke="#82ca9d" 
                        name={t('trafficMonitor.bandwidthIn')}
                        dot={false}
                        strokeWidth={2}
                        isAnimationActive={false}
                        connectNulls
                      />
                      <Line 
                        yAxisId="right" 
                        type="monotone" 
                        dataKey={(v) => Math.max(0, v.bandwidthOut)}
                        stroke="#ffc658" 
                        name={t('trafficMonitor.bandwidthOut')}
                        dot={false}
                        strokeWidth={2}
                        isAnimationActive={false}
                        connectNulls
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </CardContent>
    </Card>
  )
}