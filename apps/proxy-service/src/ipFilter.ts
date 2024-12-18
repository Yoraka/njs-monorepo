import { RequestHandler, Request, Response, NextFunction } from 'express';
import { IPFilterConfig } from './types';
import { Logger } from 'winston';
import { CaptchaManager } from './captcha/captchaPage';

/**
 * IP过滤中间件选项接口
 */
interface IPFilterOptions {
  whitelist?: string[];
  blacklist?: string[];
  logger?: Logger;
  captchaManager?: CaptchaManager;
  rules?: {
    maxRequestsPerSecond: number;
    banDuration: number;
    maxFailedAttempts: number;
  };
}

// 存储IP请求计数
const ipRequestCounts = new Map<string, {
  count: number;
  timestamp: number;
  failedAttempts: number;
}>();

/**
 * 创建IP过滤中间件
 */
export function createIPFilter(
  config: IPFilterConfig, 
  logger?: Logger,
  captchaManager?: CaptchaManager
): RequestHandler {
  const options: IPFilterOptions = {
    whitelist: config.whitelist,
    blacklist: config.blacklist,
    logger,
    captchaManager,
    rules: {
      maxRequestsPerSecond: config.rules?.maxRequestsPerSecond || 100,
      banDuration: config.rules?.banDuration || 3600000, // 1小时
      maxFailedAttempts: config.rules?.maxFailedAttempts || 5
    }
  };

  // 定期清理过期的请求计数
  setInterval(() => {
    const now = Date.now();
    for (const [ip, data] of ipRequestCounts.entries()) {
      if (now - data.timestamp > 1000) { // 1秒
        ipRequestCounts.delete(ip);
      }
    }
  }, 1000);

  return (req: Request, res: Response, next: NextFunction): void => {
    const clientIP = getClientIP(req);

    // 记录请求IP
    logger?.debug(`IP Filter: Request from ${clientIP}`);

    // 检查是否在黑洞路由中
    if (options.captchaManager?.isBlackholed(clientIP)) {
      logger?.warn(`IP Filter: Rejected blackholed IP ${clientIP}`);
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // 如果配置了白名单
    if (options.whitelist && options.whitelist.length > 0) {
      if (!isIPInList(clientIP, options.whitelist)) {
        logger?.warn(`IP Filter: Rejected IP ${clientIP} - not in whitelist`);
        res.status(403).json({ error: 'IP not allowed' });
        return;
      }
    }

    // 如果配置了黑名单
    if (options.blacklist && options.blacklist.length > 0) {
      if (isIPInList(clientIP, options.blacklist)) {
        logger?.warn(`IP Filter: Rejected IP ${clientIP} - in blacklist`);
        res.status(403).json({ error: 'IP not allowed' });
        return;
      }
    }

    // 获取或初始化IP请求计数
    const requestData = ipRequestCounts.get(clientIP) || {
      count: 0,
      timestamp: Date.now(),
      failedAttempts: 0
    };

    // 更新请求计数
    requestData.count++;
    
    // 检查是否超过速率限制
    if (requestData.count > options.rules!.maxRequestsPerSecond) {
      requestData.failedAttempts++;
      
      // 如果启用了人机验证
      if (options.captchaManager && !options.captchaManager.isVerified(clientIP)) {
        logger?.warn(`IP Filter: Redirecting ${clientIP} to CAPTCHA`);
        options.captchaManager.handleCaptchaRequest(req, res);
        return;
      }
      
      // 如果超过最大失败尝试次数
      if (requestData.failedAttempts >= options.rules!.maxFailedAttempts) {
        logger?.warn(`IP Filter: Banned IP ${clientIP} for excessive attempts`);
        res.status(403).json({ error: 'IP banned' });
        return;
      }
    }

    // 更新IP请求数据
    ipRequestCounts.set(clientIP, requestData);

    // IP检查通过
    logger?.debug(`IP Filter: Accepted IP ${clientIP}`);
    next();
  };
}

/**
 * 获取客户端真实IP
 */
function getClientIP(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = forwarded
    ? (typeof forwarded === 'string' ? forwarded : forwarded[0])
    : req.socket.remoteAddress;
    
  return ip || '127.0.0.1';
}

/**
 * 检查IP是否在IP列表中
 */
function isIPInList(ip: string, ipList: string[]): boolean {
  return ipList.includes(ip);
}