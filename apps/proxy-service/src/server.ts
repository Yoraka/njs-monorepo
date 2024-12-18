import express, { Express, Request, Response, NextFunction, RequestHandler } from 'express';
import { createProxyMiddleware, Options as ProxyOptions } from 'http-proxy-middleware';
import { Server } from 'http';
import { Server as HTTPSServer } from 'https';
import * as https from 'https';
import * as http from 'http';
import * as http2 from 'http2';
import { Config, ServerConfig, SSLConfig, LocationConfig, HeadersConfig } from './types';
import { Logger } from 'winston';
import { ProxyManager } from './proxyManager';
import { createIPFilter } from './ipFilter';
import { createRateLimiter } from './rateLimiter';
import { EventEmitter } from 'events';
import { IncomingMessage } from 'http';
import { HttpsServer } from './ssl/httpsServer';
import { CaptchaManager, createCaptchaManager } from './captcha/captchaPage';

// 定义通用服务器类型
type GenericServer = Server | HTTPSServer | http2.Http2Server | ReturnType<typeof http2.createSecureServer>;

export class ProxyServer extends EventEmitter {
  private app: Express;
  private server: GenericServer | null = null;
  private httpsServer: HttpsServer | null = null;
  private proxyManager: ProxyManager;
  private logger: Logger;
  private config: Config;
  private proxyMiddlewares: Map<string, RequestHandler> = new Map();
  private captchaManager?: CaptchaManager;

  constructor(
    config: Config,
    proxyManager: ProxyManager,
    logger: Logger
  ) {
    super();
    this.setMaxListeners(20);
    this.config = config;
    this.proxyManager = proxyManager;
    this.logger = logger;
    this.app = express();
    
    // 初始化人机验证管理器
    if (config.captcha?.enabled) {
      this.captchaManager = createCaptchaManager(config.captcha);
    }
    
    this.setupMiddleware();
  }

  /**
   * 设置全局中间件
   */
  private setupMiddleware(): void {
    // 基础中间件
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // 如果启用了人机验证，添加验证路由
    if (this.captchaManager) {
      this.app.post('/verify-captcha', (req, res) => {
        this.captchaManager!.handleVerification(req, res);
      });
    }

    // 错误处理中间件
    this.app.use(this.errorHandler.bind(this));

    // 设置每个服务器的路由和中间件
    this.setupServerRoutes();
  }

  /**
   * 设置服务器路由和中间件
   */
  private setupServerRoutes(): void {
    this.config.servers.forEach((serverConfig) => {
      // 为每个 location 创建中间件栈
      serverConfig.locations.forEach(location => {
        const middlewares = this.createMiddlewareStack(serverConfig, location);
        // 使用 location.path 而不是 serverConfig.location
        this.app.use(location.path, ...middlewares);
      });
    });
  }

  /**
   * 创建中间件栈
   */
  private createMiddlewareStack(serverConfig: ServerConfig, location: LocationConfig): RequestHandler[] {
    const middlewares: RequestHandler[] = [];

    // 优先使用 location 级别的配置，如果没有则使用 server 级别的配置
    
    // CSRF 中间件
    if (location.csrf?.enabled !== false && serverConfig.csrf?.enabled !== false) {
      middlewares.push(this.createSimpleCSRFMiddleware());
    }

    // IP 过滤中间件
    const ipFilter = location.ipFilter || serverConfig.ipFilter;
    if (ipFilter) {
      middlewares.push(createIPFilter(ipFilter, this.logger, this.captchaManager));
    }

    // 速率限制中间件
    const rateLimitConfig = location.rateLimit || serverConfig.rateLimit;
    if (rateLimitConfig) {
      middlewares.push(createRateLimiter(rateLimitConfig));
    }

    // 请求头修改中间件
    const headers = location.headers || serverConfig.headers;
    if (headers) {
      middlewares.push(this.createHeadersMiddleware(headers));
    }
    
    // 代理中间件
    middlewares.push(this.createProxyMiddleware(serverConfig, location));

    return middlewares;
  }

  /**
   * 创建简单的 CSRF 中间件
   */
  private createSimpleCSRFMiddleware(): RequestHandler {
    return (req: Request, res: Response, next: NextFunction): void => {
      const csrfToken = this.extractCSRFToken(req);
      if (csrfToken) {
        // 如果找到 CSRF token，就添加到请求头中
        req.headers['x-csrf-token'] = csrfToken;
        this.logger.debug(`CSRF token found and forwarded: ${req.method} ${req.url}`);
      }
      // 无论是否找到 token，都继续处理请求
      next();
    };
  }
  
  /**
   * 提取 CSRF Token
   */
  private extractCSRFToken(req: Request): string | null {
    // 1. 检查请求头
    const headerTokens = [
      'x-csrf-token',
      'csrf-token',
      'xsrf-token',
      'x-xsrf-token',
      '_csrf'
    ];
    
    for (const header of headerTokens) {
      if (req.headers[header]) {
        return String(req.headers[header]);
      }
    }
  
    // 2. 检 cookie
    const cookies = req.headers.cookie;
    if (cookies) {
      const cookiePatterns = [
        'authjs.csrf-token=',
        'next-auth.csrf-token=',
        'XSRF-TOKEN=',
        'csrf-token=',
        '_csrf='
      ];
  
      for (const pattern of cookiePatterns) {
        const cookie = cookies.split(';').find(c => c.trim().startsWith(pattern));
        if (cookie) {
          let value = cookie.split('=')[1];
          // 处理可能的 | 分隔符
          if (value.includes('|')) {
            value = value.split('|')[0];
          }
          return decodeURIComponent(value);
        }
      }
    }
  
    // 3. 检查请求体（如果存在）
    if (req.body && typeof req.body === 'object') {
      const bodyToken = req.body._csrf || req.body.csrf_token || req.body.csrfToken;
      if (bodyToken) {
        return String(bodyToken);
      }
    }
  
    return null;
  }

  /**
   * 创建请求头修改中间件
   */
  private createHeadersMiddleware(headers: HeadersConfig): RequestHandler {
    return (req: Request, res: Response, next: NextFunction) => {
      const { add = {}, remove = [] } = headers;

      // 添加请求头
      Object.entries(add).forEach(([key, value]) => {
        req.headers[key.toLowerCase()] = value;
      });

      // 移除请求头
      remove.forEach((header) => {
        delete req.headers[header.toLowerCase()];
      });

      next();
    };
  }

  /**
   * 创建代理中间件
   */
  private createProxyMiddleware(serverConfig: ServerConfig, location: LocationConfig): RequestHandler {
    // 根据 location 配置获取目标
    let initialTarget: string;
    
    if (location.proxy_pass) {
      // 直接使用 proxy_pass
      initialTarget = location.proxy_pass;
    } else if (location.upstream) {
      // 从 upstream 配置中获取初始目标
      const upstream = this.config.upstreams.find(u => u.name === location.upstream);
      if (!upstream || !upstream.servers.length) {
        throw new Error(`Invalid upstream configuration: ${location.upstream}`);
      }
      initialTarget = upstream.servers[0].url;
    } else if (location.targets) {
      // 向后兼容：使用旧的 targets 配置
      initialTarget = location.targets[0].url;
    } else {
      throw new Error(`No proxy target specified for location: ${location.path}`);
    }

    const initialUrl = new URL(initialTarget);

    // 创建 agent 工厂函数
    const createAgent = (protocol: string) => {
      const baseOptions = {
        family: 4,  // 保持 IPv4
        keepAlive: true
      };

      if (protocol === 'https:') {
        return new https.Agent({
          ...baseOptions,
          rejectUnauthorized: false  // 允许自签名证书
        });
      }
      return new http.Agent(baseOptions);
    };

    // 代理配置
    const proxyOptions: ProxyOptions = {
      // 初始目标，可能会被 router 函数动态修改
      target: initialTarget,
      changeOrigin: true,
      ws: true,
      secure: false,  // 允许无效证书

      // 动态设置 agent
      agent: createAgent(initialUrl.protocol),
      
      // 基础设置
      xfwd: false,
      preserveHeaderKeyCase: true,
      followRedirects: false,  // 禁用自动重定，手动处理HTTPS重定向以支持降级到HTTP
      
      cookieDomainRewrite: {
        '*': '' 
      },
      cookiePathRewrite: {
        '*': '/'
      },
      
      // 超时设置
      proxyTimeout: location.proxyTimeout || 30000,
      timeout: location.proxyTimeout || 30000,

      // 路径重写（如果配置了）
      // pathRewrite: location.pathRewrite,
      
      // 修改路由逻辑
      router: async (req) => {
        try {
          let target: string;

          if (location.proxy_pass) {
            // 直接使用 proxy_pass
            target = location.proxy_pass;
          } else if (location.upstream) {
            // 使用 upstream 配置
            const upstream = this.config.upstreams.find(u => u.name === location.upstream);
            if (!upstream) {
              throw new Error(`Upstream not found: ${location.upstream}`);
            }
            
            // 使用 upstream 的负载均衡器获取目标
            const balancer = this.proxyManager.getUpstreamBalancer(location.upstream);
            if (!balancer) {
              throw new Error(`No balancer found for upstream: ${location.upstream}`);
            }
            
            const server = balancer.getNextServer();
            if (!server) {
              throw new Error(`No available servers in upstream: ${location.upstream}`);
            }
            target = server.url;
          } else {
            // 向后兼容：使用旧的目标选择逻辑
            target = await this.proxyManager.getTarget(serverConfig, location, req as Request);
          }

          // 确保使用 IPv4
          const normalizedTarget = target
            .replace('localhost', '127.0.0.1')
            .replace('::1', '127.0.0.1');
          
          // 动态更新 agent
          const targetUrl = new URL(normalizedTarget);
          (req as any).agent = createAgent(targetUrl.protocol);
          
          return normalizedTarget;
        } catch (error) {
          this.logger.error(`Router error: ${error instanceof Error ? error.message : 'Unknown error'}`);
          throw error;
        }
      },

      on: {
        // 代理请求处理
        proxyReq: (proxyReq, req: IncomingMessage & { body?: any }, res) => {
          try {
            this.logger.debug(`Proxy request started: ${req.method} ${req.url}`);

            // POST 请求��处理
            if (req.method === 'POST' && req.body) {
              let bodyData = req.body;
              if (typeof bodyData !== 'string') {
                bodyData = JSON.stringify(bodyData);
              }
              proxyReq.setHeader('Content-Type', 'application/json');
              proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
              proxyReq.write(bodyData);
            }

            // 监控请求指标
            if (this.config.monitoring?.enabled && this.proxyManager.monitor) {
              this.handleRequestMetrics(req, serverConfig.name);
            }
          } catch (error) {
            this.logger.error('Error in proxyReq handler:', error);
          }
        },

        // 代理响应处理
        proxyRes: (proxyRes, req, res) => {
          // 处理 Set-Cookie
          const setCookie = proxyRes.headers['set-cookie'];
          if (setCookie) {
            const modifiedCookies = setCookie.map(cookie => {
              return cookie
                .replace(/Domain=[^;]+/i, '')
                .replace(/Path=[^;]+/i, 'Path=/');
            });
            res.setHeader('Set-Cookie', modifiedCookies);
          }

          // 处理重定向
          if (proxyRes.statusCode && proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
            const location = proxyRes.headers.location;
            const hasSSL = this.config.ssl?.enabled;

            // 根据SSL配置处理重定向
            if (hasSSL) {
              res.writeHead(302, { Location: location });
            } else {
              // 降级
              if (location.startsWith('https:')) {
                // 处理 HTTPS 重定向
                res.writeHead(302, { Location: location.replace('https:', 'http:') });
              } else {
                // 保持原始重定向
                res.writeHead(302, { Location: location });
              }
            }
            res.end();
          }

          // 监控响应数据
          if (this.config.monitoring?.enabled && this.proxyManager.monitor) {
            const serverName = serverConfig.name;
            let outgoingBytes = 0;

            // 计算响应头大小
            outgoingBytes += `HTTP/${proxyRes.httpVersion} ${proxyRes.statusCode} ${proxyRes.statusMessage}\r\n`.length;
            
            // 计算响应头大小
            for (const [key, value] of Object.entries(proxyRes.headers)) {
              if (Array.isArray(value)) {
                value.forEach(v => {
                  outgoingBytes += `${key}: ${v}\r\n`.length;
                });
              } else if (value) {
                outgoingBytes += `${key}: ${value}\r\n`.length;
              }
            }
            
            // 添加头部结束标记大小
            outgoingBytes += '\r\n'.length;

            // 计算响应体大小
            proxyRes.on('data', (chunk) => {
              outgoingBytes += chunk.length;
              this.logger.debug(`Sent chunk: ${chunk.length} bytes`);
            });

            proxyRes.on('end', () => {
              if (this.proxyManager.monitor) {
                this.proxyManager.monitor.updateRequestMetrics(
                  serverName,
                  0,  // incomingBytes already updated in proxyReq
                  outgoingBytes
                );
                this.logger.debug(`Response metrics updated for ${serverName}: out=${outgoingBytes}`);
              }
            });
          }
        },

        // 统一错误处理
        error: (err: Error, req: IncomingMessage, res: any) => {
          try {
            const errorMessage = `Proxy error for ${req.url}: ${err.message}`;
            this.logger.error(errorMessage);

            // 检查是否是 WebSocket 请求
            if ((req.headers['upgrade'] || '').toLowerCase() === 'websocket') {
              // WebSocket 错误处理
              if (res && res.socket && !res.socket.destroyed) {
                res.socket.end();
              }
            } else {
              // HTTP 请求错误处理
              if (res && !res.headersSent) {
                if (typeof res.status === 'function') {
                  // Express Response
                  res.status(502).json({
                    error: 'Bad Gateway',
                    message: err.message
                  });
                } else if (typeof res.writeHead === 'function') {
                  // HTTP ServerResponse
                  res.writeHead(502, {
                    'Content-Type': 'application/json'
                  });
                  res.end(JSON.stringify({
                    error: 'Bad Gateway',
                    message: err.message
                  }));
                }
              }
            }
          } catch (handlerError) {
            this.logger.error('Error in proxy error handler:', handlerError);
          }
        },

        // WebSocket 相关事件处理
        proxyReqWs: (proxyReq, req, socket, options, head) => {
          this.logger.debug(`WebSocket proxy request started: ${req.url}`);
          
          // 添加自定义头部
          if (location.headers?.add) {
            Object.entries(location.headers.add).forEach(([key, value]) => {
              proxyReq.setHeader(key, value);
            });
          }
        },

        open: (proxySocket) => {
          this.logger.debug('WebSocket connection opened');
          
          // 监控代理Socket的数据传输
          proxySocket.on('data', (data: Buffer) => {
            if (this.config.monitoring?.enabled && this.proxyManager.monitor) {
              this.proxyManager.monitor.updateRequestMetrics(
                serverConfig.name,
                0,           // incoming already counted
                data.length  // outgoing
              );
              this.logger.debug(`WebSocket proxy data sent: ${data.length} bytes`);
            }
          });
        },

        close: (res, socket, proxyRes) => {
          this.logger.debug('WebSocket connection closed');
        }
      },
    };

    // 创建代理中间件
    const middleware = createProxyMiddleware(proxyOptions);
    
    // 存储中间件以便清理
    const middlewareKey = `${serverConfig.name}:${location.path}`;
    this.proxyMiddlewares.set(middlewareKey, middleware);

    // 如果服务器已经存在，立即设置WebSocket升级处理
    if (this.server) {
      this.setupWebSocketHandlers(this.server);
    }

    return middleware;
  }

  /**
   * 处理请求监控指标
   */
  private handleRequestMetrics(req: IncomingMessage & { body?: any }, serverName: string): void {
    let incomingBytes = 0;
    
    // 计算请求行大小
    incomingBytes += `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`.length;
    
    // 计算请求头大小
    for (const [key, value] of Object.entries(req.headers)) {
      if (Array.isArray(value)) {
        value.forEach(v => {
          incomingBytes += `${key}: ${v}\r\n`.length;
        });
      } else if (value) {
        incomingBytes += `${key}: ${value}\r\n`.length;
      }
    }
    
    // 添加头部结束标记大小
    incomingBytes += '\r\n'.length;

    // 计算请求体大小
    if (req.method !== 'GET' && req.body) {
      let bodySize = 0;
      if (typeof req.body === 'string') {
        bodySize = Buffer.byteLength(req.body);
      } else if (Buffer.isBuffer(req.body)) {
        bodySize = req.body.length;
      } else {
        bodySize = Buffer.byteLength(JSON.stringify(req.body));
      }
      incomingBytes += bodySize;
    }

    // 更新监控指标
    if (this.proxyManager.monitor) {
      this.proxyManager.monitor.updateRequestMetrics(serverName, incomingBytes, 0);
    }
  }

  /**
   * 解析请求头中的变量
   */
  private resolveHeaderVariables(value: string, req: Request): string {
    const variables: { [key: string]: string } = {
      '${remote_addr}': req.ip || req.connection.remoteAddress || '',
      '${host}': req.headers.host || '',
      '${user_agent}': req.headers['user-agent'] || ''
    };

    return value.replace(/\${[^}]+}/g, match => variables[match] || match);
  }

  /**
   * 错误处理中间件
   */
  private errorHandler(err: Error, req: Request, res: Response, next: NextFunction): void {
    this.logger.error('Server error:', err);
    res.status(500).send('Internal Server Error');
  }

  /**
   * 启动服务器
   */
  public async start(): Promise<void> {
    try {
      // 从配置中获取端口，如果没有则使用默认值
      const port = this.config.servers[0].listen || 3000;

      if (this.config.ssl && this.config.ssl.enabled) {
        await this.startHttpsServer(port);
      } else {
        // 强制使用 IPv4
        this.server = this.app.listen(port, '0.0.0.0');
        this.setupServerEvents(this.server);
      }

    } catch (error) {
      this.logger.error('Failed to start server:', error);
      throw error;
    }
  }

  /**
   * 启动HTTPS服务器
   */
  private async startHttpsServer(port: number): Promise<void> {
    try {
      // 创建HTTPS服务器实例
      this.httpsServer = new HttpsServer(
        {
          ...this.config.servers[0],
          ssl: this.config.ssl
        },
        this.logger
      );

      // 设置请求处理
      const server = this.httpsServer.getServer();
      if (server) {
        server.on('request', this.app);
        
        // 重新绑定所有WebSocket升级处理器
        this.setupWebSocketHandlers(server);
      }

      // 监听证书变更事件
      this.httpsServer.on('error', (error) => {
        this.logger.error('HTTPS server error:', error);
        this.emit('serverError', error);
      });

      // 启动HTTPS服务器
      await this.httpsServer.start();
      
      // 保存服务器引用
      this.server = this.httpsServer.getServer();
      
      // 设置通用的服务器事件
      if (this.server) {
        this.setupServerEvents(this.server);
      }

    } catch (error) {
      this.logger.error('Failed to start HTTPS server:', error);
      throw error;
    }
  }

  /**
   * 设置WebSocket处理器
   */
  private setupWebSocketHandlers(server: GenericServer): void {
    // 移除现有的upgrade监听器
    server.removeAllListeners('upgrade');

    // 重新绑定所有代理中间件的upgrade处理器
    this.proxyMiddlewares.forEach((middleware, key) => {
      if (typeof (middleware as any).upgrade === 'function') {
        // 包装upgrade处理器以添加监控
        const originalUpgrade = (middleware as any).upgrade;
        (middleware as any).upgrade = (req: IncomingMessage, socket: any, head: any) => {
          const serverName = this.config.servers[0].name;
          
          // 监控WebSocket连接
          if (this.config.monitoring?.enabled && this.proxyManager.monitor) {
            this.proxyManager.monitor.updateConnectionMetrics(serverName, 1);
            this.logger.debug(`New WebSocket connection established for ${serverName}`);
            
            // 监听WebSocket连接关闭
            socket.on('close', () => {
              if (this.proxyManager.monitor) {
                this.proxyManager.monitor.updateConnectionMetrics(serverName, -1);
                this.logger.debug(`WebSocket connection closed for ${serverName}`);
              }
            });

            // 监控WebSocket消息
            socket.on('message', (data: Buffer) => {
              if (this.proxyManager.monitor) {
                this.proxyManager.monitor.updateRequestMetrics(
                  serverName,
                  data.length,  // incoming
                  0            // outgoing will be counted in proxy response
                );
                this.logger.debug(`WebSocket message received for ${serverName}: ${data.length} bytes`);
              }
            });
          }

          // 调用原始的upgrade处理器
          originalUpgrade.call(middleware, req, socket, head);
        };

        server.on('upgrade', (middleware as any).upgrade);
        this.logger.debug(`Rebound WebSocket handler for ${key}`);
      }
    });
  }

  /**
   * 设置服务器事件
   */
  private setupServerEvents(server: GenericServer): void {
    // 监听新连接
    server.on('connection', (socket) => {
      const serverName = this.config.servers[0].name;
      
      if (this.config.monitoring?.enabled && this.proxyManager.monitor) {
        this.proxyManager.monitor.updateConnectionMetrics(serverName, 1);
        this.logger.debug(`New TCP connection established for ${serverName}`);
        
        socket.on('close', () => {
          if (this.proxyManager.monitor) {
            this.proxyManager.monitor.updateConnectionMetrics(serverName, -1);
            this.logger.debug(`TCP connection closed for ${serverName}`);
          }
        });
      }
    });

    // 对于 HTTPS 连接添加额外的监听
    if (this.httpsServer && (server instanceof HTTPSServer || ('secureConnection' in server && typeof server.on === 'function'))) {
      server.on('secureConnection', (socket) => {
        const serverName = this.config.servers[0].name;
        
        if (this.config.monitoring?.enabled && this.proxyManager.monitor) {
          this.proxyManager.monitor.updateConnectionMetrics(serverName, 1);
          this.logger.debug(`New SSL/TLS connection established for ${serverName}`);
          
          socket.on('close', () => {
            if (this.proxyManager.monitor) {
              this.proxyManager.monitor.updateConnectionMetrics(serverName, -1);
              this.logger.debug(`SSL/TLS connection closed for ${serverName}`);
            }
          });
        }
      });
    }

    server.on('listening', () => {
      const addr = server.address();
      const port = typeof addr === 'string' ? addr : addr?.port;
      this.logger.info(`Server started on port ${port}`);
      this.emit('serverStarted');
    });

    server.on('error', (error) => {
      this.logger.error('Server error:', error);
      this.emit('serverError', error);
    });
  }

  /**
   * 停止服务器
   */
  public async stop(): Promise<void> {
    try {
      // 停止 HTTPS 服务器
      if (this.httpsServer) {
        await this.httpsServer.stop();
        this.httpsServer = null;
      }

      // 停止普通服务器
      if (this.server && !this.httpsServer) {
        await new Promise<void>((resolve, reject) => {
          this.server!.close((err) => {
            if (err) {
              reject(err);
            } else {
              this.server = null;
              resolve();
            }
          });
        });
      }

      // 清理代理中间件
      this.proxyMiddlewares.forEach(middleware => {
        if (typeof (middleware as any).close === 'function') {
          (middleware as any).close();
        }
      });
      this.proxyMiddlewares.clear();

      this.logger.info('Server stopped');
      this.emit('serverStopped');
    } catch (error) {
      this.logger.error('Error stopping server:', error);
      throw error;
    }
  }

  /**
   * 更新配置
   */
  public async updateConfig(newConfig: Config): Promise<void> {
    // 保存新配置
    this.config = newConfig;

    try {
      // 停止现有服务器
      await this.stop();

      // 清除现有路由
      this.app._router = undefined;

      // 清除现有的代理中间件
      this.proxyMiddlewares.clear();

      // 重新设置中间件和路由
      this.setupMiddleware();

      // 重新启动服务器
      await this.start();

      this.logger.info('Server configuration updated');
      this.emit('configUpdated', newConfig);
    } catch (error) {
      this.logger.error('Failed to update server configuration:', error);
      throw error;
    }
  }
}

/**
 * 创建代理服务器实例
 */
export function createServer(
  config: Config,
  proxyManager: ProxyManager,
  logger: Logger
): ProxyServer {
  return new ProxyServer(config, proxyManager, logger);
}
