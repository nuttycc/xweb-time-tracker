# 开发模式下聚合任务调试指南

## 概述

在开发模式下，WebTime 扩展提供了专门的调试工具来帮助开发者测试和调试聚合任务。

## 自动配置

### 开发模式特性

- **短周期调度**: 开发模式下自动将聚合间隔设置为 1 分钟（Chrome alarms API 的最小值）
- **增强日志**: 开发模式下输出更详细的调试信息
- **全局调试工具**: 暴露手动触发接口

## 手动调试

### 在浏览器控制台中使用

1. 打开 Chrome DevTools
2. 切换到 "Service Worker" 或 "Background" 上下文
3. 使用以下命令：

```javascript
// 手动触发聚合任务
await globalThis.__webtimeDebug.triggerAggregation()

// 获取聚合状态信息  
globalThis.__webtimeDebug.getAggregationStatus()
```

### 调试工作流程

1. **触发数据生成**: 浏览一些网页，生成时间追踪事件
2. **手动运行聚合**: `await globalThis.__webtimeDebug.triggerAggregation()`
3. **检查日志**: 在控制台中查看聚合过程的详细日志
4. **验证结果**: 使用数据库查询工具或其他接口验证聚合结果

## 最佳实践

- 在生产构建中，这些调试工具会自动禁用
- 开发时建议结合浏览器的 Service Worker 调试面板使用
- 注意 Chrome alarms API 的最小间隔限制为 1 分钟

## 故障排除

如果 `globalThis.__webtimeDebug` 未定义：
1. 确认扩展运行在开发模式 (`import.meta.env.DEV = true`)
2. 检查后台脚本是否正常启动
3. 确认聚合服务初始化没有错误 