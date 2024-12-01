import { ServerConfig, ConfigGroup, UpstreamConfig } from '@/types/proxy-config';
import ConfigForm from '@/app/components/config-form';
import ServerList from '@/app/components/server-list';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

interface ServerConfigPanelProps {
  servers: ServerConfig[];
  upstreams: UpstreamConfig[];
  selectedServer?: string;
  onServerSelect: (server: string) => void;
  onServerChange: (server: string, changes: Partial<ServerConfig>) => void;
  onUpstreamsChange: (upstreams: UpstreamConfig[]) => void;
  onAddServer: (server: ServerConfig) => void;
  configTemplate: ConfigGroup[];
}

export function ServerConfigPanel({
  servers,
  upstreams,
  selectedServer,
  onServerSelect,
  onServerChange,
  onUpstreamsChange,
  onAddServer,
  configTemplate
}: ServerConfigPanelProps) {
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
              <h3 className="text-lg font-medium">
                {isCreating ? '新建服务器配置' : '编辑服务器配置'}
              </h3>
              <div className="space-x-2">
                <Button 
                  variant="outline" 
                  onClick={handleCancel}
                  disabled={!isDirty}
                >
                  取消{isCreating ? '新建' : '修改'}
                </Button>
                <Button 
                  onClick={handleSave}
                  disabled={!isDirty}
                >
                  {isCreating ? '创建' : '保存'}配置
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