import { Request, Response } from 'express';
import axios from 'axios';

/**
 * 人机验证页面配置
 */
export interface CaptchaConfig {
  enabled: boolean;
  maxAttempts: number;
  timeout: number;
  blackholeThreshold: number;
  banDuration: number;
  google?: {
    siteKey: string;
    secretKey: string;
    minScore?: number;
  };
}

/**
 * 验证记录存储
 */
interface CaptchaRecord {
  attempts: number;
  lastAttempt: number;
  verified: boolean;
  bannedUntil?: number;  // 封禁解除时间
}

/**
 * 人机验证管理器
 */
export class CaptchaManager {
  private records: Map<string, CaptchaRecord> = new Map();
  private blackholedIPs: Map<string, number> = new Map();  // IP -> 解除时间
  private config: CaptchaConfig;
  private googleEnabled: boolean = false;

  constructor(config: CaptchaConfig) {
    this.config = config;
    // 检查Google reCAPTCHA配置
    this.googleEnabled = this.checkGoogleCaptcha();
    // 定期清理过期记录
    setInterval(() => this.cleanupRecords(), 60000);
  }

  /**
   * 检查Google reCAPTCHA配置是否可用
   */
  private checkGoogleCaptcha(): boolean {
    if (!this.config.google?.siteKey || !this.config.google?.secretKey) {
      return false;
    }
    return true;
  }

  /**
   * 生成验证页面HTML
   */
  private generateCaptchaPage(ip: string, message?: string): string {
    const googleScript = this.googleEnabled ? 
      `<script src="https://www.google.com/recaptcha/api.js"></script>
       <div class="g-recaptcha" data-sitekey="${this.config.google!.siteKey}"></div>` :
      '<div class="warning">验证服务暂时不可用</div>';

    const statusMessage = message ? 
      `<div class="status-message">${message}</div>` : '';

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>安全验证</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              background: #f5f5f5;
            }
            .container {
              background: white;
              padding: 2rem;
              border-radius: 8px;
              box-shadow: 0 2px 4px rgba(0,0,0,0.1);
              text-align: center;
              max-width: 500px;
              width: 90%;
            }
            .title {
              color: #333;
              margin-bottom: 1rem;
            }
            .message {
              color: #666;
              margin-bottom: 2rem;
            }
            .warning {
              color: #856404;
              background-color: #fff3cd;
              border: 1px solid #ffeeba;
              padding: 1rem;
              margin: 1rem 0;
              border-radius: 4px;
            }
            .status-message {
              color: #721c24;
              background-color: #f8d7da;
              border: 1px solid #f5c6cb;
              padding: 1rem;
              margin: 1rem 0;
              border-radius: 4px;
            }
            .captcha-box {
              margin-bottom: 1rem;
              padding: 1rem;
              background: #f9f9f9;
              border-radius: 4px;
            }
            .button {
              background: #4CAF50;
              color: white;
              border: none;
              padding: 0.5rem 1rem;
              border-radius: 4px;
              cursor: pointer;
              margin-top: 1rem;
            }
            .button:hover {
              background: #45a049;
            }
            .info {
              margin-top: 1rem;
              color: #666;
              font-size: 0.9em;
            }
          </style>
          ${this.googleEnabled ? '<script src="https://www.google.com/recaptcha/api.js" async defer></script>' : ''}
        </head>
        <body>
          <div class="container">
            <h2 class="title">安全验证</h2>
            <p class="message">为了保护服务器安全，请完成以下验证</p>
            ${statusMessage}
            <div class="captcha-box">
              ${this.googleEnabled ? 
                `<div class="g-recaptcha" data-sitekey="${this.config.google!.siteKey}"></div>` :
                `<div class="warning">
                  验证服务暂时不可用<br>
                  请注意：频繁请求可能导致临时封禁<br>
                  当前限制：每秒${this.config.maxAttempts}次请求
                </div>`
              }
            </div>
            ${this.googleEnabled ? 
              `<button class="button" onclick="verifyCaptcha()">验证</button>
               <script>
                function verifyCaptcha() {
                  const token = grecaptcha.getResponse();
                  if (!token) {
                    alert('请完成验证');
                    return;
                  }
                  fetch('/verify-captcha', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                      token: token
                    })
                  }).then(response => {
                    if (response.ok) {
                      window.location.reload();
                    } else {
                      alert('验证失败，请重试');
                      grecaptcha.reset();
                    }
                  });
                }
               </script>` :
              `<div class="info">
                当前IP: ${ip}<br>
                限制将在以下情况解除：<br>
                1. 请求频率降低到阈值以下<br>
                2. 等待封禁时间结束（${Math.ceil(this.config.banDuration / 60000)}分钟）
               </div>`
            }
          </div>
        </body>
      </html>
    `;
  }

  /**
   * 处理验证请求
   */
  public handleCaptchaRequest(req: Request, res: Response): void {
    const clientIP = this.getClientIP(req);
    
    // 检查是否在黑洞列表中且未过期
    const blackholeExpiry = this.blackholedIPs.get(clientIP);
    if (blackholeExpiry && Date.now() < blackholeExpiry) {
      const remainingTime = Math.ceil((blackholeExpiry - Date.now()) / 60000);
      res.status(403).send(this.generateCaptchaPage(clientIP, 
        `您的IP已被临时封禁，剩余时间：${remainingTime}分钟`));
      return;
    } else if (blackholeExpiry) {
      // 清除过期的黑洞记录
      this.blackholedIPs.delete(clientIP);
    }

    // 获取或创建验证记录
    const record = this.records.get(clientIP) || {
      attempts: 0,
      lastAttempt: Date.now(),
      verified: false
    };

    // 检查是否需要进入黑洞路由
    if (record.attempts >= this.config.blackholeThreshold) {
      const banUntil = Date.now() + this.config.banDuration;
      this.blackholedIPs.set(clientIP, banUntil);
      res.status(403).send(this.generateCaptchaPage(clientIP,
        `由于过多失败尝试，您的IP已被临时封禁${Math.ceil(this.config.banDuration / 60000)}分钟`));
      return;
    }

    // 更新记录
    record.attempts++;
    record.lastAttempt = Date.now();
    this.records.set(clientIP, record);

    // 返回验证页面
    res.send(this.generateCaptchaPage(clientIP));
  }

  /**
   * 验证处理
   */
  public async handleVerification(req: Request, res: Response): Promise<void> {
    const clientIP = this.getClientIP(req);
    const { token } = req.body;
    
    if (!this.records.has(clientIP)) {
      res.status(400).json({ success: false, message: '无效的请求' });
      return;
    }

    const record = this.records.get(clientIP)!;

    if (this.googleEnabled && this.config.google) {
      try {
        // 验证Google reCAPTCHA
        const verifyUrl = 'https://www.google.com/recaptcha/api/siteverify';
        const response = await axios.post(verifyUrl, null, {
          params: {
            secret: this.config.google.secretKey,
            response: token
          }
        });

        if (response.data.success) {
          // 检查分数（如果是v3）
          if (this.config.google.minScore && response.data.score < this.config.google.minScore) {
            res.status(400).json({ success: false, message: '验证分数过低' });
            return;
          }
          record.verified = true;
          record.attempts = 0;  // 重置尝试次数
          this.records.set(clientIP, record);
          res.json({ success: true });
        } else {
          res.status(400).json({ success: false, message: '验证失败' });
        }
      } catch (error) {
        console.error('Google reCAPTCHA verification failed:', error);
        res.status(500).json({ success: false, message: '验证服务暂时不可用' });
      }
    } else {
      // 如果Google验证不可用，直接通过但保持限制
      record.verified = true;
      this.records.set(clientIP, record);
      res.json({ success: true });
    }
  }

  /**
   * 检查IP是否已通过验证
   */
  public isVerified(ip: string): boolean {
    const record = this.records.get(ip);
    return record ? record.verified : false;
  }

  /**
   * 检查IP是否在黑洞路由中
   */
  public isBlackholed(ip: string): boolean {
    const expiry = this.blackholedIPs.get(ip);
    if (!expiry) return false;
    if (Date.now() >= expiry) {
      this.blackholedIPs.delete(ip);
      return false;
    }
    return true;
  }

  /**
   * 获取客户端真实IP
   */
  private getClientIP(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    const ip = forwarded
      ? (typeof forwarded === 'string' ? forwarded : forwarded[0])
      : req.socket.remoteAddress || req.ip;
      
    return ip || '127.0.0.1';
  }

  /**
   * 清理过期记录
   */
  private cleanupRecords(): void {
    const now = Date.now();
    
    // 清理验证记录
    for (const [ip, record] of this.records.entries()) {
      if (now - record.lastAttempt > this.config.timeout) {
        this.records.delete(ip);
      }
    }

    // 清理过期的黑洞记录
    for (const [ip, expiry] of this.blackholedIPs.entries()) {
      if (now >= expiry) {
        this.blackholedIPs.delete(ip);
      }
    }
  }
}

/**
 * 创建人机验证管理器实例
 */
export function createCaptchaManager(config: CaptchaConfig): CaptchaManager {
  return new CaptchaManager(config);
} 