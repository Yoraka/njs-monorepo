import { ServerConfig, ConfigGroup, UpstreamConfig } from '@/types/proxy-config';
import { useTranslation } from 'react-i18next';
import ConfigForm from '@/app/components/config-form';
import ServerList from '@/app/components/server-list';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getWebSocketClient } from '@/services/ws-client';
import { toast } from '@/hooks/use-toast';

interface ServerConfigPanelProps {
  servers: ServerConfig[];
  upstreams: UpstreamConfig[];
  selectedServer?: string;
  onServerSelect: (server: string) => void;
  onServerChange: (
    server: string, 
    changes: Partial<ServerConfig> | ((prev: ServerConfig) => Partial<ServerConfig>)
  ) => void;
  onUpstreamsChange: (upstreams: UpstreamConfig[]) => void;
  onAddServer: (server: ServerConfig) => void;
  configTemplate: ConfigGroup[];
  isConnected: boolean;
}

export function ServerConfigPanel({
  servers,
  upstreams,
  selectedServer,
  onServerSelect,
  onServerChange,
  onUpstreamsChange,
  onAddServer,
  configTemplate,
  isConnected
}: ServerConfigPanelProps) {
  const { t } = useTranslation();
  const [localConfig, setLocalConfig] = useState<ServerConfig | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const wsClient = getWebSocketClient();

  const defaultServerConfig: ServerConfig = {
    name: `server-${servers.length + 1}`,
    listen: 80,
    serverName: [],
    locations: [
      {
        path: '/',
        upstream: undefined,
        targets: [],
        balancer: 'round-robin'
      }
    ]
  };

  useEffect(() => {
    if (isCreating) {
      setLocalConfig(defaultServerConfig);
      setIsDirty(true);
    } else if (selectedServer) {
      const server = servers.find(s => s.name === selectedServer);
      setLocalConfig(server || null);
      setIsDirty(false);
    }
  }, [selectedServer, servers, isCreating]);

  const handleChange = (changes: Partial<ServerConfig> | ((prev: ServerConfig) => Partial<ServerConfig>)) => {
    if (!localConfig) return;
    
    if (typeof changes === 'function') {
      setLocalConfig(prev => {
        if (!prev) return prev;
        const newChanges = changes(prev);
        return { ...prev, ...newChanges } as ServerConfig;
      });
    } else {
      setLocalConfig(prev => {
        if (!prev) return prev;
        return { ...prev, ...changes } as ServerConfig;
      });
    }
    setIsDirty(true);
  };

  const handleAddNew = () => {
    setIsCreating(true);
    setLocalConfig(defaultServerConfig);
    setIsDirty(true);
  };

  const handleSave = async () => {
    if (!localConfig || !isDirty) return;
    
    const wsStatus = wsClient.getStatus();
    console.log('配置面板 - 开始保存配置:', {
      wsStatus,
      isCreating,
      selectedServer,
      localConfig
    });
    
    if (wsStatus.connectionState !== 'connected') {
      toast({
        title: t('proxy.error'),
        description: t('proxy.websocketNotConnected'),
        variant: 'destructive',
      });
      return;
    }
    
    setIsSaving(true);
    try {
      if (isCreating) {
        console.log('配置面板 - 创建新服务器配置');
        await onAddServer(localConfig);
        setIsCreating(false);
      } else if (selectedServer) {
        console.log('配置面板 - 更新现有服务器配置:', {
          serverName: selectedServer,
          config: localConfig
        });
        await onServerChange(selectedServer, localConfig);
      }
      
      setIsDirty(false);
      toast({
        title: t('proxy.configSaved'),
        description: t('proxy.configSavedDesc'),
      });
    } catch (error) {
      console.error('配置面板 - 保存配置失败:', error);
      toast({
        title: t('proxy.saveError'),
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    if (isCreating) {
      setIsCreating(false);
      if (servers.length > 0) {
        onServerSelect(servers[0].name);
      }
    } else if (selectedServer) {
      const server = servers.find(s => s.name === selectedServer);
      setLocalConfig(server || null);
    }
    setIsDirty(false);
  };

  return (
    <div className="grid grid-cols-12 gap-4">
      <div className="col-span-3">
        <ServerList
          servers={servers}
          selectedServer={selectedServer}
          onSelect={(server) => {
            setIsCreating(false);
            onServerSelect(server);
          }}
          onAddNew={handleAddNew}
        />
      </div>
      <div className="col-span-9">
        {(localConfig || isCreating) && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-4">
                <h3 className="text-lg font-medium">
                  {isCreating 
                    ? t('proxyManagement.serverConfig.newServer')
                    : t('proxyManagement.serverConfig.editServer')
                  }
                </h3>
                <div className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium",
                  isConnected ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                )}>
                  <div className={cn(
                    "w-2 h-2 rounded-full animate-pulse",
                    isConnected ? "bg-emerald-500" : "bg-red-500"
                  )} />
                </div>
              </div>
              <div className="space-x-2">
                <Button 
                  variant="outline" 
                  onClick={handleCancel}
                  disabled={!isDirty || isSaving}
                >
                  {t('common.cancel')}
                </Button>
                <Button 
                  onClick={handleSave}
                  disabled={!isDirty || isSaving}
                  loading={isSaving}
                >
                  {isCreating 
                    ? t('proxyManagement.serverConfig.create')
                    : t('proxyManagement.serverConfig.save')
                  }
                  {t('proxyManagement.serverConfig.configuration')}
                </Button>
              </div>
            </div>
            <ConfigForm
              config={localConfig || undefined}
              template={configTemplate}
              upstreams={upstreams}
              onChange={handleChange}
              onUpstreamsChange={onUpstreamsChange}
              onSave={handleSave}
            />
          </div>
        )}
      </div>
    </div>
  );
} 