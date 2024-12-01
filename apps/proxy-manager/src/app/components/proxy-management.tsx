"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ServerConfigPanel } from "./config-panels"
import { UpstreamPanel } from "./upstream-panel"
import { JsonConfig, ServerConfig, ConfigGroup, UpstreamConfig } from "@/types/proxy-config"

// 定义配置模板
const SERVER_CONFIG_TEMPLATE: ConfigGroup[] = [
  {
    id: 'basic',
    title: '基本设置',
    fields: [
      {
        id: 'name',
        title: '服务器名称',
        type: 'text',
        required: true,
      },
      {
        id: 'listen',
        title: '监听端口',
        type: 'number',
        required: true,
        validation: {
          min: 1,
          max: 65535
        }
      },
      {
        id: 'serverName',
        title: '服务器域名',
        type: 'text',
        description: '服务器的域名'
      },
      {
        id: 'ssl',
        title: 'SSL',
        type: 'boolean',
        defaultValue: false,
        description: '启用HTTPS'
      }
    ]
  },
  {
    id: 'security',
    title: '安全设置',
    fields: [
      {
        id: 'rateLimit',
        title: '速率限制',
        type: 'object',
        fields: [
          {
            id: 'enabled',
            title: '启用',
            type: 'boolean'
          },
          {
            id: 'max',
            title: '最大请求数',
            type: 'number'
          },
          {
            id: 'windowMs',
            title: '时间窗口(ms)',
            type: 'number'
          },
          {
            id: 'statusCode',
            title: '状态码',
            type: 'number',
            defaultValue: 429
          }
        ]
      },
      {
        id: 'ipFilter',
        title: 'IP过滤',
        type: 'object',
        fields: [
          {
            id: 'blacklist',
            title: 'IP黑名单',
            type: 'array',
            children: [
              {
                id: 'ip',
                title: 'IP地址',
                type: 'text'
              }
            ]
          },
          {
            id: 'whitelist',
            title: 'IP白名单',
            type: 'array',
            children: [
              {
                id: 'ip',
                title: 'IP地址',
                type: 'text'
              }
            ]
          }
        ]
      },
      {
        id: 'csrf',
        title: 'CSRF防护',
        type: 'object',
        fields: [
          {
            id: 'enabled',
            title: '启用',
            type: 'boolean'
          },
          {
            id: 'forced',
            title: '强制检查所有请求',
            type: 'boolean'
          },
          {
            id: 'customPaths',
            title: '自定义保护路径',
            type: 'array'
          },
          {
            id: 'excludePaths',
            title: '排除路径',
            type: 'array'
          }
        ]
      }
    ]
  },
  {
    id: 'advanced',
    title: '高级设置',
    fields: [
      {
        id: 'headers',
        title: '自定义响应头',
        type: 'object',
        fields: [
          {
            id: 'add',
            title: '添加头',
            type: 'keyValue'
          },
          {
            id: 'remove',
            title: '移除头',
            type: 'array',
            children: [
              {
                id: 'key',
                title: '头名称',
                type: 'text'
              }
            ]
          }
        ]
      },
      {
        id: 'healthCheck',
        title: '健康检查',
        type: 'object',
        fields: [
          {
            id: 'enabled',
            title: '启用',
            type: 'boolean'
          },
          {
            id: 'type',
            title: '检查类型',
            type: 'select',
            options: [
              { label: 'HTTP', value: 'http' },
              { label: 'TCP', value: 'tcp' }
            ]
          },
          {
            id: 'interval',
            title: '检查间隔(ms)',
            type: 'number'
          },
          {
            id: 'timeout',
            title: '超时时间(ms)',
            type: 'number'
          },
          {
            id: 'retries',
            title: '重试次数',
            type: 'number'
          },
          {
            id: 'path',
            title: '检查路径',
            type: 'text',
            description: '仅HTTP类型需要'
          }
        ]
      }
    ]
  },
  {
    id: 'locations',
    title: '路径配置',
    fields: [
      {
        id: 'locations',
        title: '路径',
        type: 'array',
        children: [
          {
            id: 'path',
            title: '路径',
            type: 'text',
            required: true,
            defaultValue: '/'
          },
          {
            id: 'upstream',
            title: '上游服务器',
            type: 'select'
          },
          {
            id: 'proxy_pass',
            title: '代理地址',
            type: 'text'
          },
          {
            id: 'root',
            title: '根目录',
            type: 'text'
          },
          {
            id: 'return',
            title: '返回值',
            type: 'text'
          },
          {
            id: 'proxyTimeout',
            title: '代理超时(ms)',
            type: 'number'
          },
          {
            id: 'proxyBuffering',
            title: '代理缓冲',
            type: 'boolean'
          }
        ]
      }
    ]
  }
]

export default function ProxyManagement() {
  const [config, setConfig] = useState<JsonConfig>()
  const [selectedServer, setSelectedServer] = useState<string>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 改进的配置加载逻辑
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const response = await fetch('/api/config')
        if (!response.ok) {
          throw new Error('Failed to load configuration')
        }
        const data = await response.json()
        if (data.error) {
          throw new Error(data.error)
        }
        setConfig(data)
        setError(null)
      } catch (error) {
        console.error('Error loading config:', error)
        setError(error instanceof Error ? error.message : 'Failed to load configuration')
      } finally {
        setLoading(false)
      }
    }

    loadConfig()
  }, [])

  // 改进的渲染逻辑
  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-red-500 p-4 text-center">
        <p>Error: {error}</p>
        <button 
          onClick={() => window.location.reload()}
          className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          重试
        </button>
      </div>
    )
  }

  // 处理服务器配置变更
  const handleServerChange = async (serverName: string, changes: Partial<ServerConfig>) => {
    if (!config) return

    const updatedConfig = {
      ...config,
      servers: config.servers.map(server =>
        server.name === serverName ? { ...server, ...changes } : server
      )
    }

    try {
      await saveConfig(updatedConfig)
      setConfig(updatedConfig)
    } catch (error) {
      console.error('Error saving config:', error)
    }
  }

  // 保存配置
  const saveConfig = async (newConfig: JsonConfig) => {
    try {
      const response = await fetch('/api/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newConfig),
      })

      if (!response.ok) {
        throw new Error('Failed to save configuration')
      }
    } catch (error) {
      console.error('Error saving configuration:', error)
      throw error
    }
  }

  // 修改添加新服务器的方法
  const handleAddServer = async (newServer: ServerConfig) => {
    if (!config) return;

    const updatedConfig = {
      ...config,
      servers: [...config.servers, newServer]
    };

    try {
      await saveConfig(updatedConfig);
      setConfig(updatedConfig);
      setSelectedServer(newServer.name);
    } catch (error) {
      console.error('Error adding server:', error);
    }
  };

  // 处理上游服务器变更的函数
  const handleUpstreamsChange = async (upstreams: UpstreamConfig[]) => {
    if (!config) return;

    const updatedConfig = {
      ...config,
      upstreams
    };

    try {
      await saveConfig(updatedConfig);
      setConfig(updatedConfig);
    } catch (error) {
      console.error('Error saving upstreams:', error);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>代理服务器管理</CardTitle>
        <CardDescription>管理您的代理服务器配置</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="servers">
          <TabsList>
            <TabsTrigger value="servers">服务器配置</TabsTrigger>
            <TabsTrigger value="upstreams">上游服务器</TabsTrigger>
            <TabsTrigger value="general">通用配置</TabsTrigger>
          </TabsList>

          <TabsContent value="upstreams">
            <UpstreamPanel 
              upstreams={config?.upstreams || []}
              onUpstreamChange={handleUpstreamsChange}
            />
          </TabsContent>

          <TabsContent value="servers">
            <ServerConfigPanel
              servers={config?.servers || []}
              upstreams={config?.upstreams || []}
              selectedServer={selectedServer}
              onServerSelect={setSelectedServer}
              onServerChange={handleServerChange}
              onUpstreamsChange={handleUpstreamsChange}
              onAddServer={handleAddServer}
              configTemplate={SERVER_CONFIG_TEMPLATE}
            />
          </TabsContent>

          <TabsContent value="general">
            {/* 通用配置面板 */}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
} 