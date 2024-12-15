const mockRouter = {
  use: jest.fn(),
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn()
};

interface MockExpress extends jest.Mock {
  Router: jest.Mock;
  json: jest.Mock;
  urlencoded: jest.Mock;
}

const mockExpress = jest.fn(() => ({
  use: jest.fn(),
  listen: jest.fn(),
  on: jest.fn()
})) as MockExpress;

mockExpress.Router = jest.fn(() => mockRouter);
mockExpress.json = jest.fn(() => jest.fn());
mockExpress.urlencoded = jest.fn(() => jest.fn());

jest.mock('express', () => mockExpress);

import { ProxyServer } from '../server';
import { testLogger, createTestConfig } from './setup';
import { ProxyManager } from '../proxyManager';
import { HealthChecker } from '../healthChecker';
import { Config } from '../types';
import * as http from 'http';
import * as https from 'https';
import * as WebSocket from 'ws';
import * as express from 'express';
import * as net from 'net';
import * as path from 'path';
import * as fs from 'fs';

jest.mock('../proxyManager');
jest.mock('../healthChecker');
jest.mock('http');
jest.mock('https');
jest.mock('ws', () => ({
  Server: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    close: jest.fn()
  }))
}));

describe('ProxyServer', () => {
  let proxyServer: ProxyServer;
  let proxyManager: jest.Mocked<ProxyManager>;
  let healthChecker: jest.Mocked<HealthChecker>;
  let config: Config;
  let mockHttpServer: jest.Mocked<http.Server>;
  let mockHttpsServer: jest.Mocked<https.Server>;
  let mockWsServer: jest.Mocked<WebSocket.Server>;
  let mockApp: jest.Mocked<express.Application>;

  beforeEach(() => {
    jest.clearAllMocks();
    config = createTestConfig();
    healthChecker = new HealthChecker(config.upstreams[0].servers, config.upstreams[0].healthCheck || {}, testLogger) as jest.Mocked<HealthChecker>;
    proxyManager = new ProxyManager(config, healthChecker, testLogger) as jest.Mocked<ProxyManager>;

    // 创建一个完整的 http.Server mock
    mockHttpServer = {
      listen: jest.fn().mockImplementation(function(this: http.Server, ...args: any[]) {
        const callback = args[args.length - 1];
        if (typeof callback === 'function') {
          callback();
        }
        return this;
      }),
      close: jest.fn().mockImplementation(function(this: http.Server, callback?: () => void) {
        if (callback) callback();
        return this;
      }),
      on: jest.fn().mockImplementation(function(this: http.Server, event: string, listener: Function) {
        return this;
      }),
      once: jest.fn(),
      emit: jest.fn(),
      addListener: jest.fn(),
      prependListener: jest.fn(),
      prependOnceListener: jest.fn(),
      removeListener: jest.fn(),
      removeAllListeners: jest.fn(),
      setMaxListeners: jest.fn(),
      getMaxListeners: jest.fn(),
      listeners: jest.fn(),
      rawListeners: jest.fn(),
      eventNames: jest.fn(),
      listenerCount: jest.fn()
    } as unknown as jest.Mocked<http.Server>;

    mockHttpsServer = {
      listen: jest.fn().mockImplementation(function(this: https.Server, ...args: any[]) {
        const callback = args[args.length - 1];
        if (typeof callback === 'function') {
          callback();
        }
        return this;
      }),
      close: jest.fn().mockImplementation(function(this: https.Server, callback?: () => void) {
        if (callback) callback();
        return this;
      }),
      on: jest.fn().mockImplementation(function(this: https.Server, event: string, listener: Function) {
        return this;
      }),
      once: jest.fn(),
      emit: jest.fn(),
      addListener: jest.fn(),
      prependListener: jest.fn(),
      prependOnceListener: jest.fn(),
      removeListener: jest.fn(),
      removeAllListeners: jest.fn(),
      setMaxListeners: jest.fn(),
      getMaxListeners: jest.fn(),
      listeners: jest.fn(),
      rawListeners: jest.fn(),
      eventNames: jest.fn(),
      listenerCount: jest.fn()
    } as unknown as jest.Mocked<https.Server>;

    (http.createServer as jest.Mock).mockReturnValue(mockHttpServer);
    (https.createServer as jest.Mock).mockReturnValue(mockHttpsServer);

    // Mock fs.promises.access to make it look like the certificate files exist
    jest.spyOn(fs.promises, 'access').mockResolvedValue(undefined);

    proxyServer = new ProxyServer(config, proxyManager, testLogger);
  });

  describe('start', () => {
    it('应该启动HTTP服务器', async () => {
      await proxyServer.start();
      expect(mockHttpServer.listen).toHaveBeenCalled();
    });

    it('当SSL启用时应该启动HTTPS服务器', async () => {
      config.ssl = {
        enabled: true,
        cert: path.join(__dirname, 'fixtures/test.crt'),
        key: path.join(__dirname, 'fixtures/test.key')
      };
      proxyServer = new ProxyServer(config, proxyManager, testLogger);
      await proxyServer.start();
      expect(mockHttpsServer.listen).toHaveBeenCalled();
    });

    it('当监控启用时应该启动WebSocket服务器', async () => {
      config.monitoring = {
        enabled: true,
        wsPort: 9001,
        pushInterval: 1000,
        metrics: ['cpuUsage', 'memoryUsage', 'serverMetrics']
      };
      proxyServer = new ProxyServer(config, proxyManager, testLogger);
      await proxyServer.start();
      expect(WebSocket.Server).toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    it('应该停止所有服务器', async () => {
      await proxyServer.start();
      await proxyServer.stop();
      expect(mockHttpServer.close).toHaveBeenCalled();
    });

    it('当SSL启用时应该停止HTTPS服务器', async () => {
      config.ssl = {
        enabled: true,
        cert: path.join(__dirname, 'fixtures/test.crt'),
        key: path.join(__dirname, 'fixtures/test.key')
      };
      proxyServer = new ProxyServer(config, proxyManager, testLogger);
      await proxyServer.start();
      await proxyServer.stop();
      expect(mockHttpsServer.close).toHaveBeenCalled();
    });

    it('当监控启用时应该停止WebSocket服务器', async () => {
      config.monitoring = {
        enabled: true,
        wsPort: 9001,
        pushInterval: 1000,
        metrics: ['cpuUsage', 'memoryUsage', 'serverMetrics']
      };
      proxyServer = new ProxyServer(config, proxyManager, testLogger);
      await proxyServer.start();
      await proxyServer.stop();
      expect(mockWsServer.close).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('应该处理代理错误', () => {
      const mockReq = {} as http.IncomingMessage;
      const mockRes = {
        writeHead: jest.fn(),
        end: jest.fn()
      } as unknown as http.ServerResponse;
      const error = new Error('Proxy error');

      // 直接调用 proxyServer 的 handleProxyError 方法
      (proxyServer as any).handleProxyError(error, mockReq, mockRes);

      expect(mockRes.writeHead).toHaveBeenCalledWith(502, {
        'Content-Type': 'text/plain'
      });
      expect(mockRes.end).toHaveBeenCalledWith('Proxy error occurred');
    });
  });

  describe('updateConfig', () => {
    it('应该更新配置并重启服务器', async () => {
      const newConfig = { ...config };
      newConfig.monitoring = {
        enabled: true,
        wsPort: 9001,
        pushInterval: 1000,
        metrics: ['cpuUsage', 'memoryUsage', 'serverMetrics']
      };

      await proxyServer.start();
      await proxyServer.updateConfig(newConfig);

      expect(mockHttpServer.close).toHaveBeenCalled();
      expect(mockHttpServer.listen).toHaveBeenCalled();
      expect(WebSocket.Server).toHaveBeenCalled();
    });

    it('应该在配置更新时重新配置SSL', async () => {
      const newConfig = { ...config };
      newConfig.ssl = {
        enabled: true,
        cert: path.join(__dirname, 'fixtures/test.crt'),
        key: path.join(__dirname, 'fixtures/test.key')
      };
      newConfig.monitoring = {
        enabled: true,
        wsPort: 9001,
        pushInterval: 1000,
        metrics: ['cpuUsage', 'memoryUsage', 'serverMetrics']
      };

      await proxyServer.start();
      await proxyServer.updateConfig(newConfig);

      expect(mockHttpsServer.close).toHaveBeenCalled();
      expect(mockHttpsServer.listen).toHaveBeenCalled();
    });
  });
}); 