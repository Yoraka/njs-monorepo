interface ServerListProps {
  servers: Array<{
    name: string;
    status: string;
    metrics?: {
      incomingTraffic?: number;
      outgoingTraffic?: number;
      activeConnections?: number;
      totalRequests?: number;
    };
  }>;
}

export function ServerList({ servers = [] }: ServerListProps) {
  // 确保 servers 始终是数组
  const serverList = Array.isArray(servers) ? servers : [];

  return (
    <div className="grid gap-4">
      {serverList
        .filter(server => server.name && server.status) // 只显示有效的服务器
        .map(server => (
          <div 
            key={server.name}
            className="p-4 border rounded-lg shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-medium">{server.name}</h3>
              <span className={`px-2 py-1 rounded text-sm ${
                server.status === 'online' ? 'bg-green-100 text-green-800' : 
                server.status === 'offline' ? 'bg-red-100 text-red-800' : 
                'bg-gray-100 text-gray-800'
              }`}>
                {server.status}
              </span>
            </div>
            
            {server.metrics && (
              <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-gray-600">
                <div>连接数: {server.metrics.activeConnections || 0}</div>
                <div>总请求: {server.metrics.totalRequests || 0}</div>
                <div>入站流量: {(server.metrics.incomingTraffic || 0) / 1024} KB</div>
                <div>出站流量: {(server.metrics.outgoingTraffic || 0) / 1024} KB</div>
              </div>
            )}
          </div>
        ))}
    </div>
  );
} 