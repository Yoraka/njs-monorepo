import * as https from 'https';
import * as http from 'http';
import * as http2 from 'http2';
import * as crypto from 'crypto';
import { Logger } from 'winston';
import { ServerConfig, SSLConfig } from '../types';
import { CertificateManager } from './certificateManager';
import { EventEmitter } from 'events';

export class HttpsServer extends EventEmitter {
  private server: https.Server | http2.Http2SecureServer | null = null;
  private redirectServer: http.Server | null = null;
  private certManager: CertificateManager;
  private logger: Logger;
  private config: ServerConfig;

  constructor(config: ServerConfig, logger: Logger) {
    super();
    this.config = config;
    this.logger = logger;
    this.certManager = new CertificateManager(logger);

    // 监听证书变化
    this.certManager.on('certificateChanged', this.handleCertificateChange.bind(this));
  }

  /**
   * 启动HTTPS服务器
   */
  public async start(): Promise<void> {
    if (!this.config.ssl?.enabled) {
      throw new Error('SSL is not enabled in the configuration');
    }

    try {
      await this.createServer();
      
      // 如果配置了SSL重定向，创建重定向服务器
      if (this.config.ssl.sslRedirect) {
        this.createRedirectServer();
      }
    } catch (error) {
      this.logger.error('Failed to start HTTPS server:', error);
      throw error;
    }
  }

  /**
   * 创建HTTPS服务器
   */
  private async createServer(): Promise<void> {
    const ssl = this.config.ssl!;
    
    try {
      // 加载证书
      const { secureContext } = await this.certManager.loadCertificate(ssl);

      // 创建服务器选项
      const options: https.ServerOptions = {
        ...secureContext,
        // 其他TLS选项
        honorCipherOrder: ssl.preferServerCiphers,
        sessionTimeout: ssl.sessionTimeout,
        ticketKeys: ssl.sessionTickets ? this.generateTicketKeys() : undefined
      };

      // 根据配置创建HTTP/2或HTTPS服务器
      if (ssl.http2) {
        this.server = http2.createSecureServer(options);
        this.logger.info('Created HTTP/2 secure server');
      } else {
        this.server = https.createServer(options);
        this.logger.info('Created HTTPS server');
      }

      // 设置服务器事件处理
      this.setupServerEvents();

      // 启动服务器
      await this.listen();
      
    } catch (error) {
      this.logger.error('Failed to create HTTPS server:', error);
      throw error;
    }
  }

  /**
   * 创建HTTP重定向服务器
   */
  private createRedirectServer(): void {
    const redirectPort = this.config.listen - 1; // 使用SSL端口-1作为HTTP端口
    
    this.redirectServer = http.createServer((req, res) => {
      const host = req.headers.host || 'localhost';
      const url = `https://${host}${req.url}`;
      
      res.writeHead(this.config.ssl?.sslRedirectStatusCode || 301, {
        'Location': url,
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
      });
      res.end();
    });

    this.redirectServer.listen(redirectPort, () => {
      this.logger.info(`HTTP to HTTPS redirect server listening on port ${redirectPort}`);
    });
  }

  /**
   * 设置服务器事件处理
   */
  private setupServerEvents(): void {
    if (!this.server) return;

    this.server.on('error', (error) => {
      this.logger.error('HTTPS server error:', error);
      this.emit('error', error);
    });

    this.server.on('tlsClientError', (error) => {
      this.logger.error('TLS client error:', error);
    });

    if (this.config.ssl?.clientCertificate?.enabled) {
      this.server.on('secureConnection', (tlsSocket) => {
        const cert = tlsSocket.getPeerCertificate();
        if (cert && Object.keys(cert).length > 0) {
          this.logger.debug('Client certificate received:', {
            subject: cert.subject,
            issuer: cert.issuer,
            valid_from: cert.valid_from,
            valid_to: cert.valid_to
          });
        }
      });
    }
  }

  /**
   * 启动服务器监听
   */
  private async listen(): Promise<void> {
    if (!this.server) {
      throw new Error('Server not created');
    }

    return new Promise((resolve, reject) => {
      this.server!.listen(this.config.listen, () => {
        this.logger.info(
          `HTTPS server listening on port ${this.config.listen}`
        );
        resolve();
      }).on('error', reject);
    });
  }

  /**
   * 处理证书变更
   */
  private async handleCertificateChange(ssl: SSLConfig): Promise<void> {
    this.logger.info('Certificate changed, reloading server...');
    
    try {
      // 停止当前服务器
      await this.stop();
      // 重新创建服务器
      await this.createServer();
      
      this.logger.info('Server reloaded successfully');
    } catch (error) {
      this.logger.error('Failed to reload server:', error);
      this.emit('error', error);
    }
  }

  /**
   * 生成会话票据密钥
   */
  private generateTicketKeys(): Buffer {
    // 生成48字节的随机密钥
    return Buffer.from(crypto.randomBytes(48));
  }

  /**
   * 停止服务器
   */
  public async stop(): Promise<void> {
    return new Promise((resolve) => {
      const cleanup = () => {
        this.certManager.stopWatching();
        this.certManager.removeAllListeners();
        this.server = null;
        resolve();
      };

      if (this.redirectServer) {
        this.redirectServer.close();
        this.redirectServer = null;
      }

      if (this.server) {
        this.server.close(() => cleanup());
      } else {
        cleanup();
      }
    });
  }

  /**
   * 获取服务器实例
   */
  public getServer(): https.Server | http2.Http2SecureServer | null {
    return this.server;
  }
}

/**
 * 创建HTTPS服务器实例
 */
export function createHttpsServer(
  config: ServerConfig,
  logger: Logger
): HttpsServer {
  return new HttpsServer(config, logger);
} 