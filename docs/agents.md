# Agents 配置与职责定义

## 活跃 Agents
1. Monorepo Architect (MA)
   职责: 管理整体架构和项目结构
   监控目录: docs/monorepo/
   权限: 架构决策, 依赖管理

2. Apps Expert (AE)
   职责: 管理应用间通信和接口兼容
   监控目录: docs/apps/
   权限: 接口设计, 应用配置

3. Shared Packages Manager (SPM)
   职责: 管理共享包和配置
   监控目录: docs/packages/
   权限: 包管理, 类型定义

4. Build Process Expert (BPE)
   职责: 管理构建和部署流程
   监控目录: docs/build/
   权限: 构建配置, CI/CD

5. Test Coordinator (TC)
   职责: 管理测试策略和覆盖率
   监控目录: docs/testing/
   权限: 测试规划, 质量控制

## 通信规则
1. 所有 Agent 必须在更新时签名: [角色缩写]
2. 重要决策需要相关 Agent 共同确认
3. 架构变更需要 MA 最终批准

## 优先级定义
P0: 阻塞性问题
P1: 高优先级
P2: 常规优先级
P3: 低优先级
