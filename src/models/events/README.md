# Events 事件模型

## 模块职责
本目录定义了应用中所有类型的事件。这些事件是系统中发生的重要事情的记录，用于驱动业务逻辑、模块间通信和状态变更，是事件驱动架构的基础。

## 事件分类
-   **领域事件 (Domain Events)**：反映业务领域中发生的、具有重要意义的状态变化。通常由核心业务操作触发。
-   **系统事件 (System Events)**：反映应用系统级别的状态变化或重要通知，如应用启动、关闭、发生严重错误、存储警告等。
-   **集成事件 (Integration Events)**：(如果适用) 用于跨模块或跨服务边界进行通信的事件，旨在促进松耦合。

## 文件结构
```typescript
events/
├── README.md         // 本文档
├── base-event.ts     // 基础事件接口定义 (原 base.ts)
├── tracking-events.ts// 追踪相关的领域事件 (原 tracking.ts)
├── sync-events.ts    // 配置同步相关的领域事件 (原 sync.ts)
├── lifecycle-events.ts// 数据生命周期相关的领域事件 (原 lifecycle.ts)
├── system-events.ts  // 系统级事件 (原 system.ts)
└── index.ts          // 统一导出所有事件类型和相关接口
```

## 基础事件定义
所有事件共享一些通用属性，定义在基础接口中：
```typescript
interface IBaseEvent {
  readonly id: string;          // Unique identifier for the event instance
  readonly type: string;        // Specific type of the event (e.g., "tracking.visit.started")
  readonly timestamp: number;   // When the event occurred (Unix ms)
  readonly source: string;      // Module or component that emitted the event
  readonly version: number;     // Version of the event schema
  readonly correlationId?: string; // For tracking related events
  readonly causationId?: string;   // ID of the command or event that caused this event
}

interface IDomainEvent extends IBaseEvent {
  readonly aggregateId: string;   // ID of the aggregate root this event pertains to
  readonly aggregateType: string; // Type of the aggregate root
  // readonly aggregateVersion?: number; // Version of the aggregate after this event
}

interface ISystemEvent extends IBaseEvent {
  readonly severity: 'info' | 'warning' | 'error' | 'critical';
  readonly category: string;      // Broad category (e.g., 'lifecycle', 'storage', 'error')
}
```

## 主要事件类型示例

### 追踪事件 (Tracking Events)
由 `core/tracking` 模块产生，记录用户与网页的交互。
-   **示例事件类型**: `tracking.visit.started`, `tracking.visit.ended`, `tracking.activity.started`, `tracking.activity.ended`, `tracking.checkpoint.created`
-   **典型数据 (payload)**: 包含会话ID (`visitId`, `activityId`), `tabId`, `url`, 时间戳, 持续时间, 交互类型等。

### 同步事件 (Sync Events)
由 `core/sync` 模块产生或处理，与用户配置的跨设备同步相关。
-   **示例事件类型**: `sync.config.updated`, `sync.conflict.detected`, `sync.conflict.resolved`
-   **典型数据**: 包含配置ID, 设备ID, 变更详情 (字段, 旧值, 新值), 同步状态等。

### 生命周期事件 (Lifecycle Events)
由 `core/lifecycle` 模块产生，与数据的保留和清理相关。
-   **示例事件类型**: `lifecycle.retention.policy_changed`, `lifecycle.cleanup.started`, `lifecycle.cleanup.completed`
-   **典型数据**: 包含策略详情, 清理任务ID, 受影响记录数, 清理结果等。

### 系统事件 (System Events)
由应用各部分（特别是 `services` 或主控制逻辑）产生，反映系统级状态。
-   **示例事件类型**: `system.app.started`, `system.app.stopping`, `system.error.occurred`, `system.storage.quota_warning`
-   **典型数据**: 包含应用版本, 错误详情, 存储使用情况等。

## 设计与使用说明
-   **不变性**: 事件一旦创建，其内容不应被修改。
-   **数据载体**: 事件应携带足够的数据，使消费者无需额外查询即可处理该事件。
-   **命名**: 事件类型字符串通常采用 `domain.context.verb_tense` (e.g., `tracking.session.started`) 的形式。
-   **工厂与序列化**: 具体事件的创建通常通过工厂函数完成。事件可能需要支持序列化（如转为JSON）以便在不同上下文（如Web Workers, Background Script, UI）之间传递或进行持久化。详细实现请参考各事件定义文件及其辅助工具。

## 与其他模块的关系
-   **生产者 (Emitters)**:
    -   `core/*`: 各核心业务模块（tracking, sync, lifecycle）是主要的领域事件生产者。
    -   `services/*`: 技术服务（如数据库、Chrome API 封装）可能产生系统事件。
-   **消费者 (Consumers/Handlers)**:
    -   `services/event-bus/`: 负责事件的分发和路由。
    -   其他 `core/` 模块或 `services/` 模块可能订阅并响应特定事件。
    -   `entrypoints/*`: UI 层可能订阅事件以更新用户界面。
-   **依赖**:
    -   `models/value-objects/`: 事件的 `data` 或 `payload` 字段中可能包含值对象。
    -   `shared/types/`: 基础类型定义。
