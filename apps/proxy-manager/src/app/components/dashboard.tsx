"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useTranslation } from 'react-i18next'
import { usePathname } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts"
import { Activity, HelpCircle, MoreVertical, Plus, Search, Server, Shield } from "lucide-react"
// import { addProxyHost, type ProxyHost } from "@/app/utils/api"
import Image from "next/image"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { format } from "date-fns"
import type { RateMetrics } from "@/services/metrics-manager"
import { getMetricsManager } from '@/services/metrics-manager'
import { MetricsData } from '@/types/metrics'
import { getWebSocketClient } from '@/services/ws-client'

type TrendDataPoint = {
  timestamp: Date
  requestsPerSecond: number
  bandwidthIn: number
  bandwidthOut: number
  activeConnections: number
}

// 类型定义
type ServerMetrics = {
  connections: number
  requests: number
  traffic: number
  timestamp: string
}

type SystemMetrics = {
  cpuUsage: number;
  memoryPercentage: number;
  diskUsage: number;
}

type ProxyServer = {
  name: string
  domain: string
  bind_addr: string
  status: 'active' | 'inactive'
  metrics: ServerMetrics | null
  tags: Tag[]
}

type Tag = {
  kind: string
  value: string
  css?: string
}

type Server = {
  name: string
  tags: Tag[]
}

const initialServers: Server[] = [
  {
    name: "bluedotmars.xyz",
    tags: [
      { kind: "DESTINATION", value: "http://198.13.55.141:8080" },
      { kind: "SSL", value: "Let's Encrypt", css: "bg-green-100 text-green-800" },
      { kind: "ACCESS", value: "Public", css: "bg-blue-100 text-blue-800" },
      { kind: "STATUS", value: "Disabled", css: "bg-yellow-100 text-yellow-800" },
    ],
  },
  {
    name: "gpt.bluedotmars.xyz",
    tags: [
      { kind: "DESTINATION", value: "http://198.13.55.141:8901" },
      { kind: "SSL", value: "Let's Encrypt", css: "bg-green-100 text-green-800" },
      { kind: "ACCESS", value: "Public", css: "bg-blue-100 text-blue-800" },
      { kind: "STATUS", value: "Online", css: "bg-green-100 text-green-800" },
    ],
  },
  {
    name: "api.example.com",
    tags: [
      { kind: "DESTINATION", value: "http://10.0.0.1:3000" },
      { kind: "SSL", value: "Let's Encrypt", css: "bg-green-100 text-green-800" },
      { kind: "ACCESS", value: "Private", css: "bg-purple-100 text-purple-800" },
      { kind: "STATUS", value: "Online", css: "bg-green-100 text-green-800" },
    ],
  },
]

const ServerCard = ({ server }: { server: Server }) => {
  const { t } = useTranslation()
  return (
    <Card className="mb-4">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{server.name}</CardTitle>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>{t('common.edit')}</DropdownMenuItem>
            <DropdownMenuItem>{t('common.disable')}</DropdownMenuItem>
            <DropdownMenuItem className="text-red-600">{t('common.delete')}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {server.tags?.length ? (
            server.tags.map((tag, index) => (
              <Badge key={index} variant="secondary" className={`text-xs ${tag.css || ''}`}>
                {tag.kind}: {tag.value}
              </Badge>
            ))
          ) : (
            <span className="text-sm text-muted-foreground">{t('proxy.noTags')}</span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// 添加格式化时间的辅助函数
const formatChartTime = (timestamp: string, timeRange: string) => {
  const date = new Date(timestamp)
  
  // 根据时间范围选择合适的显示格式
  switch (timeRange) {
    case '15m':
    case '30m':
    case '1h':
      return date.toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit' 
      })
    case '3h':
    case '6h':
    case '12h':
      return date.toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit'
      })
    case '24h':
      return date.toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    default:
      return date.toLocaleTimeString()
  }
}

// 首先添加 OverviewData 类型定义（如果还没有的话）
type OverviewData = {
  totalProxies: number
  activeProxies: number
  totalTraffic: string
  totalConnections: number
  timestamp?: number
}

// 缓存相关的工具函数
const CACHE_KEY = 'dashboard_overview_cache'
const CACHE_DURATION = 5 * 60 * 1000 // 5分钟缓存

const getOverviewCache = (): OverviewData | null => {
  try {
    const cached = localStorage.getItem(CACHE_KEY)
    if (!cached) return null
    
    const data = JSON.parse(cached) as OverviewData
    
    // 检查缓存是否过期
    if (data.timestamp && Date.now() - data.timestamp < CACHE_DURATION) {
      return data
    }
    return null
  } catch (error) {
    console.error('Failed to get cache:', error)
    return null
  }
}

const setOverviewCache = (data: OverviewData) => {
  try {
    const dataWithTimestamp = {
      ...data,
      timestamp: Date.now()
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(dataWithTimestamp))
  } catch (error) {
    console.error('Failed to set cache:', error)
  }
}

// 格式化字节数的函数
const formatBytes = (bytes: number, decimals: number = 2): string => {
  if (bytes === 0) return '0 B/s'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s', 'TB/s']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}

const formatTotalBytes = (bytes: number, decimals: number = 2): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}

export default function Dashboard() {
  const { t } = useTranslation()
  const pathname = usePathname()
  const isFirstMount = useRef(true)
  const [isInitialLoading, setIsInitialLoading] = useState(true)
  const [overviewData, setOverviewData] = useState<OverviewData>(() => {
    return getOverviewCache() || {
      totalProxies: 0,
      activeProxies: 0,
      totalTraffic: '0 B',
      totalConnections: 0
    }
  })
  const [servers, setServers] = useState<ProxyServer[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedServer, setSelectedServer] = useState<string>('')
  const [timeRange, setTimeRange] = useState('1h')
  const [historyData, setHistoryData] = useState<ServerMetrics[]>([])
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics>({
    cpuUsage: 0,
    memoryPercentage: 0,
    diskUsage: 0
  })
  const [trendData, setTrendData] = useState<TrendDataPoint[]>([])
  const [systemMetricsCache, setSystemMetricsCache] = useState<SystemMetrics | null>(null)
  const [systemMetricsError, setSystemMetricsError] = useState(0)
  const [lastErrorTime, setLastErrorTime] = useState(0)
  const [errorCount, setErrorCount] = useState(0)
  const lastRequestTime = useRef(0)
  const MIN_REQUEST_INTERVAL = 5000 // 改为5秒，小于自动刷新间隔

  // 修改过滤逻辑，添加类型保护
  const filteredServers = Array.isArray(servers) ? servers.filter(server => {
    if (!server) return false;
    const domainMatch = server.name?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false;
    const tagsMatch = Array.isArray(server.tags) && server.tags.some(tag => 
      tag?.value?.toLowerCase().includes(searchQuery.toLowerCase())
    );
    return domainMatch || tagsMatch;
  }) : [];

  // 修改 handleRefresh，添加请求限制和更好的错误处理
  const handleRefresh = useCallback(async () => {
    const now = Date.now()
    if (now - lastRequestTime.current < MIN_REQUEST_INTERVAL) {
      return
    }
    lastRequestTime.current = now

    try {
      if (errorCount >= 3) {
        const cachedData = getOverviewCache()
        if (cachedData) {
          setOverviewData(cachedData)
          return
        }
      }

      const [overviewResponse, serversResponse, systemResponse] = await Promise.all([
        fetch('/api/proxy-stats?type=overview').catch(() => ({ ok: false } as Response)),
        fetch('/api/proxy-stats/servers').catch(() => ({ ok: false } as Response)),
        fetch('/api/proxy-stats/system').catch(() => ({ ok: false } as Response))
      ])

      if (!overviewResponse.ok || !serversResponse.ok || !systemResponse.ok) {
        setErrorCount(prev => prev + 1)
        const cachedData = getOverviewCache()
        if (cachedData) {
          setOverviewData(cachedData)
        }
        return
      }

      setErrorCount(0)

      try {
        const [overviewData, serversData, systemData] = await Promise.all([
          overviewResponse.json(),
          serversResponse.json(),
          systemResponse.json()
        ])

        // 设置概览数据，确保 totalConnections 被正确设置
        if (overviewData) {
          // 计算总连接数
          let totalConns = 0
          if (typeof overviewData.totalConnections === 'number') {
            totalConns = overviewData.totalConnections
          } else if (Array.isArray(serversData)) {
            // 如果 totalConnections 不存在，尝试从服务器数据中计算
            totalConns = serversData.reduce((sum, server) => {
              return sum + (server.metrics?.connections || 0)
            }, 0)
          }

          const newOverviewData = {
            totalProxies: overviewData.totalProxies || 0,
            activeProxies: overviewData.activeProxies || 0,
            totalTraffic: formatTotalBytes(overviewData.totalTraffic || 0),
            totalConnections: overviewData.totalConnections || 0
          }

          setOverviewData(newOverviewData)
          setOverviewCache(newOverviewData)
        }
        
        if (serversData && Array.isArray(serversData)) {
          setServers(serversData)
          if (serversData.length > 0 && !selectedServer) {
            setSelectedServer(serversData[0].domain)
          }
        }
        
        if (systemData && typeof systemData.cpuUsage === 'number') {
          const newSystemMetrics = {
            cpuUsage: systemData.cpuUsage || 0,
            memoryPercentage: systemData.memoryPercentage || 0,
            diskUsage: systemData.diskUsage || 0
          }
          setSystemMetrics(newSystemMetrics)
          setSystemMetricsCache(systemData)
        }
      } catch (parseError) {
        console.error('Error parsing response:', parseError)
        setErrorCount(prev => prev + 1)
        const cachedData = getOverviewCache()
        if (cachedData) {
          setOverviewData(cachedData)
        }
      }
    } catch (error) {
      setErrorCount(prev => prev + 1)
      const cachedData = getOverviewCache()
      if (cachedData) {
        setOverviewData(cachedData)
      }
    }
  }, [errorCount])

  // 添加错误计数重置定时器
  useEffect(() => {
    const resetErrorCount = () => {
      if (errorCount > 0) {
        setErrorCount(0)
      }
    }

    const intervalId = setInterval(resetErrorCount, 60000) // 每分钟重置错误计数
    return () => clearInterval(intervalId)
  }, [errorCount])

  // 修改首次加载的 effect
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false
      const initialLoad = async () => {
        try {
          await handleRefresh()
        } finally {
          setIsInitialLoading(false)
        }
      }
      initialLoad()
    }
  }, [handleRefresh])

  // 修改路由监听的 useEffect
  useEffect(() => {
    const shouldRefresh = pathname === '/dashboard' || pathname === '/'
    if (shouldRefresh) {
      handleRefresh()
    }
  }, [pathname, handleRefresh])

  // 添加自动刷新
  useEffect(() => {
    // 首次加载立即刷新
    handleRefresh()
    
    const intervalId = setInterval(() => {
      handleRefresh()
    }, 8000) // 改为8秒，确保大于最小请求间隔
    
    return () => clearInterval(intervalId)
  }, [handleRefresh])

  // 保持趋势数据获取的逻辑不变
  useEffect(() => {
    const fetchTrendData = async () => {
      try {
        const response = await fetch(`/api/proxy-stats?type=trend&range=${timeRange}`)
        if (!response.ok) throw new Error('Failed to fetch trend data')
        const data = await response.json()
        
        const sortedData = data.sort((a: TrendDataPoint, b: TrendDataPoint) => 
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        )
        
        setTrendData(sortedData)
      } catch (error) {
        console.error('Error fetching trend data:', error)
      }
    }

    fetchTrendData()
    const intervalId = setInterval(fetchTrendData, 30000)
    return () => clearInterval(intervalId)
  }, [timeRange])

  const handleAddServer = () => {
    // This is a placeholder function. In a real application, this would open a form to add a new server.
    console.log("Add new server")
  }

  return (
    <div className="p-8 space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">{t('menu.dashboard')}</h1>
        <Button onClick={handleRefresh} variant="outline">
          {t('common.refresh')}
        </Button>
      </div>
      
      {/* Overview Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {isInitialLoading ? (
          <Card className="col-span-full flex items-center justify-center h-[150px]">
            <div className="flex flex-col items-center gap-2">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              <div className="text-sm text-muted-foreground">{t('common.loading')}</div>
            </div>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{t('proxy.totalConfigs')}</CardTitle>
                <Shield className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{overviewData.totalProxies}</div>
                <p className="text-xs text-muted-foreground">
                  {overviewData.activeProxies} {t('proxy.active')}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{t('proxy.totalTraffic')}</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{overviewData.totalTraffic}</div>
                <p className="text-xs text-muted-foreground">
                  {t('common.justUpdated')}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{t('proxy.activeConnections')}</CardTitle>
                <Server className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{overviewData.totalConnections}</div>
                <p className="text-xs text-muted-foreground">
                  {t('proxy.realTimeConnections')}
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Proxy List */}
      <Card className="w-full">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{t('proxy.configList')}</CardTitle>
              <CardDescription>{t('proxy.configDescription')}</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon">
                <HelpCircle className="h-4 w-4" />
              </Button>
              <Button onClick={handleAddServer}>
                <Plus className="h-4 w-4 mr-2" />
                {t('proxy.addConfig')}
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('proxy.searchPlaceholder')}
                className="pl-8"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {filteredServers.map(server => (
              <ServerCard key={server.name} server={server} />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Request Statistics Chart */}
      <Card className="col-span-2">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{t('metrics.requestStats')}</CardTitle>
              <CardDescription>{t('metrics.requestStatsDescription')}</CardDescription>
            </div>
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder={t('metrics.selectTimeRange')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="15m">{t('metrics.last15Minutes')}</SelectItem>
                <SelectItem value="1h">{t('metrics.lastHour')}</SelectItem>
                <SelectItem value="6h">{t('metrics.last6Hours')}</SelectItem>
                <SelectItem value="24h">{t('metrics.last24Hours')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            {isInitialLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="flex flex-col items-center gap-2">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  <div className="text-sm text-muted-foreground">{t('common.loadingChart')}</div>
                </div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="timestamp"
                    tickFormatter={(timestamp) => {
                      const date = new Date(timestamp)
                      if (timeRange === '24h') {
                        return format(date, "HH:mm")
                      } else if (timeRange === '6h' || timeRange === '3h') {
                        return format(date, "HH:mm")
                      } else {
                        return format(date, "HH:mm:ss")
                      }
                    }}
                    interval="preserveStartEnd"
                    minTickGap={30}
                  />
                  <YAxis 
                    yAxisId="left"
                    orientation="left"
                    label={{ 
                      value: `${t('metrics.requestRate')} & ${t('metrics.activeConnections')}`, 
                      angle: -90, 
                      position: 'insideLeft',
                      offset: 0,
                      style: { textAnchor: 'middle' }
                    }}
                    domain={[0, 'dataMax']}
                    allowDecimals={false}
                    minTickGap={1}
                  />
                  <YAxis 
                    yAxisId="right"
                    orientation="right"
                    tickFormatter={(value) => formatBytes(Math.max(0, value))}
                    label={{ 
                      value: t('metrics.bandwidth'), 
                      angle: 90, 
                      position: 'insideRight',
                      offset: 10,
                      style: { textAnchor: 'middle' }
                    }}
                    domain={[0, 'dataMax']}
                    allowDecimals={false}
                    minTickGap={1}
                  />
                  <Tooltip
                    labelFormatter={(value) => format(new Date(value), "yyyy-MM-dd HH:mm:ss")}
                    formatter={(value: number, name: string) => {
                      const positiveValue = Math.max(0, value)
                      switch (name) {
                        case "Requests/s":
                          return [`${positiveValue.toFixed(2)} req/s`, t('metrics.requestRate')]
                        case "Bandwidth In":
                          return [formatBytes(positiveValue), t('metrics.inboundTraffic')]
                        case "Bandwidth Out":
                          return [formatBytes(positiveValue), t('metrics.outboundTraffic')]
                        case "Connections":
                          return [`${positiveValue} conns`, t('metrics.activeConnections')]
                        default:
                          return [positiveValue, name]
                      }
                    }}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey={(v) => Math.max(0, v.requestsPerSecond)}
                    stroke="#8884d8"
                    name={t('metrics.requestRate')}
                    dot={false}
                    strokeWidth={2}
                    yAxisId="left"
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey={(v) => Math.max(0, v.bandwidthIn)}
                    stroke="#ffc658"
                    name={t('metrics.inboundTraffic')}
                    dot={false}
                    strokeWidth={2}
                    yAxisId="right"
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey={(v) => Math.max(0, v.bandwidthOut)}
                    stroke="#ff7300"
                    name={t('metrics.outboundTraffic')}
                    dot={false}
                    strokeWidth={2}
                    yAxisId="right"
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey={(v) => Math.max(0, v.activeConnections)}
                    stroke="#82ca9d"
                    name={t('metrics.activeConnections')}
                    dot={false}
                    strokeWidth={2}
                    yAxisId="left"
                    connectNulls
                  />
                  <Legend />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>

      {/* System Status Card */}
      <Card>
        <CardHeader>
          <CardTitle>{t('metrics.systemStatus')}</CardTitle>
          <CardDescription>
            {t('metrics.systemStatusDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isInitialLoading ? (
            <div className="flex items-center justify-center h-[150px]">
              <div className="flex flex-col items-center gap-2">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                <div className="text-sm text-muted-foreground">{t('common.loadingSystem')}</div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center">
                <div className="w-40">{t('metrics.cpuUsage')}:</div>
                <div className="w-full bg-secondary rounded-full h-2.5">
                  <div
                    className="bg-primary h-2.5 rounded-full transition-all duration-300"
                    style={{ 
                      width: `${Math.max(0, Math.min(100, systemMetrics.cpuUsage))}%` 
                    }}
                  />
                </div>
                <div className="w-16 text-right">
                  {systemMetrics.cpuUsage > 0 ? 
                    `${systemMetrics.cpuUsage.toFixed(1)}%` : 
                    systemMetricsCache?.cpuUsage.toFixed(1) + '%'
                  }
                </div>
              </div>
              <div className="flex items-center">
                <div className="w-40">{t('metrics.memoryUsage')}:</div>
                <div className="w-full bg-secondary rounded-full h-2.5">
                  <div
                    className="bg-primary h-2.5 rounded-full"
                    style={{ width: `${systemMetrics.memoryPercentage}%` }}
                  />
                </div>
                <div className="w-16 text-right">{systemMetrics.memoryPercentage}%</div>
              </div>
              <div className="flex items-center">
                <div className="w-40">{t('metrics.diskUsage')}:</div>
                <div className="w-full bg-secondary rounded-full h-2.5">
                  <div
                    className="bg-primary h-2.5 rounded-full"
                    style={{ width: `${systemMetrics.diskUsage}%` }}
                  />
                </div>
                <div className="w-16 text-right">{systemMetrics.diskUsage}%</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}