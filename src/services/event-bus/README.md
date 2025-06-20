# Event Bus 事件总线服务模块

## 模块职责
提供应用内统一的事件通信机制，支持模块间的松耦合通信，实现发布-订阅模式的事件系统。

## 功能范围

### 核心功能
- **事件发布**：支持任意模块发布事件
- **事件订阅**：支持模块订阅感兴趣的事件
- **事件路由**：将事件准确路由到订阅者
- **生命周期管理**：管理事件监听器的注册和注销

### 事件类型支持
1. **追踪事件**：时间追踪相关的业务事件
2. **同步事件**：配置同步相关的事件
3. **生命周期事件**：数据生命周期管理事件
4. **系统事件**：应用系统级事件

## 文件结构
```
event-bus/
├── README.md           # 本文档
├── emitter.ts          # 事件发射器实现
├── types.ts           # 事件类型定义
├── middleware.ts      # 事件中间件
└── logger.ts          # 事件日志记录
```

## 事件系统设计

### 事件接口定义
```typescript
interface BaseEvent {
  type: string;           // 事件类型
  timestamp: number;      // 事件时间戳
  source: string;         // 事件来源模块
  id: string;            // 事件唯一标识
}

interface EventHandler<T extends BaseEvent> {
  (event: T): void | Promise<void>;
}

interface EventBus {
  // 发布事件
  emit<T extends BaseEvent>(event: T): void;
  
  // 订阅事件
  on<T extends BaseEvent>(eventType: string, handler: EventHandler<T>): () => void;
  
  // 一次性订阅
  once<T extends BaseEvent>(eventType: string, handler: EventHandler<T>): () => void;
  
  // 取消订阅
  off(eventType: string, handler: EventHandler<any>): void;
  
  // 清除所有监听器
  clear(): void;
}
```

### 事件类型定义
```typescript
// 追踪事件
interface TrackingEvent extends BaseEvent {
  type: 'tracking.session.start' | 'tracking.session.end' | 'tracking.focus.change';
  data: {
    tabId: number;
    url: string;
    visitId?: string;
    activityId?: string;
  };
}

// 同步事件
interface SyncEvent extends BaseEvent {
  type: 'sync.config.updated' | 'sync.conflict.detected' | 'sync.status.changed';
  data: {
    configKey?: string;
    oldValue?: any;
    newValue?: any;
    deviceId?: string;
  };
}

// 生命周期事件
interface LifecycleEvent extends BaseEvent {
  type: 'lifecycle.policy.changed' | 'lifecycle.cleanup.started' | 'lifecycle.cleanup.completed';
  data: {
    policy?: string;
    affectedRecords?: number;
    cleanupResult?: any;
  };
}
```

## 事件中间件

### 中间件接口
```typescript
interface EventMiddleware {
  name: string;
  process<T extends BaseEvent>(event: T, next: (event: T) => void): void;
}
```

### 内置中间件
1. **日志中间件**：记录所有事件的发布和处理
2. **验证中间件**：验证事件格式和必要字段
3. **性能中间件**：监控事件处理性能
4. **错误处理中间件**：捕获和处理事件处理错误

## 使用示例

### 事件发布
```typescript
// 在追踪模块中发布事件
eventBus.emit({
  type: 'tracking.session.start',
  timestamp: Date.now(),
  source: 'core.tracking',
  id: generateEventId(),
  data: {
    tabId: 123,
    url: 'https://example.com',
    visitId: 'visit-uuid-123'
  }
});
```

### 事件订阅
```typescript
// 在分析模块中订阅事件
const unsubscribe = eventBus.on('tracking.session.start', (event) => {
  console.log('New tracking session started:', event.data);
  // 处理追踪会话开始逻辑
});

// 在组件销毁时取消订阅
onUnmounted(() => {
  unsubscribe();
});
```

## 性能优化

### 异步处理
- 支持异步事件处理器
- 并发控制，避免阻塞主线程
- 错误隔离，单个处理器错误不影响其他处理器

### 内存管理
- 自动清理无效的事件监听器
- 防止内存泄漏的监听器管理
- 事件历史记录的限制和清理

### 调试支持
- 事件流可视化
- 性能分析工具
- 错误追踪和报告

## 错误处理

### 错误类型
```typescript
enum EventBusErrorCode {
  HANDLER_ERROR = 'EVENT_HANDLER_ERROR',
  INVALID_EVENT = 'EVENT_INVALID_EVENT',
  MIDDLEWARE_ERROR = 'EVENT_MIDDLEWARE_ERROR',
  SUBSCRIPTION_ERROR = 'EVENT_SUBSCRIPTION_ERROR'
}
```

### 错误处理策略
- **处理器错误**：隔离错误，不影响其他处理器
- **事件格式错误**：记录错误，丢弃无效事件
- **中间件错误**：跳过错误中间件，继续处理
- **订阅错误**：记录错误，清理无效订阅

## 与其他模块的关系
- **事件来源**：core/（业务事件）、services/chrome-api/（浏览器事件）
- **事件消费**：所有模块都可以订阅和处理事件
- **日志记录**：shared/utils/（事件日志工具）
