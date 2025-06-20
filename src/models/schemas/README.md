# Schemas 数据模式

## 模块职责
本目录定义了应用中所有结构化数据的模式（Schemas）。这些模式包括数据库表结构、内部API接口的请求/响应格式、配置文件的结构以及数据导入/导出格式等。它们为数据验证、类型检查和模块间的数据交换提供了统一的标准和蓝图。

## 模式分类
-   **数据库模式 (Database Schemas)**：定义应用在 IndexedDB 中使用的各个对象存储（表）的结构、主键和索引。
-   **API 模式 (API Schemas)**：定义应用内部（如 Background Script 与 Popup/Options 页面之间）API 通信时所用消息的请求和响应格式。
-   **配置模式 (Configuration Schemas)**：定义用户可配置项（如 `UserConfiguration`）和应用级内部配置（如 `ApplicationConfig`）的结构和约束。
-   **导入/导出模式 (Import/Export Schemas)**：定义用户数据在进行手动导入或导出操作时所遵循的文件格式和结构。

## 文件结构
```typescript
schemas/
├── README.md            // 本文档
├── database-schema.ts   // 数据库表结构和索引定义 (原 database.ts)
├── api-schema.ts        // API 接口的请求/响应模式定义 (原 api.ts)
├── config-schema.ts     // 各类配置文件的结构定义 (原 config.ts)
├── data-export-schema.ts// 数据导出格式定义 (原 export.ts)
└── index.ts             // 统一导出所有模式定义
```

## 主要模式概览

### 数据库模式 (`database-schema.ts`)
-   定义了核心数据存储结构，例如：
    *   `EventsLogStoreSchema`: 用于存储原始追踪事件，包含字段如 `timestamp`, `eventType`, `tabId`, `url`, `visitId`, `activityId`, `isProcessed` 等，并定义相关索引。
    *   `AggregatedStatsStoreSchema`: 用于存储聚合后的统计数据，包含字段如 `date`, `url`, `hostname`, `parentDomain`, `totalOpenTime`, `totalActiveTime` 等，并定义相关索引。
-   还可能包含数据库本身的配置，如数据库名称、版本号和存储列表。

### API 模式 (`api-schema.ts`)
-   定义了应用内部各组件间通信所用消息的结构，例如：
    *   `TimeStatsQueryRequest`: 时间统计查询的请求参数结构（如日期范围、分组方式、过滤器）。
    *   `TimeStatsQueryResponse`: 时间统计查询的响应数据结构（如统计记录、总数、聚合信息）。
    *   `ConfigUpdateRequest`: 用户配置更新的请求结构。
    *   `ConfigUpdateResponse`: 用户配置更新的响应结构，可能包含同步状态和冲突详情。

### 配置模式 (`config-schema.ts`)
-   定义了不同配置项的结构和预期类型，例如：
    *   `UserConfigurationSchema`: 描述用户可配置的所有选项，如数据保留策略 (`retentionPolicy`)、UI 设置 (`uiSettings`)、过滤规则 (`filterRules`)、显示偏好 (`displayPreferences`) 等。
    *   `ApplicationConfigSchema`: (如果存在) 描述应用内部的、通常不由用户直接修改的配置参数，如追踪参数 (`trackingSettings`)、存储限制 (`storageLimits`)、同步参数 (`syncParameters`) 等。

### 数据导出模式 (`data-export-schema.ts`)
-   定义了数据导出时文件的标准格式，例如：
    *   `StatsExportFileSchema`: 包含元数据（导出版本、日期、范围等）、导出时的用户配置，以及聚合后的统计数据和摘要。
    *   `RawDataExportFileSchema`: (如果支持) 包含元数据和原始事件日志、会话信息等，主要用于调试或高级分析。

## 模式验证与版本管理
-   这些模式定义是进行数据验证的基础。例如，可以使用 JSON Schema、Zod 或其他验证库，根据这些 TypeScript 接口生成验证规则，在数据接收或处理前确保其有效性和一致性。
-   模式定义也应考虑版本管理，尤其是在数据库结构或 API 格式发生变化时，以支持向后兼容和数据迁移。

## 与其他模块的关系
-   **被使用于**:
    -   `services/database/`: 数据库服务根据数据库模式进行表的创建、数据读写和迁移。
    -   `services/validators/`: 验证服务使用这些模式（或基于它们生成的规则）来校验数据的有效性。
    -   `core/` 和 `services/`: 在进行模块间通信或处理配置时，会依赖 API 模式和配置模式。
-   **定义来源**:
    -   模式的设计通常源于 `models/entities/`, `models/events/` 中定义的领域对象和业务需求。
-   **影响**:
    -   模式的变动（尤其是数据库和 API 模式）通常是重大变更，需要仔细规划版本和迁移策略。
