# Database 数据库服务

## 模块职责
本模块负责封装对 IndexedDB（或其他选定的持久化存储机制）的所有操作。它为应用程序提供一个统一、类型安全的数据访问层（通常通过 Repository 模式实现），并集中处理数据库连接管理、事务控制、数据迁移和底层错误处理。

## 功能范围
-   **核心功能**:
    *   **数据库连接管理**: 创建、维护和关闭与 IndexedDB 的连接。
    *   **事务管理**: 提供统一的读写事务控制，确保数据操作的原子性和一致性。
    *   **数据操作封装 (CRUD)**: 为应用中定义的实体（如 `TimeRecord`, `UserConfig`）提供类型安全的创建、读取、更新和删除操作。
    *   **数据库迁移**: 处理数据库版本升级时的模式 (schema) 变更和数据迁移逻辑。
-   **主要数据存储**:
    *   **原始事件日志 (`events_log`)**: 存储由追踪模块产生的原始时间追踪事件。
    *   **聚合统计数据 (`aggregated_stats`)**: 存储经过分析模块处理和聚合后的统计信息。
    *   **索引管理**: 为上述存储创建和维护必要的索引，以优化查询性能。

## 文件结构
```typescript
database/
├── README.md           // 本文档
├── db-manager.ts       // 数据库连接和版本管理 (可能包含原 indexeddb.ts 的部分功能)
├── db-schemas.ts       // 数据库模式定义 (参考 models/schemas/database-schema.ts) (原 schemas.ts)
├── db-migrations.ts    // 数据库版本迁移逻辑 (原 migrations.ts)
├── transaction-manager.ts// 事务管理封装 (原 transactions.ts)
└── repositories/       // 包含各个实体的数据仓库实现 (原 repositories.ts 可能是一个目录)
    ├── EventLogRepository.ts
    └── AggregatedStatsRepository.ts
└── index.ts            // 统一导出服务接口和实现
```

## 数据库设计概述
-   **数据库名称**: `webtime_tracker` (示例)
-   **存储引擎**: IndexedDB
-   **核心数据存储 (Object Stores / Tables)**:
    *   `events_log`: 存储原始追踪事件，包含时间戳、事件类型、URL、会话ID等字段。关键索引可能包括 `timestamp`, `eventType`, `isProcessed`。
    *   `aggregated_stats`: 存储每日聚合的时间统计数据，按日期和URL（或其组成部分）进行聚合。关键索引可能包括 `date`, `hostname`, `parentDomain`。
    *   其他可能的存储：用户配置、应用状态等。
-   详细的表结构和索引定义请参考 `models/schemas/database-schema.ts` 或本模块内的 `db-schemas.ts`。

## 服务接口概述 (Repository Pattern)
本模块通常通过实现数据仓库（Repository）模式为上层提供服务。
-   **事件日志仓库 (`EventLogRepository`)**: 提供针对原始事件日志的插入、批量插入、查询（如查询未处理事件）、更新（如标记为已处理）、按条件删除等操作。
-   **聚合统计仓库 (`AggregatedStatsRepository`)**: 提供针对聚合统计数据的插入/更新 (upsert)、批量操作、以及按日期范围、主机名、父域名等条件的查询服务。

## 关键设计考量

### 错误处理
-   **错误类型**: 定义特定的数据库错误类型，如连接失败、事务失败、配额超限、模式错误、迁移失败等。
-   **处理策略**:
    *   **连接/事务失败**: 实现有限次数的重试机制；对于关键写操作，确保事务回滚。
    *   **配额超限**: 通知上层模块（如 `core/lifecycle`）触发数据清理机制。
    *   **迁移失败**: 可能需要阻止应用启动，并提示用户或开发者介入。

### 性能优化
-   **索引策略**: 根据常见查询模式，在关键字段上创建有效的索引。
-   **批量操作**: 提供批量插入、更新和删除的方法，以减少事务开销和提高吞吐量。
-   **查询优化**: 编写高效的查询逻辑，避免全表扫描；对大数据集查询支持分页。
-   **异步处理**: 所有数据库操作均为异步，避免阻塞主线程。

## 与其他模块的关系
-   **服务对象 (被依赖)**:
    -   `core/*`: 核心业务模块通过数据仓库接口与之交互，进行数据的持久化和检索。
-   **依赖**:
    -   `models/entities/`: 使用或操作在模型层定义的实体对象。
    -   `models/schemas/database-schema.ts`: 依赖于此处定义的数据库结构。
    -   `shared/config/`: 可能依赖共享配置中的数据库参数（如名称、版本）。
    -   `shared/utils/`: 可能使用通用的错误处理或日志工具。
