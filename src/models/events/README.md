# Events 事件模型目录

## 目录职责
定义应用中所有事件类型，包括领域事件、系统事件和集成事件，为事件驱动架构提供统一的事件模型。

## 事件分类

### 领域事件 (Domain Events)
反映业务领域中重要状态变化的事件，由业务操作触发。

### 系统事件 (System Events)
反映系统级状态变化的事件，如启动、关闭、错误等。

### 集成事件 (Integration Events)
用于模块间通信的事件，支持松耦合的模块协作。

## 文件结构
```
events/
├── README.md           # 本文档
├── tracking.ts         # 追踪相关事件
├── sync.ts            # 同步相关事件
├── lifecycle.ts       # 生命周期事件
├── system.ts          # 系统事件
├── base.ts            # 基础事件定义
└── index.ts           # 统一导出
```

## 基础事件定义

### 事件基类
```typescript
interface BaseEvent {
  readonly id: string;              // 事件唯一标识
  readonly type: string;            // 事件类型
  readonly timestamp: number;       // 事件时间戳
  readonly source: string;          // 事件来源模块
  readonly version: number;         // 事件版本
  readonly correlationId?: string;  // 关联ID
  readonly causationId?: string;    // 因果ID
}

interface DomainEvent extends BaseEvent {
  readonly aggregateId: string;     // 聚合根ID
  readonly aggregateType: string;   // 聚合根类型
  readonly aggregateVersion: number; // 聚合版本
}

interface SystemEvent extends BaseEvent {
  readonly severity: 'info' | 'warning' | 'error' | 'critical';
  readonly category: string;        // 事件分类
}
```

## 追踪事件定义

### 会话事件
```typescript
// 访问会话开始
interface VisitSessionStarted extends DomainEvent {
  type: 'tracking.visit.started';
  data: {
    visitId: string;
    tabId: number;
    url: string;
    hostname: string;
    parentDomain: string;
    startTime: number;
  };
}

// 访问会话结束
interface VisitSessionEnded extends DomainEvent {
  type: 'tracking.visit.ended';
  data: {
    visitId: string;
    tabId: number;
    url: string;
    endTime: number;
    duration: number;              // 总持续时间（秒）
    reason: 'tab_closed' | 'navigation' | 'focus_lost' | 'manual';
  };
}

// 活动会话开始
interface ActivitySessionStarted extends DomainEvent {
  type: 'tracking.activity.started';
  data: {
    activityId: string;
    visitId: string;              // 关联的访问会话
    tabId: number;
    url: string;
    startTime: number;
    interactionType: 'click' | 'scroll' | 'keyboard' | 'focus';
  };
}

// 活动会话结束
interface ActivitySessionEnded extends DomainEvent {
  type: 'tracking.activity.ended';
  data: {
    activityId: string;
    visitId: string;
    tabId: number;
    url: string;
    endTime: number;
    duration: number;              // 活跃持续时间（秒）
    reason: 'inactivity' | 'tab_switch' | 'navigation' | 'manual';
  };
}
```

### 检查点事件
```typescript
// 长期会话检查点
interface SessionCheckpoint extends DomainEvent {
  type: 'tracking.checkpoint.created';
  data: {
    checkpointId: string;
    sessionId: string;             // visitId 或 activityId
    sessionType: 'visit' | 'activity';
    tabId: number;
    url: string;
    timestamp: number;
    cumulativeDuration: number;    // 累积时长
    reason: 'periodic' | 'manual' | 'before_cleanup';
  };
}
```

## 同步事件定义

### 配置同步事件
```typescript
// 配置更新事件
interface ConfigurationUpdated extends DomainEvent {
  type: 'sync.config.updated';
  data: {
    configId: string;
    deviceId: string;
    changes: Array<{
      field: string;
      oldValue: any;
      newValue: any;
    }>;
    updateTime: number;
    source: 'local' | 'remote';
  };
}

// 同步冲突检测
interface SyncConflictDetected extends DomainEvent {
  type: 'sync.conflict.detected';
  data: {
    configId: string;
    localVersion: {
      deviceId: string;
      lastModified: number;
      data: any;
    };
    remoteVersion: {
      deviceId: string;
      lastModified: number;
      data: any;
    };
    conflictFields: string[];
  };
}

// 冲突解决完成
interface SyncConflictResolved extends DomainEvent {
  type: 'sync.conflict.resolved';
  data: {
    configId: string;
    resolution: 'local_wins' | 'remote_wins' | 'merged';
    winningVersion: {
      deviceId: string;
      lastModified: number;
    };
    resolvedAt: number;
  };
}
```

## 生命周期事件定义

### 数据保留事件
```typescript
// 保留策略变更
interface RetentionPolicyChanged extends DomainEvent {
  type: 'lifecycle.retention.policy_changed';
  data: {
    configId: string;
    oldPolicy: string;
    newPolicy: string;
    changeTime: number;
    requiresCleanup: boolean;
    estimatedAffectedRecords: number;
  };
}

// 数据清理开始
interface DataCleanupStarted extends DomainEvent {
  type: 'lifecycle.cleanup.started';
  data: {
    cleanupId: string;
    policy: string;
    targetDateRange: {
      startDate: string;
      endDate: string;
    };
    estimatedRecords: number;
    startTime: number;
  };
}

// 数据清理完成
interface DataCleanupCompleted extends DomainEvent {
  type: 'lifecycle.cleanup.completed';
  data: {
    cleanupId: string;
    policy: string;
    actualDeletedRecords: number;
    duration: number;              // 清理耗时（毫秒）
    completedAt: number;
    errors?: Array<{
      type: string;
      message: string;
      count: number;
    }>;
  };
}
```

## 系统事件定义

### 应用生命周期事件
```typescript
// 应用启动
interface ApplicationStarted extends SystemEvent {
  type: 'system.app.started';
  severity: 'info';
  category: 'lifecycle';
  data: {
    version: string;
    startTime: number;
    recoveryMode: boolean;
    orphanSessionsFound: number;
  };
}

// 应用关闭
interface ApplicationStopping extends SystemEvent {
  type: 'system.app.stopping';
  severity: 'info';
  category: 'lifecycle';
  data: {
    stopTime: number;
    activeSessions: number;
    reason: 'normal' | 'crash' | 'update';
  };
}

// 错误事件
interface ErrorOccurred extends SystemEvent {
  type: 'system.error.occurred';
  severity: 'error' | 'critical';
  category: 'error';
  data: {
    errorType: string;
    errorMessage: string;
    stackTrace?: string;
    context: Record<string, any>;
    recoverable: boolean;
  };
}
```

### 存储事件
```typescript
// 存储配额警告
interface StorageQuotaWarning extends SystemEvent {
  type: 'system.storage.quota_warning';
  severity: 'warning';
  category: 'storage';
  data: {
    usedBytes: number;
    totalBytes: number;
    usagePercentage: number;
    estimatedDaysRemaining: number;
  };
}

// 存储配额超限
interface StorageQuotaExceeded extends SystemEvent {
  type: 'system.storage.quota_exceeded';
  severity: 'critical';
  category: 'storage';
  data: {
    usedBytes: number;
    totalBytes: number;
    failedOperation: string;
    autoCleanupTriggered: boolean;
  };
}
```

## 事件工厂

### 事件创建工厂
```typescript
class EventFactory {
  static createVisitSessionStarted(
    visitId: string,
    tabId: number,
    url: string
  ): VisitSessionStarted {
    return {
      id: generateEventId(),
      type: 'tracking.visit.started',
      timestamp: Date.now(),
      source: 'core.tracking',
      version: 1,
      aggregateId: visitId,
      aggregateType: 'VisitSession',
      aggregateVersion: 1,
      data: {
        visitId,
        tabId,
        url,
        hostname: extractHostname(url),
        parentDomain: extractParentDomain(url),
        startTime: Date.now()
      }
    };
  }
  
  // 其他事件创建方法...
}
```

## 事件序列化

### JSON序列化支持
```typescript
interface SerializableEvent {
  toJSON(): Record<string, any>;
  static fromJSON(data: Record<string, any>): SerializableEvent;
}

// 事件序列化工具
class EventSerializer {
  static serialize(event: BaseEvent): string {
    return JSON.stringify(event);
  }
  
  static deserialize(data: string): BaseEvent {
    const parsed = JSON.parse(data);
    return this.createEventFromType(parsed.type, parsed);
  }
  
  private static createEventFromType(type: string, data: any): BaseEvent {
    // 根据事件类型创建相应的事件对象
    switch (type) {
      case 'tracking.visit.started':
        return data as VisitSessionStarted;
      // 其他事件类型...
      default:
        throw new Error(`Unknown event type: ${type}`);
    }
  }
}
```

## 与其他模块的关系
- **生产者**：core/（业务逻辑产生领域事件）、services/（技术服务产生系统事件）
- **消费者**：services/event-bus/（事件分发）、entrypoints/（UI更新）
- **依赖**：models/value-objects/（事件数据中的值对象）
