好的。已切换至 **DOCUMENTATION Mode**。

我将根据上一轮关于自动化 `lastupdated` 字段的讨论结论，对技术计划文档进行最终修订。这次迭代将引入一个架构上的改进，以增强系统的健壮性和可维护性。

---

### 更新摘要

本次修订旨在优化数据管理策略，通过将关键元数据的更新责任从应用层转移到数据库层，以提升数据一致性和开发效率。

1.  **`lastupdated` 字段更新已自动化**:
    *   **变更**: 移除了在应用层手动更新 `aggregatedstats.lastupdated` 字段的要求。取而代之的是，在数据库初始化阶段，将通过实现 Dexie.js 的 `creating` 和 `updating` 钩子 (Hooks) 来自动管理该字段的时间戳。
    *   **理由**: 此变更遵循了“关注点分离 (SoC)”和“不要重复自己 (DRY)”的软件工程原则。它将数据库元数据的管理逻辑封装在数据库层，从根本上杜绝了因应用层代码疏忽而导致数据不一致的风险。这不仅使业务逻辑代码更简洁，也确保了所有数据更新操作的一致性和可靠性。

---

## 修订后的文档

# Core Logic task plan - indexedDB - v0.5

## Scope
**Include**:
*   `indexedDB` 数据库的底层实现，使用 `Dexie.js`。
*   数据库表 (`Object Stores`) 的设计与创建，包括 `eventslog` 和 `aggregatedstats`。
*   使用 `zod` 进行数据写入前的类型验证。
*   为上层模块（如时间追踪、数据聚合）提供统一、稳定的数据访问接口。

**Exclude**:
*   用户配置（`User Configuration`）的读取与管理逻辑。
*   时间追踪（`Time Tracking`）的事件生成逻辑。
*   数据聚合（`Data Aggregation`）与清理（`Pruning`）的具体业务逻辑。
*   任何 UI/UX 相关的功能。

## overview

`indexedDB` 模块是整个扩展的数据基石，负责持久化存储所有核心数据。此计划将专注于以下三个核心领域：
*   **表设计**: 定义 `eventslog` 和 `aggregatedstats` 两个表，包括所有字段、主键及索引。关键元数据（如 `lastupdated`）将由数据库层自动管理。
*   **类型验证**: 为两个表的数据模型建立严格的 `zod` 验证 schema，确保数据入口的完整性和一致性。
*   **对外方法接口**: 封装一个独立的服务层，暴露简单、明确的异步方法（如 `addEvent`, `upsertStat`），供其他业务模块调用，隐藏 `Dexie` 的实现细节。

## tasks

### 阶段1：数据库基础架构与初始化
这个阶段的目标是建立一个可用的、具备自动化能力的数据库实例，并定义好所有的数据结构。

- [ ] **1. 创建数据库连接与模式 (Schema) 管理**
  - [ ] 实现 `Dexie` 数据库的初始化和连接管理。
  - [ ] 定义 `eventslog` 表的 schema，包含 `id`, `timestamp`, `eventType`, `url`, `tabId`, `visitId`, `activityId`, `isProcessed`, `resolution` 等字段。
  - [ ] 为 `eventslog` 表创建索引：`isProcessedidx`, `visitIdidx`, `activityIdidx`。
  - [ ] 定义 `aggregatedstats` 表的 schema，并将其主键设置为复合主键 `[date+hostname+pathname]`。字段包括 `date`, `hostname`, `pathname`, `parentDomain`, `totalopentime`, `totalactivetime`, `lastupdated`。
  - [ ] 为 `aggregatedstats` 表创建额外索引：`dateidx`, `hostnameidx`, `parentDomainidx`。
  - [ ] 为 `aggregatedstats` 表实现`creating` 和 `updating` 钩子(Dexie Hooks)，以自动管理 `lastupdated` 字段。
  - [ ] 实现数据库版本管理与升级逻辑（利用 `Dexie` 的 `version()` 功能）。
  - [ ] 提供一个基础的健康检查方法，用于验证数据库连接是否正常。

### 阶段2：数据模型与验证层
在能够写入数据之前，必须先定义数据的形态并建立验证机制，确保数据的可靠性

- [ ] **1. 定义 TypeScript 数据接口**
  - [ ] 为 `eventslog` 表创建 `DomainEvent` 接口，确保包含所有字段
  - [ ] 为 `aggregatedstats` 表创建 `AggregatedStat` 接口，确保包含所有字段

- [ ] **2. 实现 Zod 验证 Schema**
  - [ ] 为 `DomainEvent` 接口创建对应的 `zod` schema，用于运行时数据验证
  - [ ] 为 `AggregatedStat` 接口创建对应的 `zod` schema，用于运行时数据验证

### 阶段3：数据访问接口层 (CRUD)
此阶段将基于已建立的数据库和数据模型，开发具体的增、删、改、查（CRUD）方法。这些方法将是模块对外的核心 API

- [ ] **1. 实现 `eventslog` 表的数据访问接口**
  - [ ] 创建 `addEvent(event: DomainEvent)` 方法，内部包含 Zod 验证逻辑
  - [ ] 创建 `getUnprocessedEvents()` 方法，用于获取所有 `isProcessed` 为 `0` 的事件，供数据聚合器使用
  - [ ] 创建 `markEventsAsProcessed(eventIds: number[])` 方法，用于批量更新事件状态
  - [ ] 创建 `deleteEventsByIds(eventIds: number[])` 方法，供数据清理模块调用

- [ ] **2. 实现 `aggregatedstats` 表的数据访问接口**
  - [ ] 创建插入/更新方法 `upsertStat(stat: AggregatedStat)`
  - [ ] 创建查询方法 `getStatsByDateRange(startDate: string, endDate: string)`
  - [ ] 创建查询方法 `getStatsByHostname(hostname: string)`
  - [ ] 创建查询方法 `getStatsByPath(hostname: string, pathname: string)`

### 阶段4：封装与错误处理
最后一步是整合所有功能，封装成一个易于使用的服务，并添加健壮的错误处理机制。

- [ ] **1. 封装统一的数据库服务**
  - [ ] 创建一个 `DatabaseService` 单例或类
  - [ ] 将阶段 3 中所有的 CRUD 方法整合到该服务中，作为其公共方法
  - [ ] 确保 `Dexie` 实例和内部实现对外部模块不可见，只暴露服务接口

- [ ] **2. 实现错误处理逻辑**
  - [ ] 处理数据写入和读取操作中错误
  - [ ] 处理 `QuotaExceededError` 等存储空间不足的错误，并提供日志或通知机制
  - [ ] 处理 Zod 验证失败的错误，阻止无效数据写入并记录错误