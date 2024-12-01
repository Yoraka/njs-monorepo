import { useState } from 'react';
import { HealthCheckConfig, UpstreamConfig, UpstreamServer } from '@/types/proxy-config';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2 } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

interface UpstreamPanelProps {
  upstreams: UpstreamConfig[];
  onUpstreamChange: (upstreams: UpstreamConfig[]) => void;
}

export function UpstreamPanel({ upstreams, onUpstreamChange }: UpstreamPanelProps) {
  const [editingUpstream, setEditingUpstream] = useState<UpstreamConfig | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  const handleSave = () => {
    if (!editingUpstream) return;
    const newUpstreams = upstreams.map(u => 
      u.name === editingUpstream.name ? editingUpstream : u
    );
    onUpstreamChange(newUpstreams);
    setIsDirty(false);
  };

  const handleAddServer = () => {
    if (!editingUpstream) return;
    setEditingUpstream({
      ...editingUpstream,
      servers: [
        ...editingUpstream.servers,
        { url: '', weight: 1 }
      ]
    });
    setIsDirty(true);
  };

  const handleRemoveServer = (index: number) => {
    if (!editingUpstream) return;
    const newServers = [...editingUpstream.servers];
    newServers.splice(index, 1);
    setEditingUpstream({
      ...editingUpstream,
      servers: newServers
    });
    setIsDirty(true);
  };

  const handleServerChange = (index: number, changes: Partial<UpstreamServer>) => {
    if (!editingUpstream) return;
    const newServers = [...editingUpstream.servers];
    newServers[index] = { ...newServers[index], ...changes };
    setEditingUpstream({
      ...editingUpstream,
      servers: newServers
    });
    setIsDirty(true);
  };

  const handleHealthCheckChange = (checked: boolean) => {
    if (!editingUpstream) return;
    
    setEditingUpstream({
      ...editingUpstream,
      healthCheck: checked ? {
        enabled: true,
        type: 'http', // 设置默认值
        interval: 5000, // 设置默认值
        timeout: 3000, // 设置默认值
        retries: 3, // 设置默认值
        path: '/health', // 设置默认值
      } : undefined
    });
    setIsDirty(true);
  };

  const handleHealthCheckUpdate = (changes: Partial<HealthCheckConfig>) => {
    if (!editingUpstream?.healthCheck) return;

    setEditingUpstream({
      ...editingUpstream,
      healthCheck: {
        ...editingUpstream.healthCheck,
        ...changes
      }
    });
    setIsDirty(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">上游服务器</h2>
        <Button onClick={() => setEditingUpstream({
          name: `upstream-${Date.now()}`,
          servers: [],
          balancer: 'round-robin'
        })}>
          新建上游服务器
        </Button>
      </div>

      {editingUpstream && (
        <Card>
          <CardHeader className="space-y-4">
            <div className="flex items-end gap-4">
              <div className="flex-1">
                <Label htmlFor="upstream-name" className="mb-2">服务器组名称</Label>
                <Input
                  id="upstream-name"
                  value={editingUpstream.name}
                  onChange={e => {
                    setEditingUpstream({...editingUpstream, name: e.target.value});
                    setIsDirty(true);
                  }}
                />
              </div>
              <div className="flex space-x-2">
                <Button 
                  variant="outline" 
                  onClick={() => setEditingUpstream(null)}
                >
                  取消
                </Button>
                <Button 
                  onClick={handleSave}
                  disabled={!isDirty}
                >
                  保存
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {/* 负载均衡策略 */}
              <div className="space-y-2">
                <Label>负载均衡策略</Label>
                <Select
                  value={editingUpstream.balancer}
                  onValueChange={(value) => {
                    setEditingUpstream({...editingUpstream, balancer: value});
                    setIsDirty(true);
                  }}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="round-robin">轮询</SelectItem>
                    <SelectItem value="least-conn">最小连接数</SelectItem>
                    <SelectItem value="ip-hash">IP哈希</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* 健康检查配置 */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={editingUpstream.healthCheck?.enabled || false}
                    onCheckedChange={handleHealthCheckChange}
                  />
                  <Label>启用健康检查</Label>
                </div>
                {editingUpstream.healthCheck?.enabled && (
                  <div className="space-y-4 mt-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>检查类型</Label>
                        <Select
                          value={editingUpstream.healthCheck.type}
                          onValueChange={(value: 'http' | 'tcp') => {
                            handleHealthCheckUpdate({ type: value });
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="http">HTTP</SelectItem>
                            <SelectItem value="tcp">TCP</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>检查间隔 (ms)</Label>
                        <Input
                          type="number"
                          value={editingUpstream.healthCheck.interval}
                          onChange={e => {
                            handleHealthCheckUpdate({ interval: Number(e.target.value) });
                          }}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>超时时间 (ms)</Label>
                        <Input
                          type="number"
                          value={editingUpstream.healthCheck.timeout}
                          onChange={e => {
                            handleHealthCheckUpdate({ timeout: Number(e.target.value) });
                          }}
                        />
                      </div>
                      <div>
                        <Label>重试次数</Label>
                        <Input
                          type="number"
                          value={editingUpstream.healthCheck.retries}
                          onChange={e => {
                            handleHealthCheckUpdate({ retries: Number(e.target.value) });
                          }}
                        />
                      </div>
                    </div>
                    {editingUpstream.healthCheck.type === 'http' && (
                      <div>
                        <Label>检查路径</Label>
                        <Input
                          value={editingUpstream.healthCheck.path}
                          onChange={e => {
                            handleHealthCheckUpdate({ path: e.target.value });
                          }}
                          placeholder="/health"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 服务器列表 */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label>服务器列表</Label>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={handleAddServer}
                  >
                    添加服务器
                  </Button>
                </div>
                {editingUpstream.servers.map((server, index) => (
                  <Card key={index} className="p-4">
                    <div className="space-y-4">
                      <div className="grid grid-cols-12 gap-4">
                        <div className="col-span-6">
                          <Label>服务器地址</Label>
                          <Input
                            placeholder="http://example.com:8080"
                            value={server.url}
                            onChange={e => handleServerChange(index, { url: e.target.value })}
                          />
                        </div>
                        <div className="col-span-2">
                          <Label>权重</Label>
                          <Input
                            type="number"
                            placeholder="1-100"
                            value={server.weight}
                            onChange={e => handleServerChange(index, { weight: Number(e.target.value) })}
                          />
                        </div>
                        <div className="col-span-3 space-y-2">
                          <Label>&nbsp;</Label>
                          <div className="flex space-x-2">
                            <Switch
                              checked={server.backup || false}
                              onCheckedChange={(checked) => handleServerChange(index, { backup: checked })}
                            />
                            <Label>备用服务器</Label>
                          </div>
                          <div className="flex space-x-2">
                            <Switch
                              checked={server.down || false}
                              onCheckedChange={(checked) => handleServerChange(index, { down: checked })}
                            />
                            <Label>暂停使用</Label>
                          </div>
                        </div>
                        <div className="col-span-1 flex items-center justify-end">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveServer(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 上游服务器列表 */}
      {!editingUpstream && upstreams.map(upstream => (
        <Card 
          key={upstream.name} 
          className="cursor-pointer hover:bg-gray-50"
        >
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <h3 className="font-medium">{upstream.name}</h3>
              <p className="text-sm text-gray-500">
                {upstream.servers.length} 个服务器 · {upstream.balancer === 'round-robin' ? '轮询' : 
                  upstream.balancer === 'least-conn' ? '最小连接数' : 'IP哈希'}
              </p>
            </div>
            <Button 
              variant="ghost" 
              onClick={() => setEditingUpstream(upstream)}
            >
              编辑配置
            </Button>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}