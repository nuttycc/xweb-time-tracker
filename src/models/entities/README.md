# Entities 实体模型

## 模块职责
本目录定义应用中的核心实体（Entities）。实体是具有唯一标识符（ID）的领域对象，它们代表了业务中的关键概念，并拥有自己的生命周期和状态。

## 实体特征
-   **唯一标识 (Identity)**：每个实体实例都可以通过其唯一的 ID 进行区分。
-   **生命周期 (Lifecycle)**：实体有明确的创建、更新和（逻辑上的）删除过程。
-   **状态与行为 (State & Behavior)**：实体的状态可以随时间变化，并且实体封装了与其状态相关的核心行为和业务规则。
-   **业务含义 (Business Significance)**：实体直接映射到业务领域中的重要概念。

## 文件结构
```typescript
entities/
├── README.md         // 本文档
├── TimeRecord.ts     // 时间记录实体
├── UserConfig.ts     // 用户配置实体
├── TrackingSession.ts// 追踪会话实体 (原 Session.ts)
├── DomainEventLog.ts // 领域事件日志实体 (若 DomainEvent 本身作为一种记录实体)
└── index.ts          // 统一导出模块内容
```

## 核心实体定义 (示例接口)

### `TimeRecord` - 时间记录实体
代表用户在特定 URL 上的聚合时间使用记录。
```typescript
interface ITimeRecord {
  id: string;
  date: string; // YYYY-MM-DD
  url: string;
  hostname: string;
  parentDomain: string;
  totalOpenTimeInSeconds: number;
  totalActiveTimeInSeconds: number;
  lastUpdatedAt: Date;
  createdAt: Date;
}
// Core Business Rule: totalActiveTimeInSeconds <= totalOpenTimeInSeconds
```

### `UserConfig` - 用户配置实体
代表用户的个性化偏好设置和应用配置信息。
```typescript
interface IUserConfig {
  id: string; // Usually a fixed ID, e.g., 'currentUserConfig'
  version: string;
  deviceId: string;
  retentionPolicyId: string; // References a RetentionPolicy Value Object or ID
  uiTheme: string; // e.g., 'dark', 'light'
  filterRules: any[]; // Define a specific type if possible
  displayPreferences: any; // Define a specific type
  modifiedAt: Date;
  lastSyncAt?: Date;
  createdAt: Date;
}
// Core Business Rule: Configuration changes update 'modifiedAt'.
```

### `TrackingSession` - 追踪会话实体
代表用户的单次浏览会话（访问或活动片段）。
```typescript
interface ITrackingSession {
  id: string; // visitId or activitySegmentId
  type: 'visit' | 'activity';
  tabId: number;
  urlAtStart: string;
  startedAt: Date;
  endedAt?: Date;
  durationInSeconds?: number;
  isActive: boolean;
  checkpoints?: { timestamp: Date; cumulativeDuration: number }[];
  createdAt: Date;
}
// Core Business Rule: An activity session is typically part of a visit session.
```

### `DomainEventLog` - 领域事件日志实体 (如果事件本身被持久化为实体)
代表系统中发生并被记录下来的重要业务事件。
```typescript
interface IDomainEventLog {
  id: string; // Event's unique ID
  type: string; // e.g., 'user.loggedin', 'timerecord.created'
  aggregateId: string; // ID of the aggregate root this event relates to
  aggregateType: string; // Type of the aggregate root
  payload: Record<string, any>; // Event-specific data
  metadata: {
    timestamp: Date;
    source: string; // Module or service that emitted the event
    correlationId?: string;
    causationId?: string;
  };
  version: number; // Event version for schema evolution
}
// Core Business Rule: Events are immutable once created.
```

## 实体设计说明
-   **工厂模式 (Factories)**：推荐使用工厂方法或构造函数来创建实体实例，确保实体在创建时处于有效状态并满足其不变量。
-   **封装行为 (Encapsulated Behavior)**：实体应封装直接操作其状态的核心业务逻辑。例如，`TimeRecord` 可能有 `addActiveTime(duration)` 方法。
-   详细的业务规则、工厂实现和方法设计应参考各自的 `.ts` 文件。

## 与其他模块的关系
-   **被使用于**：
    -   `core/`: 业务逻辑层操作和编排实体。
    -   `services/database/ (Repositories)`: 数据仓库负责实体的持久化和检索。
-   **可能依赖**：
    -   `models/value-objects/`: 实体可能包含值对象作为其属性。
    -   `shared/types/`: 基础或通用的类型定义。
    -   `shared/utils/`: 例如用于ID生成或日期处理的工具。
