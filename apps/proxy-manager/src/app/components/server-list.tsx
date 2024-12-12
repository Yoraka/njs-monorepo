import { ServerConfig } from '@/types/proxy-config';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus } from 'lucide-react';

interface ServerListProps {
  servers: ServerConfig[];
  selectedServer?: string;
  onSelect: (server: string) => void;
  onAddNew: () => void;
}

export default function ServerList({ servers, selectedServer, onSelect, onAddNew }: ServerListProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <ScrollArea className="h-[400px] rounded-md border">
        <div className="space-y-1 p-2">
          {servers.map((server) => (
            <Button
              key={server.name}
              variant={selectedServer === server.name ? "secondary" : "ghost"}
              className="w-full justify-start"
              onClick={() => onSelect(server.name)}
            >
              {server.name}
            </Button>
          ))}
        </div>
      </ScrollArea>
      
      <Button
        variant="outline"
        className="w-full"
        onClick={onAddNew}
      >
        <Plus className="mr-2 h-4 w-4" />
        {t('proxyManagement.serverConfig.addNewServer')}
      </Button>
    </div>
  );
} 