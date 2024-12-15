import { ServerConfig, ConfigGroup, UpstreamConfig } from '@/types/proxy-config';
import { useTranslation } from 'react-i18next';
import ConfigForm from '@/app/components/config-form';
import ServerList from '@/app/components/server-list';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ServerConfigPanelProps {
  servers: ServerConfig[];
  upstreams: UpstreamConfig[];
  selectedServer?: string;
  onServerSelect: (server: string) => void;
  onServerChange: (server: string, changes: Partial<ServerConfig>) => void;
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

  const handleChange = (changes: Partial<ServerConfig>) => {
    if (!localConfig) return;
    
    const newConfig = { ...localConfig };
    
    if ('locations' in changes && Array.isArray(changes.locations)) {
      newConfig.locations = changes.locations.map((newLocation, index) => {
        const oldLocation = localConfig.locations[index];
        return {
          ...oldLocation,
          ...newLocation
        };
      });
    } else {
      Object.assign(newConfig, changes);
    }

    setLocalConfig(newConfig);
    setIsDirty(true);
  };

  const handleAddNew = () => {
    setIsCreating(true);
    setLocalConfig(defaultServerConfig);
    setIsDirty(true);
  };

  const handleSave = () => {
    if (!localConfig || !isDirty) return;
    
    if (isCreating) {
      onAddServer(localConfig);
      setIsCreating(false);
    } else if (selectedServer) {
      onServerChange(selectedServer, localConfig);
    }
    
    setIsDirty(false);
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
                  disabled={!isDirty}
                >
                  {t('common.cancel')}
                  {isCreating 
                    ? t('proxyManagement.serverConfig.creation')
                    : t('proxyManagement.serverConfig.modification')
                  }
                </Button>
                <Button 
                  onClick={handleSave}
                  disabled={!isDirty}
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
            />
          </div>
        )}
      </div>
    </div>
  );
} 