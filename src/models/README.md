# Models 数据模型层

## 模块职责
Models 层负责定义应用中所有核心的数据结构，包括实体（Entities）、值对象（Value Objects）、领域事件（Domain Events）以及数据模式（Schemas）。它为整个应用程序提供统一且一致的数据类型定义。

## 功能边界
- ✅ **包含内容**：数据结构的 TypeScript 定义（接口、类、枚举）、类型别名、领域模型的核心属性和不变性约束。
- ❌ **不包含内容**：具体的业务逻辑实现、数据持久化操作、API 调用逻辑、UI 组件。

## 子目录说明

### `entities/` - 实体模型
定义应用领域中的核心业务对象，这些对象具有唯一的身份标识（ID）和生命周期。例如：`TimeRecord`（时间记录）、`UserConfig`（用户配置）。

### `value-objects/` - 值对象
定义不可变的、通过其属性值来衡量相等性的对象。它们通常没有唯一标识，但封装了业务上有意义的概念。例如：`TimeSpan`（时间跨度）、`URLObject`（规范化的URL）。

### `events/` - 事件模型
定义系统中发生的具有业务意义的事件。这包括用户行为触发的领域事件、系统内部状态变更事件等。例如：`VisitSessionStartedEvent`、`ConfigurationUpdatedEvent`。

### `schemas/` - 数据模式定义
定义结构化数据的模式，如数据库表结构、API 请求/响应体结构、配置文件格式等。这些模式有助于数据验证和确保数据交换的一致性。

## 设计原则
1.  **类型安全 (Type Safety)**：充分利用 TypeScript 的强类型系统，提供精确和严格的类型定义，以在编译时捕获错误。
2.  **不可变性 (Immutability)**：优先设计不可变的数据结构，特别是对于值对象和事件。实体状态的变更应通过明确定义的方法进行，并产生新的状态或事件。
3.  **领域驱动 (Domain-Driven)**：模型的设计应直接反映业务领域的概念、术语和规则，而非底层技术实现细节。
4.  **接口隔离 (Interface Segregation)**：针对不同模块或上下文的需求，通过接口定义其所需的数据视图，避免不必要的耦合。

## 模型主要分类概览

-   **实体 (Entities)**：具有唯一标识的业务核心对象。
    *   例如: `TimeRecord`, `UserConfiguration`, `TrackingSession`
-   **值对象 (Value Objects)**：基于属性值定义相等性的不可变对象。
    *   例如: `TimeSpan`, `NormalizedURL`, `RetentionPolicySetting`
-   **事件 (Events)**：表示系统中发生的有意义的事件。
    *   例如: `TrackingEvent`, `SyncEvent`, `LifecycleEvent`
-   **模式 (Schemas)**：用于数据验证和结构定义的蓝图。
    *   例如: `DatabaseSchema`, `APISchema`, `ConfigurationSchema`

## 与其他模块的关系
-   **依赖**：
    -   `shared/types/`: 可能依赖共享的基础类型定义。
-   **被依赖**：
    -   `core/`: 业务核心层使用这些模型进行逻辑处理。
    -   `services/`: 技术服务层使用这些模型进行数据操作和外部交互。
    -   `entrypoints/`: 应用入口点可能使用这些模型进行数据展示或传递。

## 命名约定 (建议)
-   **实体类/接口**：名词，帕斯卡命名法 (PascalCase)，如 `TimeRecord`。
-   **值对象类/接口**：名词，帕斯卡命名法，如 `TimeSpan`。
-   **事件类/接口**：通常以 `Event` 结尾，或描述事件动作，帕斯卡命名法，如 `SessionStartedEvent`。
-   **TypeScript 接口**：通常以 `I` 为前缀（如 `ITimeRecord`）或不加前缀直接使用帕斯卡命名（如 `TimeRecord`，如果与类名不冲突且上下文清晰）。项目中应保持一致。
-   **类型别名 (Type Aliases)**：帕斯卡命名法，可使用 `Type` 后缀，如 `TrackingActivityType`。
-   **枚举 (Enums)**：帕斯卡命名法，如 `SessionStatus`。
