# 构建流程

## 开发环境
1. 启动所有服务
   ```bash
   pnpm dev
   ```

2. 单独启动服务
   - proxy-manager: `pnpm dev --filter proxy-manager`
   - proxy-service: `pnpm dev --filter proxy-service`

## 生产构建
1. 构建所有项目
   ```bash
   pnpm build
   ```

2. 构建顺序
   1. typescript-config
   2. proxy-service
   3. proxy-manager

## 注意事项
- 确保依赖正确安装
- 检查环境变量配置
- 验证构建产物
