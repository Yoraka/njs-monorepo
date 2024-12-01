import { RequestHandler, Request, Response, NextFunction } from 'express';
import { IPFilterConfig } from './types';
import { Logger } from 'winston';

/**
 * IP过滤中间件选项接口
 */
interface IPFilterOptions {
  whitelist?: string[];
  blacklist?: string[];
  logger?: Logger;
}

/**
 * 创建IP过滤中间件
 * @param config IP过滤配置
 * @param logger 日志记录器
 * @returns Express中间件
 */
export function createIPFilter(config: IPFilterConfig, logger?: Logger): RequestHandler {
  const options: IPFilterOptions = {
    whitelist: config.whitelist,
    blacklist: config.blacklist,
    logger
  };

  return (req: Request, res: Response, next: NextFunction): void => {
    const clientIP = getClientIP(req);

    // 记录请求IP
    logger?.debug(`IP Filter: Request from ${clientIP}`);

    // 如果配置了白名单
    if (options.whitelist && options.whitelist.length > 0) {
      if (!isIPInList(clientIP, options.whitelist)) {
        logger?.warn(`IP Filter: Rejected IP ${clientIP} - not in whitelist`);
        res.status(403).json({
          error: 'IP not allowed'
        });
        return;
      }
    }

    // 如果配置了黑名单
    if (options.blacklist && options.blacklist.length > 0) {
      if (isIPInList(clientIP, options.blacklist)) {
        logger?.warn(`IP Filter: Rejected IP ${clientIP} - in blacklist`);
        res.status(403).json({
          error: 'IP not allowed'
        });
        return;
      }
    }

    // IP检查通过
    logger?.debug(`IP Filter: Accepted IP ${clientIP}`);
    next();
  };
}

/**
 * 获取客户端真实IP
 * @param req Express请求对象
 * @returns 客户端IP
 */
function getClientIP(req: Request): string {
  // 按优先级获取真实IP
  const ip = req.headers['x-forwarded-for'] || 
             req.headers['x-real-ip'] ||
             req.ip || 
             req.connection.remoteAddress || 
             '';
             
  // 处理多个IP的情况（代理链）
  const ips = Array.isArray(ip) ? ip[0] : ip.split(',')[0];
  
  // 清理IP地址
  const cleanIP = ips.trim().replace(/^::ffff:/, '');
  
  // 验证是否是有效的IP地址
  if (cleanIP === '${remote_addr}' || !cleanIP) {
    return '127.0.0.1'; // 如果是变量占位符或空值，返回本地地址
  }
  
  return cleanIP;
}

/**
 * 检查IP是否在IP列表中
 * @param ip 要检查的IP
 * @param ipList IP列表
 * @returns 是否在列表中
 */
function isIPInList(ip: string, ipList: string[]): boolean {
  // 移除IPv4映射的IPv6前缀
  const cleanIP = ip.replace(/^::ffff:/, '');
  
  // 支持CIDR格式和精确匹配
  return ipList.some(ipPattern => {
    const cleanPattern = ipPattern.replace(/^::ffff:/, '');
    
    // CIDR格式检查
    if (cleanPattern.includes('/')) {
      return isIPInCIDR(cleanIP, cleanPattern);
    }
    // 精确匹配
    return cleanIP === cleanPattern;
  });
}

/**
 * 检查IP是否在CIDR范围内
 * @param ip 要检查的IP
 * @param cidr CIDR格式的IP范围
 * @returns 是否在范围内
 */
function isIPInCIDR(ip: string, cidr: string): boolean {
  try {
    const [range, bits = "32"] = cidr.split("/");
    const mask = ~((1 << (32 - parseInt(bits))) - 1);
    
    const ipNum = ip2long(ip);
    const rangeNum = ip2long(range);
    
    if (ipNum === null || rangeNum === null) {
      return false;
    }
    
    return (ipNum & mask) === (rangeNum & mask);
  } catch (err) {
    return false;
  }
}

/**
 * 将IP转换为32位无符号整数
 * @param ip IP地址字符串
 * @returns 转换后的数字，转换失败返回null
 */
function ip2long(ip: string): number | null {
    try {
      const parts = ip.split('.');
      if (parts.length !== 4) {
        return null;
      }
      
      return parts.reduce((num, octet) => {
        const oct = parseInt(octet);
        if (isNaN(oct) || oct < 0 || oct > 255) {
          throw new Error('Invalid IP octet');
        }
        return (num << 8) + oct;
      }, 0) >>> 0; // 确保结果是32位无符号整数
    } catch (err) {
      return null;
    }
  }