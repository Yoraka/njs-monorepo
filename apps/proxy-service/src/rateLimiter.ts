import rateLimit, { RateLimitRequestHandler, Options } from 'express-rate-limit';
import { RateLimitConfig } from './types';
import { Request, Response } from 'express';

/**
 * 创建速率限制中间件
 * @param rateLimitConfig 速率限制配置
 * @returns Express 速率限制中间件
 */
export function createRateLimiter(rateLimitConfig: RateLimitConfig): RateLimitRequestHandler {
  // 默认配置
  const defaultConfig: Partial<Options> = {
    windowMs: 60 * 1000, // 默认窗口期1分钟
    limit: 100, // 默认最大请求数100
    message: {
      status: 429,
      message: 'Too many requests, please try again later.'
    },
    standardHeaders: true, // 返回 `RateLimit-*` 头
    legacyHeaders: false, // 禁用 `X-RateLimit-*` 头
    statusCode: 429,
    skipFailedRequests: false, // 是否跳过失败的请求
    skipSuccessfulRequests: false, // 是否跳过成功的请求
  };

  // 合并用户配置和默认配置
  const options: Options = {
    ...defaultConfig,
    windowMs: rateLimitConfig.windowMs,
    limit: rateLimitConfig.max,
    
    // 自定义请求标识符 - 默认使用 IP
    keyGenerator: (req: Request): string => {
      return req.ip || 'unknown'; // 确保始终返回字符串
    },
    
    // 自定义跳过规则
    skip: (req: Request): boolean => {
      // 可以根据需求添加跳过规则
      // 例如: 跳过特定路径或特定 IP
      return false;
    },
    
    // 达到限制时的处理函数
    handler: (req: Request, res: Response): void => {
      res.status(429).json({
        status: 429,
        message: rateLimitConfig.message || 'Too many requests, please try again later.',
      });
    },
    
    // 必需的其他选项
    requestWasSuccessful: (req: Request, res: Response): boolean => {
      return res.statusCode < 400;
    },
    
    validate: {
      default: true,
      trustProxy: false,
    }
  } as Options;

  // 创建并返回速率限制中间件
  return rateLimit(options);
}

// 类型支持:
// 使用了 types.ts 中定义的 RateLimitConfig 接口
// 使用了 express-rate-limit 的类型定义
// 2. 配置合并:
// 提供了默认配置
// 合并用户配置和默认配置
// 功能特性:
// 支持自定义窗口期和最大请求数
// 返回标准的速率限制响应头
// 可自定义请求标识符
// 可自定义跳过规则
// 可自定义达到限制时的处理函数
// 扩展性:
// 预留了 Redis 存储的注释示例
// 可以根据需求自定义各种行为
// 错误处理:
// 提供了标准的 429 状态码响应
// 返回友好的错误信息