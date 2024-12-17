import { ServerConfig, ValidationResult, JsonConfig } from '@/types/proxy-config';
import { getWebSocketClient } from './ws-client';

export enum ConfigStatus {
  SAVED = 'SAVED',
  SAVING = 'SAVING',
  ERROR = 'ERROR',
  MODIFIED = 'MODIFIED'
}

export interface ConfigStatusInfo {
  lastUpdate: number;
  status: ConfigStatus;
  error?: string;
}

export interface ServiceStatus {
  isRunning: boolean;
  uptime: number;
  activeConnections: number;
  lastRestart?: number;
}

export class ConfigService {
  private wsClient = getWebSocketClient();
  private configStatus: ConfigStatusInfo = {
    lastUpdate: 0,
    status: ConfigStatus.SAVED
  };

  // 配置管理
  public async updateConfig(serverConfig: ServerConfig): Promise<void> {
    try {
      this.configStatus.status = ConfigStatus.SAVING;
      
      // 获取当前完整配置
      const currentConfig = await this.wsClient.getCurrentConfig();
      
      // 更新服务器配置
      const updatedConfig: JsonConfig = {
        ...currentConfig,
        servers: currentConfig.servers.map(server => 
          server.name === serverConfig.name ? serverConfig : server
        )
      };

      // 发送更新后的完整配置
      await this.wsClient.sendConfigUpdate(updatedConfig);
      
      this.configStatus.lastUpdate = Date.now();
      this.configStatus.status = ConfigStatus.SAVED;
      this.configStatus.error = undefined;
    } catch (error) {
      this.configStatus.status = ConfigStatus.ERROR;
      this.configStatus.error = error instanceof Error ? error.message : 'Unknown error';
      throw error;
    }
  }

  public async uploadCertificate(cert: string, key: string): Promise<void> {
    try {
      await Promise.all([
        this.wsClient.sendFileUpload('/certs/server.crt', cert, 'cert'),
        this.wsClient.sendFileUpload('/certs/server.key', key, 'key')
      ]);
    } catch (error) {
      throw new Error(`Failed to upload certificate: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  public async validateConfig(config: ServerConfig): Promise<ValidationResult> {
    try {
      return await this.wsClient.validateConfig(config);
    } catch (error) {
      throw new Error(`Config validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // 文件操作
  public async saveFile(path: string, content: string): Promise<void> {
    try {
      await this.wsClient.sendFileUpload(path, content, 'other');
    } catch (error) {
      throw new Error(`Failed to save file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  public async deleteFile(path: string): Promise<void> {
    try {
      await this.wsClient.deleteFile(path);
    } catch (error) {
      throw new Error(`Failed to delete file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // 状态查询
  public getConfigStatus(): ConfigStatusInfo {
    return { ...this.configStatus };
  }

  public async getServiceStatus(): Promise<ServiceStatus> {
    try {
      return await this.wsClient.getServiceStatus();
    } catch (error) {
      throw new Error(`Failed to get service status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // 获取配置
  public async getConfig(): Promise<JsonConfig> {
    try {
      return await this.wsClient.getCurrentConfig();
    } catch (error) {
      this.configStatus.status = ConfigStatus.ERROR;
      this.configStatus.error = error instanceof Error ? error.message : 'Unknown error';
      throw error;
    }
  }
}

// 单例模式
let configServiceInstance: ConfigService | null = null;

export function getConfigService(): ConfigService {
  if (!configServiceInstance) {
    configServiceInstance = new ConfigService();
  }
  return configServiceInstance;
} 