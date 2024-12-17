import { useState, useEffect, useCallback } from 'react';
import { getWebSocketClient } from '@/services/ws-client';
import { JsonConfig, ServerConfig } from '@/types/proxy-config';
import { ConfigStatus } from '@/services/config-service';

export interface UseWebSocketReturn {
  isConnected: boolean;
  error: Error | null;
  configStatus: ConfigStatus;
  updateConfig: (config: JsonConfig) => Promise<void>;
  uploadFile: (file: File, type: 'cert' | 'key' | 'other') => Promise<void>;
  subscribeToStatus: (callback: (status: ConfigStatus) => void) => () => void;
  subscribeToErrors: (callback: (error: Error) => void) => () => void;
  getConfig: () => Promise<JsonConfig>;
}

export function useWebSocket(): UseWebSocketReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [configStatus, setConfigStatus] = useState<ConfigStatus>(ConfigStatus.SAVED);
  const wsClient = getWebSocketClient();

  useEffect(() => {
    const status = wsClient.getStatus();
    setIsConnected(status.connectionState === 'connected');

    const handleConnect = () => {
      console.log('Debug - WebSocket 已连接');
      setIsConnected(true);
      setError(null);
    };

    const handleDisconnect = () => {
      console.log('Debug - WebSocket 已断开');
      setIsConnected(false);
    };

    const handleError = (err: Error) => {
      console.error('Debug - WebSocket 错误:', err);
      setError(err);
      setIsConnected(false);
    };

    const handleStateChange = (state: string) => {
      console.log('Debug - WebSocket 状态变更:', state);
      setIsConnected(state === 'connected');
    };

    wsClient.on('connected', handleConnect);
    wsClient.on('disconnected', handleDisconnect);
    wsClient.on('error', handleError);
    wsClient.on('stateChange', handleStateChange);

    if (status.connectionState === 'connected') {
      handleConnect();
    }

    return () => {
      wsClient.off('connected', handleConnect);
      wsClient.off('disconnected', handleDisconnect);
      wsClient.off('error', handleError);
      wsClient.off('stateChange', handleStateChange);
    };
  }, []);

  const updateConfig = useCallback(async (config: JsonConfig) => {
    try {
      setConfigStatus(ConfigStatus.SAVING);
      await wsClient.sendConfigUpdate(config);
      setConfigStatus(ConfigStatus.SAVED);
    } catch (err) {
      setConfigStatus(ConfigStatus.ERROR);
      throw err;
    }
  }, []);

  const uploadFile = useCallback(async (file: File, type: 'cert' | 'key' | 'other') => {
    const reader = new FileReader();
    return new Promise<void>((resolve, reject) => {
      reader.onload = async () => {
        try {
          const content = reader.result as string;
          await wsClient.sendFileUpload(file.name, content, type);
          resolve();
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }, []);

  const getConfig = useCallback(async () => {
    try {
      return await wsClient.getCurrentConfig();
    } catch (err) {
      setError(err as Error);
      throw err;
    }
  }, []);

  const subscribeToStatus = useCallback((callback: (status: ConfigStatus) => void) => {
    wsClient.on('configStatus', callback);
    return () => wsClient.off('configStatus', callback);
  }, []);

  const subscribeToErrors = useCallback((callback: (error: Error) => void) => {
    wsClient.on('error', callback);
    return () => wsClient.off('error', callback);
  }, []);

  return {
    isConnected,
    error,
    configStatus,
    updateConfig,
    uploadFile,
    subscribeToStatus,
    subscribeToErrors,
    getConfig
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