# 开发注意事项

## 系统指标监控

### CPU 使用率计算

1. 不同操作系统的 CPU 使用率计算方式不同
   - Windows 下 `os.loadavg()` 不准确
   - 改用 CPU 时间差计算，更准确且跨平台

   ```typescript
   const totalDiff = currentTotal - lastTotal;
   const idleDiff = currentIdle - lastIdle;
   const usage = 100 * (1 - idleDiff / totalDiff);
   ```

### 磁盘使用率

1. 跨平台兼容性处理
   - Linux/Unix: 使用 `df` 命令
   - Windows: 使用 `wmic` 命令

   ```typescript
   // Windows
   const { stdout } = await execAsync('wmic logicaldisk get size,freespace,caption');
   // Linux
   const { stdout } = await execAsync("df / | tail -1 | awk '{print $5}'");
   ```

## WebSocket 数据处理

### 前端数据获取策略

1. 避免直接使用 WebSocket 获取频繁更新的数据
   - 使用 HTTP API 轮询替代 WebSocket
   - 统一数据刷新频率（5秒）
   - 减少 WebSocket 连接错误

### 数据管理

1. MetricsManager 使用单例模式
   - 避免重复创建连接
   - 统一管理系统指标

   ```typescript
   export function getMetricsManager(): MetricsManager {
     if (!MetricsManager.instance) {
       MetricsManager.instance = new MetricsManager();
     }
     return MetricsManager.instance;
   }
   ```

## PowerShell 特殊处理

### 命令执行

1. PowerShell 不支持 `&&` 操作符
   - 需要分步执行命令
   - 或使用 PowerShell 特有的语法

   ```powershell
   # 错误示例
   git add file1 && git commit -m "message"
   
   # 正确示例
   git add file1
   git commit -m "message"
   ```

## 类型定义

### 系统指标接口

1. 保持前后端类型定义一致

   ```typescript
   export interface SystemMetrics {
     cpuUsage: number;
     memoryUsage: number;
     memoryPercentage: number;
     diskUsage: number;
   }
   ```

## 错误处理

### 数据获取失败

1. 提供合理的默认值
2. 添加错误日志
3. 实现优雅降级

   ```typescript
   try {
     const data = await fetchSystemMetrics();
     setSystemMetrics(data);
   } catch (error) {
     console.error('Failed to fetch system metrics:', error);
     // 使用默认值或缓存数据
   }
   ```

## 性能优化

### 数据刷新策略

1. 不同类型数据使用不同的刷新频率
   - 系统指标：5秒
   - 服务器列表：10秒
   - 趋势数据：30秒
2. 避免过于频繁的更新影响性能

## 代码组织

### API 路由

1. 按功能模块组织路由

   ```typescript
   /api/proxy-stats/
   ├── system/     # 系统指标
   ├── servers/    # 服务器列表
   └── history/    # 历史数据
   ```

### 工具函数

1. 将通用功能抽离为独立模块
   - 系统指标收集
   - 数据格式化
   - WebSocket 客户端

## 国际化（i18n）实现

### Next.js SSR 环境下的注意事项

1. 水合(Hydration)错误处理
   - 服务端渲染(SSR)和客户端渲染可能产生不匹配
   - 需要确保 i18n 只在客户端初始化
   ```typescript
   // i18n/config.ts
   if (typeof window !== 'undefined') {
     i18n.use(LanguageDetector).use(initReactI18next).init({
       // 配置项
     });
   }
   ```

2. 组件渲染保护
   - 使用 mounted 状态确保组件只在客户端渲染
   ```typescript
   const [mounted, setMounted] = useState(false);
   useEffect(() => {
     setMounted(true);
   }, []);
   if (!mounted) return null;
   ```

3. Provider 初始化
   - 需要等待 i18n 初始化完成
   - 使用状态管理避免闪烁
   ```typescript
   const [isI18nInitialized, setIsI18nInitialized] = useState(false);
   useEffect(() => {
     setIsI18nInitialized(true);
   }, []);
   if (!isI18nInitialized) return null;
   ```

### 翻译文件组织

1. 命名空间划分
   - 按功能模块组织翻译键
   - 使用层级结构避免键名冲突
   ```typescript
   {
     common: { ... },     // 通用翻译
     menu: { ... },       // 菜单相关
     proxy: { ... },      // 代理管理相关
     settings: { ... }    // 设置相关
   }
   ```

2. 类型定义
   - 确保翻译键类型完整
   - 使用 TypeScript 接口定义翻译结构
   ```typescript
   interface Translation {
     translation: {
       [key: string]: {
         [key: string]: string | object;
       };
     };
   }
   ```

### 最佳实践

1. 组件中使用
   - 优先使用翻译键而非硬编码文本
   - 保持翻译键的语义化命名
   ```typescript
   // 推荐
   {t('menu.dashboard')}
   // 不推荐
   {t('dashboard')}
   ```

2. 动态内容
   - 使用插值而非字符串拼接
   - 保持翻译文本的完整性
   ```typescript
   // 推荐
   {t('proxy.serverCount', { count: servers.length })}
   // 不推荐
   {servers.length + t('proxy.servers')}
   ```

3. 性能优化
   - 避免在渲染循环中重复调用 t 函数
   - 考虑使用 useMemo 缓存翻译结果
   ```typescript
   const translations = useMemo(() => ({
     title: t('proxy.title'),
     description: t('proxy.description')
   }), [t]);
   ```
