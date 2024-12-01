# 迁移说明

## 主要变更

1. 项目结构变更
   - 原独立仓库整合为单体仓库
   - 使用 pnpm workspace 管理依赖
   - 共享配置移至 packages 目录

2. 环境变量
   - proxy-manager 的认证配置现在在 .env.local
   - proxy-service 的配置路径需要更新

3. 端口使用
   - proxy-manager: 3000 (Next.js)
   - proxy-service: 9000 (主服务), 3001 (WebSocket)

## 注意事项

1. 认证配置
   - AUTH_SECRET 需要在 .env.local 中配置
   - 本地开发时使用 3000 端口处理认证

2. WebSocket 监控
   - 监控服务运行在 3001 端口
   - 确保该端口未被占用

3. 开发环境
   - 使用 pnpm 而不是 npm
   - 所有命令需要在根目录执行
