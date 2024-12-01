# Agent 指令模板

## 快速指令格式

1. 基础格式
```
指令: <动作>
文档: agents.md, [其他相关文档]
范围: <涉及范围>
补充: <其他说明>
```

2. 示例
```
指令: 检查项目依赖
文档: agents.md, docs/monorepo/workspace.md
范围: proxy-manager
补充: 特别关注 NextAuth 配置
```

## 常用指令类型

1. 简单任务 (无需 task.md)
```
指令: git 提交并推送
文档: agents.md
范围: 全局
```

2. 复杂任务 (需要 task.md)
```
指令: 重构认证系统
文档: agents.md, docs/communication/active.md
范围: proxy-manager, proxy-service
补充: 需要多个 Agent 协作
```

3. 紧急修复
```
指令: 修复登录问题
文档: agents.md, docs/apps/proxy-manager/README.md
范围: proxy-manager
优先级: P0
```

## 沟通方式
1. Agent 间协作
```
指令: 开始协作
文档: agents.md, docs/communication/active.md
范围: 指定 Agent
```

2. 状态查询
```
指令: 查看进度
文档: docs/communication/active.md
范围: 当前任务
```
