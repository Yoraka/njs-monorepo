import { JsonConfig, ServerConfig, UpstreamConfig } from '@/types/proxy-config';

export class ConfigManager {
  private config: JsonConfig;

  constructor(initialConfig?: JsonConfig) {
    this.config = initialConfig || this.getDefaultConfig();
  }

  // 获取完整配置
  getConfig(): JsonConfig {
    return this.config;
  }

  // 获取服务器配置列表
  getServers(): ServerConfig[] {
    return this.config.servers;
  }

  // 获取单个服务器配置
  getServer(name: string): ServerConfig | undefined {
    return this.config.servers.find(server => server.name === name);
  }

  // 更新服务器配置
  updateServer(name: string, serverConfig: Partial<ServerConfig>): void {
    const index = this.config.servers.findIndex(server => server.name === name);
    if (index !== -1) {
      this.config.servers[index] = {
        ...this.config.servers[index],
        ...serverConfig
      };
    }
  }

  // 添加新服务器
  addServer(serverConfig: ServerConfig): void {
    this.config.servers.push(serverConfig);
  }

  // 删除服务器
  removeServer(name: string): void {
    this.config.servers = this.config.servers.filter(
      server => server.name !== name
    );
  }

  // 更新通用配置
  updateGeneralConfig(section: keyof Omit<JsonConfig, 'servers'>, value: any): void {
    this.config[section] = value;
  }

  // 导出配置
  exportConfig(): string {
    return JSON.stringify(this.config, null, 2);
  }

  // 添加上游配置管理方法
  getUpstreams(): UpstreamConfig[] {
    return this.config.upstreams;
  }

  getUpstream(name: string): UpstreamConfig | undefined {
    return this.config.upstreams.find(upstream => upstream.name === name);
  }

  updateUpstream(name: string, config: Partial<UpstreamConfig>): void {
    const index = this.config.upstreams.findIndex(upstream => upstream.name === name);
    if (index !== -1) {
      this.config.upstreams[index] = {
        ...this.config.upstreams[index],
        ...config
      };
    }
  }

  addUpstream(config: UpstreamConfig): void {
    this.config.upstreams.push(config);
  }

  removeUpstream(name: string): void {
    this.config.upstreams = this.config.upstreams.filter(
      upstream => upstream.name !== name
    );
  }

  private getDefaultConfig(): JsonConfig {
    return {
      upstreams: [],
      servers: [],
      ssl: {
        enabled: false,
        key: '',
        cert: '',
        http2: false
      },
      logging: {
        level: 'info',
        file: './logs/access.log'
      },
      monitoring: {
        enabled: false,
        pushInterval: 5000,
        metrics: []
      }
    };
  }
} 