# 架构说明

## 项目架构

1. proxy-manager (前端)
   - Next.js 应用
   - 认证服务
   - WebSocket 客户端

2. proxy-service (后端)
   - 代理服务
   - 监控服务 (WebSocket)
   - 健康检查

## 通信流程

1. 认证流程
   - NextAuth.js 处理认证
   - JWT 存储在 cookie 中

2. 代理监控
   - WebSocket 连接 (3001 端口)
   - 实时数据更新

## 部署说明

1. 开发环境
   - 使用 pnpm dev 启动所有服务
   - 支持热重载

2. 生产环境
   - 需要分别构建和部署
   - 注意配置生产环境变量
