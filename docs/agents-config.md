# Agents 配置

## 活跃 Agents

1. Monorepo 架构师
   - 文档目录: docs/monorepo/
   - 主要职责: 管理工作空间配置和项目间依赖

2. 应用专家
   - 文档目录: docs/apps/
   - 主要职责: 管理具体应用文档和接口兼容性

3. 共享包管理员
   - 文档目录: docs/packages/
   - 主要职责: 管理共享包和配置

4. 构建流程专家
   - 文档目录: docs/build/
   - 主要职责: 管理构建配置和性能

5. 测试协调员
   - 文档目录: docs/testing/
   - 主要职责: 管理测试策略和覆盖率

## 通信协议

1. 请求格式

   ```yaml
   type: <request-type>
   scope: <scope>
   components:
     - <component1>
     - <component2>
   description: <description>
   requires:
     - <required-review1>
     - <required-review2>
   ```

2. 响应格式

   ```yaml
   task-id: <task-id>
   reviewer: <agent-name>
   status: <status>
   impact:
     - <impact-area>
     - <severity>
   description: <description>
   recommendations:
     - <recommendation1>
     - <recommendation2>
   ```
