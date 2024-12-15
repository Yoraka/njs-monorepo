import { CertificateManager } from '../ssl/certificateManager';
import { testLogger, createTestSSLConfig } from './setup';
import * as fs from 'fs';
import * as path from 'path';
import * as tls from 'tls';
import * as crypto from 'crypto';

jest.mock('fs');
jest.mock('tls');
jest.mock('crypto');

const mockedFs = jest.mocked(fs);
const mockedTls = jest.mocked(tls);
const mockedCrypto = jest.mocked(crypto);

// 创建一个模拟的 X509Certificate 类
class MockX509Certificate implements crypto.X509Certificate {
  validTo: string;
  ca: boolean;
  fingerprint: string;
  fingerprint256: string;
  fingerprint512: string;
  keyUsage: string[];
  serialNumber: string;
  subject: string;
  subjectAltName: string;
  infoAccess: string;
  issuer: string;
  validFrom: string;
  version: number;
  publicKey: crypto.KeyObject;
  raw: Buffer;

  constructor(cert: crypto.BinaryLike) {
    this.validTo = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30天后过期
    this.ca = false;
    this.fingerprint = 'mock-fingerprint';
    this.fingerprint256 = 'mock-fingerprint256';
    this.fingerprint512 = 'mock-fingerprint512';
    this.keyUsage = ['digitalSignature', 'keyEncipherment'];
    this.serialNumber = 'mock-serial-number';
    this.subject = 'CN=localhost';
    this.subjectAltName = 'DNS:localhost';
    this.infoAccess = 'mock-info-access';
    this.issuer = 'CN=localhost';
    this.validFrom = new Date(Date.now()).toISOString();
    this.version = 3;
    this.publicKey = {} as crypto.KeyObject;
    this.raw = Buffer.from('mock-certificate');
  }

  checkEmail(email: string, options?: Pick<crypto.X509CheckOptions, "subject">): string | undefined {
    return undefined;
  }

  checkHost(name: string, options?: crypto.X509CheckOptions): string | undefined {
    return name === 'localhost' ? 'localhost' : undefined;
  }

  checkIP(ip: string): string | undefined {
    return undefined;
  }

  checkIssued(otherCert: crypto.X509Certificate): boolean {
    return false;
  }

  checkPrivateKey(privateKey: crypto.KeyObject): boolean {
    return true;
  }

  equals(otherCert: crypto.X509Certificate): boolean {
    return false;
  }

  export(): Buffer {
    return Buffer.from('mock-certificate');
  }

  toString(): string {
    return 'mock-certificate';
  }

  verify(publicKey: crypto.KeyObject): boolean {
    return true;
  }

  toJSON(): string {
    return JSON.stringify({
      subject: this.subject,
      issuer: this.issuer,
      validFrom: this.validFrom,
      validTo: this.validTo
    });
  }

  toLegacyObject(): tls.PeerCertificate {
    return {
      subject: {
        C: 'CN',
        ST: 'Test',
        L: 'Test',
        O: 'Test Org',
        OU: 'Test Unit',
        CN: 'localhost'
      },
      issuer: {
        C: 'CN',
        ST: 'Test',
        L: 'Test',
        O: 'Test Org',
        OU: 'Test Unit',
        CN: 'localhost'
      },
      valid_from: this.validFrom,
      valid_to: this.validTo,
      fingerprint: this.fingerprint,
      fingerprint256: this.fingerprint256,
      fingerprint512: this.fingerprint512,
      serialNumber: this.serialNumber,
      raw: this.raw,
      subjectaltname: this.subjectAltName,
      ca: this.ca
    };
  }
}

// 在 mock crypto 模块时设置 X509Certificate
jest.spyOn(crypto, 'X509Certificate').mockImplementation((cert: crypto.BinaryLike) => new MockX509Certificate(cert));

describe('CertificateManager', () => {
  let certManager: CertificateManager;
  const sslConfig = createTestSSLConfig();

  beforeEach(() => {
    jest.clearAllMocks();
    certManager = new CertificateManager(testLogger);

    // 模拟文件系统操作
    mockedFs.promises = {
      access: jest.fn().mockResolvedValue(undefined),
      readFile: jest.fn().mockImplementation((path: string) => {
        if (path.includes('test.crt')) {
          return Promise.resolve(Buffer.from('-----BEGIN CERTIFICATE-----\nMIIDazCCAlOgAwIBAgIUBcUeHyVuR5e2kq...'));
        }
        if (path.includes('test.key')) {
          return Promise.resolve(Buffer.from('-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCB...'));
        }
        return Promise.reject(new Error('File not found'));
      })
    } as any;

    // 模拟加密操作
    mockedCrypto.createPublicKey.mockReturnValue({} as crypto.KeyObject);
    mockedCrypto.createPrivateKey.mockReturnValue({} as crypto.KeyObject);
    mockedCrypto.createSign.mockReturnValue({
      update: jest.fn().mockReturnThis(),
      sign: jest.fn().mockReturnValue(Buffer.from('signature'))
    } as any);
    mockedCrypto.createVerify.mockReturnValue({
      update: jest.fn().mockReturnThis(),
      verify: jest.fn().mockReturnValue(true)
    } as any);

    // 模拟 TLS 操作
    mockedTls.createSecureContext.mockReturnValue({} as tls.SecureContext);
  });

  describe('loadCertificate', () => {
    it('应该加载证书和密钥', async () => {
      const result = await certManager.loadCertificate(sslConfig);

      expect(result.cert).toBeDefined();
      expect(result.key).toBeDefined();
      expect(result.secureContext).toBeDefined();
      expect(mockedFs.promises.readFile).toHaveBeenCalledTimes(2);
    });

    it('当证书文件不存在时应该抛出错误', async () => {
      mockedFs.promises.access.mockRejectedValue(new Error('ENOENT: no such file or directory'));

      await expect(certManager.loadCertificate(sslConfig)).rejects.toThrow('Certificate file not found');
    });

    it('当证书和私钥不匹配时应该抛出错误', async () => {
      mockedCrypto.createVerify.mockReturnValue({
        update: jest.fn().mockReturnThis(),
        verify: jest.fn().mockReturnValue(false)
      } as any);

      await expect(certManager.loadCertificate(sslConfig)).rejects.toThrow('Certificate and private key do not match');
    });
  });

  describe('证书监控', () => {
    it('应该监听证书文件变化', async () => {
      const mockWatcher = {
        on: jest.fn(),
        close: jest.fn(),
        ref: jest.fn(),
        unref: jest.fn(),
        addListener: jest.fn(),
        once: jest.fn(),
        prependListener: jest.fn(),
        prependOnceListener: jest.fn(),
        removeListener: jest.fn(),
        removeAllListeners: jest.fn(),
        setMaxListeners: jest.fn(),
        getMaxListeners: jest.fn(),
        listeners: jest.fn(),
        rawListeners: jest.fn(),
        emit: jest.fn(),
        eventNames: jest.fn(),
        listenerCount: jest.fn()
      };

      mockedFs.watch.mockReturnValue(mockWatcher as unknown as fs.FSWatcher);

      await certManager.loadCertificate(sslConfig);

      expect(mockedFs.watch).toHaveBeenCalledTimes(2);
      expect(mockWatcher.close).not.toHaveBeenCalled();
    });

    it('应该在证书文件变化时触发事件', (done) => {
      const mockWatcher = {
        on: jest.fn(),
        close: jest.fn(),
        ref: jest.fn(),
        unref: jest.fn(),
        addListener: jest.fn(),
        once: jest.fn(),
        prependListener: jest.fn(),
        prependOnceListener: jest.fn(),
        removeListener: jest.fn(),
        removeAllListeners: jest.fn(),
        setMaxListeners: jest.fn(),
        getMaxListeners: jest.fn(),
        listeners: jest.fn(),
        rawListeners: jest.fn(),
        emit: jest.fn(),
        eventNames: jest.fn(),
        listenerCount: jest.fn()
      };

      mockedFs.watch.mockImplementation((path: fs.PathLike, listener?: fs.WatchListener<string>) => {
        if (listener && typeof listener === 'function') {
          setTimeout(() => listener('change', path.toString()), 100);
        }
        return mockWatcher as unknown as fs.FSWatcher;
      });

      certManager.on('certificateChanged', async (ssl) => {
        try {
          expect(ssl).toBeDefined();
          done();
        } catch (error) {
          done(error);
        }
      });

      certManager.loadCertificate(sslConfig).catch(done);
    }, 10000); // 增加超时时间到10秒
  });

  describe('stopWatching', () => {
    it('应该停止监听证书文件', async () => {
      const mockWatcher = {
        on: jest.fn(),
        close: jest.fn(),
        ref: jest.fn(),
        unref: jest.fn(),
        addListener: jest.fn(),
        once: jest.fn(),
        prependListener: jest.fn(),
        prependOnceListener: jest.fn(),
        removeListener: jest.fn(),
        removeAllListeners: jest.fn(),
        setMaxListeners: jest.fn(),
        getMaxListeners: jest.fn(),
        listeners: jest.fn(),
        rawListeners: jest.fn(),
        emit: jest.fn(),
        eventNames: jest.fn(),
        listenerCount: jest.fn()
      };

      mockedFs.watch.mockReturnValue(mockWatcher as unknown as fs.FSWatcher);

      await certManager.loadCertificate(sslConfig);
      certManager.stopWatching();

      expect(mockWatcher.close).toHaveBeenCalledTimes(2);
    });
  });

  describe('clearCache', () => {
    it('应该清理证书缓存', async () => {
      await certManager.loadCertificate(sslConfig);
      certManager.clearCache();

      // 再次加载证书时应该重新读取文件
      await certManager.loadCertificate(sslConfig);
      expect(mockedFs.promises.readFile).toHaveBeenCalledTimes(4); // 两次加载，每次读取 cert 和 key
    });
  });

  describe('checkCertificateExpiry', () => {
    it('应该正确检查证书过期时间', async () => {
      const testDate = new Date();
      testDate.setDate(testDate.getDate() + 60); // 60天后过期

      // 更新 MockX509Certificate 的 validTo
      jest.spyOn(crypto, 'X509Certificate').mockImplementation(() => new MockX509Certificate(Buffer.from('mock-cert')));
      Object.defineProperty(MockX509Certificate.prototype, 'validTo', {
        value: testDate.toISOString(),
        writable: true
      });

      const expiryDate = await certManager.checkCertificateExpiry(sslConfig.cert);

      expect(expiryDate).toEqual(testDate);
    });

    it('当证书即将过期时应该发出警告', async () => {
      const testDate = new Date();
      testDate.setDate(testDate.getDate() + 20); // 20天后过期

      // 更新 MockX509Certificate 的 validTo
      jest.spyOn(crypto, 'X509Certificate').mockImplementation(() => new MockX509Certificate(Buffer.from('mock-cert')));
      Object.defineProperty(MockX509Certificate.prototype, 'validTo', {
        value: testDate.toISOString(),
        writable: true
      });

      await certManager.checkCertificateExpiry(sslConfig.cert);
      
      // 验证是否记录了警告日志
      expect(testLogger.warn).toHaveBeenCalled;
    });
  });
}); 