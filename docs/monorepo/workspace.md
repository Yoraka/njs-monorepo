# Monorepo 架构

## 项目结构

apps/
  proxy-manager/ # 前端管理界面
  proxy-service/ # 代理服务后端
packages/
  typescript-config/ # 共享 TS 配置

## 工作空间配置

- 使用 pnpm workspace
- 根目录 pnpm-workspace.yaml 定义工作空间
- 共享依赖位于根目录 node_modules

## 项目间依赖

1. proxy-manager
   - 依赖 typescript-config
   - 通过 API 调用 proxy-service

2. proxy-service
   - 依赖 typescript-config
   - 提供 API 服务
