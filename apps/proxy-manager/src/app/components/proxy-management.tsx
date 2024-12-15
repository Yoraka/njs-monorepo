"use client"

import { useState, useEffect } from "react"
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ServerConfigPanel } from "./config-panels"
import { UpstreamPanel } from "./upstream-panel"
import { JsonConfig, ServerConfig, ConfigGroup, UpstreamConfig } from "@/types/proxy-config"
import { useWebSocket } from "@/hooks/useWebSocket"

// 定义配置模板
const getServerConfigTemplate = (t: any): ConfigGroup[] => [
  {
    id: 'basic',
    title: t('proxyManagement.serverConfig.groups.basic'),
    fields: [
      {
        id: 'name',
        title: t('proxyManagement.serverConfig.fields.name'),
        type: 'text',
        required: true,
      },
      {
        id: 'listen',
        title: t('proxyManagement.serverConfig.fields.listen'),
        type: 'number',
        required: true,
        validation: {
          min: 1,
          max: 65535
        }
      },
      {
        id: 'serverName',
        title: t('proxyManagement.serverConfig.fields.serverName'),
        type: 'text',
        description: t('proxyManagement.serverConfig.fields.serverNameDesc')
      },
      {
        id: 'ssl',
        title: t('proxyManagement.serverConfig.fields.ssl'),
        type: 'boolean',
        defaultValue: false,
        description: t('proxyManagement.serverConfig.fields.sslDesc')
      }
    ]
  },
  {
    id: 'security',
    title: t('proxyManagement.serverConfig.groups.security'),
    fields: [
      {
        id: 'rateLimit',
        title: t('proxyManagement.security.rateLimit.title'),
        type: 'object',
        fields: [
          {
            id: 'enabled',
            title: t('common.enabled'),
            type: 'boolean'
          },
          {
            id: 'max',
            title: t('proxyManagement.security.rateLimit.max'),
            type: 'number'
          },
          {
            id: 'windowMs',
            title: t('proxyManagement.security.rateLimit.windowMs'),
            type: 'number'
          },
          {
            id: 'statusCode',
            title: t('proxyManagement.security.rateLimit.statusCode'),
            type: 'number',
            defaultValue: 429
          }
        ]
      },
      {
        id: 'ipFilter',
        title: t('proxyManagement.security.ipFilter.title'),
        type: 'object',
        fields: [
          {
            id: 'blacklist',
            title: t('proxyManagement.security.ipFilter.blacklist'),
            type: 'array',
            children: [
              {
                id: 'ip',
                title: t('proxyManagement.security.ipFilter.ipAddress'),
                type: 'text'
              }
            ]
          },
          {
            id: 'whitelist',
            title: t('proxyManagement.security.ipFilter.whitelist'),
            type: 'array',
            children: [
              {
                id: 'ip',
                title: t('proxyManagement.security.ipFilter.ipAddress'),
                type: 'text'
              }
            ]
          }
        ]
      },
      {
        id: 'csrf',
        title: t('proxyManagement.security.csrf.title'),
        type: 'object',
        fields: [
          {
            id: 'enabled',
            title: t('common.enabled'),
            type: 'boolean'
          },
          {
            id: 'forced',
            title: t('proxyManagement.security.csrf.forced'),
            type: 'boolean'
          },
          {
            id: 'customPaths',
            title: t('proxyManagement.security.csrf.customPaths'),
            type: 'array'
          },
          {
            id: 'excludePaths',
            title: t('proxyManagement.security.csrf.excludePaths'),
            type: 'array'
          }
        ]
      }
    ]
  },
  {
    id: 'advanced',
    title: t('proxyManagement.serverConfig.groups.advanced'),
    fields: [
      {
        id: 'headers',
        title: t('proxyManagement.advanced.headers.title'),
        type: 'object',
        fields: [
          {
            id: 'add',
            title: t('proxyManagement.advanced.headers.add'),
            type: 'keyValue'
          },
          {
            id: 'remove',
            title: t('proxyManagement.advanced.headers.remove'),
            type: 'array',
            children: [
              {
                id: 'key',
                title: t('proxyManagement.advanced.headers.headerName'),
                type: 'text'
              }
            ]
          }
        ]
      },
      {
        id: 'healthCheck',
        title: t('proxyManagement.advanced.healthCheck.title'),
        type: 'object',
        fields: [
          {
            id: 'enabled',
            title: t('common.enabled'),
            type: 'boolean'
          },
          {
            id: 'type',
            title: t('proxyManagement.advanced.healthCheck.type'),
            type: 'select',
            options: [
              { label: t('proxyManagement.advanced.healthCheck.types.http'), value: 'http' },
              { label: t('proxyManagement.advanced.healthCheck.types.tcp'), value: 'tcp' }
            ]
          },
          {
            id: 'interval',
            title: t('proxyManagement.advanced.healthCheck.interval'),
            type: 'number'
          },
          {
            id: 'timeout',
            title: t('proxyManagement.advanced.healthCheck.timeout'),
            type: 'number'
          },
          {
            id: 'retries',
            title: t('proxyManagement.advanced.healthCheck.retries'),
            type: 'number'
          },
          {
            id: 'path',
            title: t('proxyManagement.advanced.healthCheck.path'),
            type: 'text',
            description: t('proxyManagement.advanced.healthCheck.pathDesc')
          }
        ]
      }
    ]
  },
  {
    id: 'locations',
    title: t('proxyManagement.serverConfig.groups.locations'),
    fields: [
      {
        id: 'locations',
        title: t('proxyManagement.locations.title'),
        type: 'array',
        children: [
          {
            id: 'path',
            title: t('proxyManagement.locations.path'),
            type: 'text',
            required: true,
            defaultValue: '/'
          },
          {
            id: 'upstream',
            title: t('proxyManagement.locations.upstream'),
            type: 'select'
          },
          {
            id: 'proxy_pass',
            title: t('proxyManagement.locations.proxyPass'),
            type: 'text'
          },
          {
            id: 'root',
            title: t('proxyManagement.locations.root'),
            type: 'text'
          },
          {
            id: 'return',
            title: t('proxyManagement.locations.returnValue'),
            type: 'text'
          },
          {
            id: 'proxyTimeout',
            title: t('proxyManagement.locations.proxyTimeout'),
            type: 'number'
          },
          {
            id: 'proxyBuffering',
            title: t('proxyManagement.locations.proxyBuffering'),
            type: 'boolean'
          }
        ]
      }
    ]
  }
]

export default function ProxyManagement() {
  const { t } = useTranslation()
  const [config, setConfig] = useState<JsonConfig>()
  const [selectedServer, setSelectedServer] = useState<string>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { isConnected } = useWebSocket()

  // 改进的配置加载逻辑
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const response = await fetch('/api/config')
        if (!response.ok) {
          throw new Error(t('proxyManagement.errors.loadConfig'))
        }
        const data = await response.json()
        if (data.error) {
          throw new Error(data.error)
        }
        setConfig(data)
        setError(null)
      } catch (error) {
        console.error('Error loading config:', error)
        setError(error instanceof Error ? error.message : t('proxyManagement.errors.loadConfig'))
      } finally {
        setLoading(false)
      }
    }

    loadConfig()
  }, [t])

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
        <p>{t('common.error')}: {error}</p>
        <button 
          onClick={() => window.location.reload()}
          className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          {t('common.retry')}
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
        throw new Error(t('proxyManagement.errors.saveConfig'))
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

  const SERVER_CONFIG_TEMPLATE = getServerConfigTemplate(t);

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{t('proxyManagement.title')}</CardTitle>
        <CardDescription>{t('proxyManagement.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="servers">
          <TabsList>
            <TabsTrigger value="servers">{t('proxyManagement.tabs.servers')}</TabsTrigger>
            <TabsTrigger value="upstreams">{t('proxyManagement.tabs.upstreams')}</TabsTrigger>
            <TabsTrigger value="general">{t('proxyManagement.tabs.general')}</TabsTrigger>
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
              isConnected={isConnected}
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