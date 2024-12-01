# 环境搭建说明

## 前置要求

- Node.js >= 18
- pnpm >= 8.0
- Git

## 安装步骤

1. 克隆仓库

   ```bash
   git clone <repository-url>
   ```

2. 安装依赖

   ```bash
   pnpm install
   ```

3. 配置环境变量
   - 复制 `.env.example` 到 `.env.local`
   - 设置必要的环境变量

4. 启动开发环境

   ```bash
   pnpm dev
   ```

## 常见问题

1. 端口占用
   - 确保 3000, 9000, 3001 端口未被占用
   - 可通过环境变量修改端口

2. 认证问题
   - 检查 AUTH_SECRET 配置
   - 确保 proxy-service 正常运行
