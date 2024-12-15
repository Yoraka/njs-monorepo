import { createLogger, Logger } from 'winston';
import { Config, SSLConfig } from '../types';
import * as path from 'path';

// 创建测试用的日志记录器
export const testLogger: Logger = createLogger({
  transports: []  // 测试时不输出日志
});

// 全局测试工具函数
export const createTestConfig = (): Config => {
  const config: Config = {
    upstreams: [{
      name: 'test_backend',
      balancer: 'round-robin',
      servers: [{
        url: 'http://localhost:8080',
        weight: 1
      }]
    }],
    servers: [{
      name: 'test_server',
      listen: 9000,
      locations: [{
        path: '/',
        upstream: 'test_backend',
        balancer: 'round-robin'
      }]
    }],
    ssl: {
      enabled: false,
      cert: '',
      key: ''
    },
    logging: {
      level: 'error',
      file: 'test.log'
    },
    monitoring: {
      enabled: false,
      pushInterval: 1000,
      metrics: ['cpuUsage', 'memoryUsage', 'serverMetrics']
    }
  };
  return config;
};

// 创建测试用的 SSL 配置
export const createTestSSLConfig = (): SSLConfig => {
  const sslConfig: SSLConfig = {
    enabled: true,
    cert: path.join(__dirname, 'fixtures/test.crt'),
    key: path.join(__dirname, 'fixtures/test.key'),
    http2: false,
    protocols: ['TLSv1.2', 'TLSv1.3']
  };
  return sslConfig;
}; 