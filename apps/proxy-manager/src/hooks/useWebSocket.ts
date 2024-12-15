import { useState, useEffect, useCallback } from 'react';
import { getWebSocketClient } from '@/services/ws-client';
import { getConfigService } from '@/services/config-service';
import { ServerConfig } from '@/types/proxy-config';
import { ConfigStatus, ServiceStatus } from '@/services/config-service';

export type StatusCallback = (status: ConfigStatus) => void;
export type ErrorCallback = (error: Error) => void;

export function useWebSocket() {
  const wsClient = getWebSocketClient();
  const configService = getConfigService();
  
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [configStatus, setConfigStatus] = useState<ConfigStatus>({
    lastUpdate: 0,
    status: 'idle'
  });

  useEffect(() => {
    const handleConnect = () => {
      setIsConnected(true);
      setError(null);
    };

    const handleError = (error: Error) => {
      setError(error);
      setIsConnected(false);
    };

    wsClient.on('connected', handleConnect);
    wsClient.on('error', handleError);

    // 初始状态设置
    setIsConnected(wsClient.ws?.readyState === WebSocket.OPEN);

    return () => {
      wsClient.off('connected', handleConnect);
      wsClient.off('error', handleError);
    };
  }, []);

  // 配置更新方法
  const updateConfig = useCallback(async (config: ServerConfig): Promise<void> => {
    try {
      setConfigStatus({ ...configStatus, status: 'updating' });
      await configService.updateConfig(config);
      setConfigStatus({
        lastUpdate: Date.now(),
        status: 'idle'
      });
    } catch (error) {
      setConfigStatus({
        ...configStatus,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }, [configStatus]);

  // 文件上传方法
  const uploadFile = useCallback(async (file: File, type: 'cert' | 'key' | 'other'): Promise<void> => {
    try {
      const content = await readFileAsText(file);
      if (type === 'cert' || type === 'key') {
        const path = type === 'cert' ? '/certs/server.crt' : '/certs/server.key';
        await configService.saveFile(path, content);
      } else {
        await configService.saveFile(`/uploads/${file.name}`, content);
      }
    } catch (error) {
      setError(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }, []);

  // 状态订阅方法
  const subscribeToStatus = useCallback((callback: StatusCallback): () => void => {
    const handleStatusChange = () => {
      callback(configService.getConfigStatus());
    };
    
    wsClient.on('configChanged', handleStatusChange);
    return () => wsClient.off('configChanged', handleStatusChange);
  }, []);

  // 错误订阅方法
  const subscribeToErrors = useCallback((callback: ErrorCallback): () => void => {
    const handleError = (error: Error) => {
      callback(error);
    };
    
    wsClient.on('error', handleError);
    return () => wsClient.off('error', handleError);
  }, []);

  return {
    isConnected,
    error,
    configStatus,
    updateConfig,
    uploadFile,
    subscribeToStatus,
    subscribeToErrors,
  };
}

// 辅助函数：读取文件内容
function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
} 