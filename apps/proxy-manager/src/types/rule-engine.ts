// 配置类型枚举
export type ConfigType = 'server' | 'general';

// 配置项类型
export type ConfigField = {
  id: string;
  type: 'text' | 'number' | 'boolean' | 'select' | 'array' | 'object';
  title: string;
  description?: string;
  defaultValue?: any;
  required?: boolean;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    message?: string;
  };
  options?: { label: string; value: any }[];
}

// 配置组
export type ConfigGroup = {
  id: string;
  title: string;
  fields: ConfigField[];
  children?: ConfigGroup[];
}

// 配置模板
export const CONFIG_TEMPLATES = {
  server: [
    {
      id: 'basic',
      title: '基本设置',
      fields: [
        {
          id: 'name',
          type: 'text',
          title: '服务器名称',
          required: true,
        },
        {
          id: 'listen',
          type: 'number',
          title: '监听端口',
          required: true,
          validation: { min: 1, max: 65535 }
        },
        {
          id: 'serverName',
          type: 'array',
          title: '域名列表',
          description: '服务器的域名列表'
        }
      ]
    },
    {
      id: 'upstream',
      title: '上游服务器',
      fields: [
        {
          id: 'targets',
          type: 'object',
          title: '目标服务器',
          children: [
            {
              id: 'url',
              type: 'text',
              title: '服务器URL',
              required: true
            },
            {
              id: 'weight',
              type: 'number',
              title: '权重',
              defaultValue: 1
            }
          ]
        }
      ]
    },
    {
      id: 'locations',
      title: '路径配置',
      type: 'array',
      fields: [
        {
          id: 'path',
          type: 'text',
          title: '路径',
          required: true
        },
        {
          id: 'targets',
          type: 'object',
          title: '目标服务器',
          children: [
            {
              id: 'url',
              type: 'text',
              title: '服务器URL',
              required: true
            },
            {
              id: 'weight',
              type: 'number',
              title: '权重',
              defaultValue: 1
            }
          ]
        },
        {
          id: 'balancer',
          type: 'select',
          title: '负载均衡器',
          options: []
        }
      ]
    }
  ],
  general: [
    {
      id: 'ssl',
      title: 'SSL配置',
      fields: [
        {
          id: 'enabled',
          type: 'boolean',
          title: '启用SSL',
          defaultValue: false
        },
        {
          id: 'cert',
          type: 'text',
          title: '证书路径'
        }
      ]
    },
    {
      id: 'logging',
      title: '日志配置',
      fields: [
        {
          id: 'level',
          type: 'select',
          title: '日志级别',
          options: [
            { label: 'DEBUG', value: 'debug' },
            { label: 'INFO', value: 'info' },
            { label: 'WARN', value: 'warn' },
            { label: 'ERROR', value: 'error' }
          ]
        }
      ]
    }
  ]
}; 