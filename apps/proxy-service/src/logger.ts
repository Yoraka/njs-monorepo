import { createLogger, format, transports, Logger } from 'winston';
import { LoggingConfig } from './types';
import * as path from 'path';

/**
 * 创建日志记录器
 * @param config 日志配置
 * @returns Winston Logger实例
 */
export function setupLogger(config: LoggingConfig): Logger {
  // 确保日志级别有效
  const validLevel = validateLogLevel(config.level);
  
  // 创建日志格式
  const logFormat = format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    format.splat(),
    format.json()
  );

  // 创建日志记录器
  const logger = createLogger({
    level: validLevel,
    format: logFormat,
    transports: [
      // 文件传输
      new transports.File({
        filename: path.resolve(config.file),
        maxsize: 5242880, // 5MB
        maxFiles: 5,
        tailable: true
      }),
      // 控制台传输
      new transports.Console({
        format: format.combine(
          format.colorize(),
          format.simple()
        )
      })
    ]
  });

  return logger;
}

/**
 * 更新日志配置
 * @param logger 现有的日志记录器实例
 * @param newConfig 新的日志配置
 */
export function updateLogger(logger: Logger, newConfig: LoggingConfig): void {
  // 验证并更新日志级别
  const validLevel = validateLogLevel(newConfig.level);
  logger.level = validLevel;

  // 更新文件传输配置
  const fileTransport = logger.transports.find(t => t instanceof transports.File);
  if (fileTransport) {
    (fileTransport as transports.FileTransportInstance).filename = path.resolve(newConfig.file);
  }
}

/**
 * 验证日志级别
 * @param level 配置的日志级别
 * @returns 有效的日志级别
 */
function validateLogLevel(level: string): string {
  const validLevels = ['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'];
  const normalizedLevel = level.toLowerCase();
  
  if (!validLevels.includes(normalizedLevel)) {
    console.warn(`Invalid log level "${level}", falling back to "info"`);
    return 'info';
  }
  
  return normalizedLevel;
}

/**
 * 创建请求日志中间件
 * @param logger Winston Logger实例
 * @returns Express中间件函数
 */
export function createRequestLogger(logger: Logger) {
  return (req: any, res: any, next: any) => {
    // 记录请求开始时间
    const startTime = Date.now();

    // 响应结束时记录日志
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      logger.info({
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
        duration: `${duration}ms`,
        ip: req.ip,
        userAgent: req.get('user-agent')
      });
    });

    next();
  };
}

/**
 * 用于测试的模拟日志记录器
 */
export function createMockLogger(): Logger {
  return createLogger({
    level: 'info',
    transports: [new transports.Console()]
  });
}

/**
 * 创建代理中间件使用的简化logger
 * @param logger Winston Logger实例
 * @returns 简化的logger对象
 */
export function createProxyLogger(logger: Logger) {
  return {
    info: (message: string, meta?: any) => logger.info(message, meta),
    warn: (message: string, meta?: any) => logger.warn(message, meta),
    error: (message: string, meta?: any) => logger.error(message, meta)
  };
}

// 这个实现包含以下主要功能：
// setupLogger 函数
// 创建并配置 Winston 日志记录器
// 支持同时输出到文件和控制台
// 配置日志格式、大小限制等
// updateLogger 函数
// 支持热重载时更新日志配置
// 更新日志级别和文件路径
// validateLogLevel 函数
// 验证日志级别的有效性
// 提供默认的回退机制
// createRequestLogger 中间件
// 记录 HTTP 请求的详细信息
// 包括请求方法、URL、状态码、响应时间等
// createMockLogger 函数
// 用于测试环境的模拟日志记录器
// 主要特点：
// 使用 Winston 实现灵活的日志记录
// 支持日志分级和格式化
// 支持文件滚动和大小限制
// 提供请求日志中间件
// 支持配置热重载
// 包含错误处理和参数验证