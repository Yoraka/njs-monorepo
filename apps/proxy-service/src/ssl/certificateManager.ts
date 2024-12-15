import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as tls from 'tls';
import { Logger } from 'winston';
import { SSLConfig } from '../types';

/**
 * 证书管理器类
 * 负责证书的加载、验证和监控
 */
export class CertificateManager extends EventEmitter {
  private certWatchers: Map<string, fs.FSWatcher> = new Map();
  private certCache: Map<string, Buffer> = new Map();
  private keyCache: Map<string, Buffer> = new Map();
  private logger: Logger;

  constructor(logger: Logger) {
    super();
    this.logger = logger;
  }

  /**
   * 加载并验证证书
   */
  public async loadCertificate(ssl: SSLConfig): Promise<{
    cert: Buffer;
    key: Buffer;
    secureContext: tls.SecureContext;
  }> {
    try {
      const certPath = path.resolve(ssl.cert);
      const keyPath = path.resolve(ssl.key);

      // 验证文件存在性
      await this.validateFileExists(certPath, 'Certificate');
      await this.validateFileExists(keyPath, 'Private key');

      // 从缓存或文件系统加载证书
      const cert = await this.loadFromCacheOrFile(certPath, this.certCache);
      const key = await this.loadFromCacheOrFile(keyPath, this.keyCache);

      // 验证证书和私钥
      await this.validateCertKeyPair(cert, key);

      // 创建安全上下文
      const secureContext = this.createSecureContext(ssl, cert, key);

      // 设置证书文件监控
      this.watchCertificate(ssl);

      return { cert, key, secureContext };
    } catch (error) {
      this.logger.error('Failed to load certificate:', error);
      throw error;
    }
  }

  /**
   * 验证文件是否存在
   */
  private async validateFileExists(filePath: string, fileType: string): Promise<void> {
    try {
      await fs.promises.access(filePath, fs.constants.R_OK);
    } catch (error) {
      throw new Error(`${fileType} file not found or not readable: ${filePath}`);
    }
  }

  /**
   * 从缓存或文件系统加载
   */
  private async loadFromCacheOrFile(
    filePath: string,
    cache: Map<string, Buffer>
  ): Promise<Buffer> {
    if (cache.has(filePath)) {
      return cache.get(filePath)!;
    }

    try {
      const content = await fs.promises.readFile(filePath);
      cache.set(filePath, content);
      return content;
    } catch (error) {
      throw new Error(`Failed to read file: ${filePath}`);
    }
  }

  /**
   * 验证��书和私钥是否匹配
   */
  private async validateCertKeyPair(cert: Buffer, key: Buffer): Promise<void> {
    try {
      const certPem = crypto.createPublicKey(cert);
      const keyPem = crypto.createPrivateKey(key);

      // 使用私钥签名一些数据
      const data = Buffer.from('test');
      const sign = crypto.createSign('SHA256');
      sign.update(data);
      const signature = sign.sign(keyPem);

      // 使用公钥验证签名
      const verify = crypto.createVerify('SHA256');
      verify.update(data);
      const isValid = verify.verify(certPem, signature);

      if (!isValid) {
        throw new Error('Certificate and private key do not match');
      }
    } catch (error) {
      throw new Error(`Invalid certificate or private key: ${(error as Error).message}`);
    }
  }

  /**
   * 创建TLS安全上下文
   */
  private createSecureContext(
    ssl: SSLConfig,
    cert: Buffer,
    key: Buffer
  ): tls.SecureContext {
    try {
      return tls.createSecureContext({
        cert: cert,
        key: key,
        ciphers: ssl.ciphers?.join(':'),
        minVersion: ssl.protocols?.[0] as tls.SecureVersion,
        maxVersion: ssl.protocols?.[ssl.protocols.length - 1] as tls.SecureVersion,
        dhparam: ssl.dhparam ? fs.readFileSync(ssl.dhparam) : undefined,
        ca: ssl.trustedCertificates?.map(caPath => 
          fs.readFileSync(path.resolve(caPath))
        ),
      });
    } catch (error) {
      throw new Error(`Failed to create secure context: ${(error as Error).message}`);
    }
  }

  /**
   * 监控证书文件变化
   */
  private watchCertificate(ssl: SSLConfig): void {
    const watchFile = (filePath: string, fileType: string) => {
      if (this.certWatchers.has(filePath)) {
        return;
      }

      const watcher = fs.watch(filePath, (eventType) => {
        if (eventType === 'change') {
          this.logger.info(`${fileType} file changed: ${filePath}`);
          // 清除缓存
          this.certCache.delete(filePath);
          this.keyCache.delete(filePath);
          // 触发重新加载事件
          this.emit('certificateChanged', ssl);
        }
      });

      this.certWatchers.set(filePath, watcher);
    };

    watchFile(path.resolve(ssl.cert), 'Certificate');
    watchFile(path.resolve(ssl.key), 'Private key');
    if (ssl.dhparam) {
      watchFile(path.resolve(ssl.dhparam), 'DH parameters');
    }
  }

  /**
   * 停止监控所有证书文件
   */
  public stopWatching(): void {
    for (const watcher of this.certWatchers.values()) {
      watcher.close();
    }
    this.certWatchers.clear();
  }

  /**
   * 清理缓存
   */
  public clearCache(): void {
    this.certCache.clear();
    this.keyCache.clear();
  }

  /**
   * 检查证书过期时间
   */
  public async checkCertificateExpiry(certPath: string): Promise<Date> {
    try {
      const cert = await this.loadFromCacheOrFile(
        path.resolve(certPath),
        this.certCache
      );
      
      const x509 = new crypto.X509Certificate(cert);
      const validTo = x509.validTo;
      
      const expiryDate = new Date(validTo);
      const now = new Date();
      const daysToExpiry = Math.ceil(
        (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysToExpiry <= 30) {
        this.logger.warn(
          `Certificate ${certPath} will expire in ${daysToExpiry} days`
        );
      }

      return expiryDate;
    } catch (error) {
      throw new Error(`Failed to check certificate expiry: ${(error as Error).message}`);
    }
  }
}

/**
 * 创建证书管理器实例
 */
export function createCertificateManager(logger: Logger): CertificateManager {
  return new CertificateManager(logger);
} 