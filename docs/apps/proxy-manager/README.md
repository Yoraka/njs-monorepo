# Proxy Manager

## 应用说明
- Next.js 前端应用
- 运行端口: 3000
- 认证方式: NextAuth.js

## 关键依赖
- Next.js
- NextAuth.js
- WebSocket 客户端

## 环境配置
- .env.local: 认证配置
- AUTH_SECRET: NextAuth 密钥
- NEXTAUTH_URL: 认证服务地址

## 关键接口
1. 认证接口
   - /api/auth/*: NextAuth 路由
   
2. WebSocket
   - 连接端口: 3001
   - 用于实时监控

## 开发指南
1. 本地开发
   ```bash
   pnpm dev
   ```

2. 构建
   ```bash
   pnpm build
   ```
