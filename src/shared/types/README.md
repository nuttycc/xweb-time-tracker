# Types 通用类型定义

## 模块职责
本模块负责定义应用中所有模块共享的、通用的 TypeScript 类型、接口和枚举。它为整个应用程序提供一个统一的基础类型系统，增强代码的类型安全性和可维护性。这些类型不包含具体的业务逻辑实现。

## 功能范围
-   ✅ **包含内容**:
    *   通用的数据结构接口 (e.g., `PaginatedResponse<T>`, `ServiceStatus`)。
    *   广泛使用的类型别名 (e.g., `UserID`, `IsoDateTimeString`)。
    *   应用级别共享的枚举定义 (e.g., `SortOrder`, `LogLevel`)。
    *   可复用的泛型工具类型。
-   ❌ **不包含内容**:
    *   特定领域模型的核心定义（这些属于 `models/` 层，尽管 `shared/types` 可能被它们引用或引用它们的基础部分）。
    *   任何具体的类实现或业务逻辑。
    *   数据操作或 API 调用。

## 文件说明 (示例结构)

### `index.ts`
通常作为桶式导出文件，统一导出本目录下定义的所有主要类型。然而，为了更好的 Tree Shaking 和避免潜在的循环依赖，推荐直接从定义类型的具体文件导入。

### `query-types.ts` (或 `query.ts`)
定义与数据查询、过滤、排序和分页相关的通用类型，例如查询参数接口、查询结果包装类型等。

### `storage-types.ts` (或 `storage.ts`)
定义与数据存储操作相关的通用类型，例如存储配置接口、存储操作结果类型等。

### `tracking-types.ts` (或 `tracking.ts`)
定义与时间追踪功能相关的、可能在多个模块间共享的基础类型，例如通用的会话信息片段、追踪状态枚举等。

### `common-types.ts` (或 `global-types.ts`)
存放一些无法明确归类到特定功能域，但在整个应用中都可能用到的基础类型或工具类型。

## 类型组织原则
1.  **按功能域或上下文分组**: 将相关的类型定义组织在同一个文件内，方便查找和管理 (e.g., 所有与API请求/响应相关的通用类型可能放在 `api-common-types.ts`)。
2.  **接口优于类型别名 (对于对象形状)**: 当定义对象的结构时，优先使用 `interface`，因为它更易于扩展 (declaration merging) 和实现 (implements)。类型别名 (`type`) 更适用于定义联合类型、交叉类型或基本类型的别名。
3.  **泛型支持**: 在适用的情况下，提供灵活的泛型类型定义，以增强类型的复用性 (e.g., `type ApiResponse<TData> = { data: TData; error?: ApiError; }`)。
4.  **严格与精确**: 尽可能避免使用 `any` 或过于宽泛的类型。提供精确的类型定义，以充分利用 TypeScript 的静态检查能力。
5.  **文档注释**: 对重要的导出类型、接口及其属性提供清晰的 TSDoc 注释。

## 使用方式 (示例)
```typescript
// 推荐：直接从定义类型的具体文件导入
import type { QueryParams, PaginatedResult } from '@/shared/types/query-types';
import type { StorageOperationConfig } from '@/shared/types/storage-types';

// function fetchData(params: QueryParams): Promise<PaginatedResult<MyDataType>> {
//   // ...
// }
```

## 与其他模块的关系
-   **被依赖**:
    -   应用中的几乎所有模块（`core/`, `services/`, `models/`, `entrypoints/`）都会依赖此目录中定义的通用类型。
-   **扩展与被扩展**:
    -   `models/` 层中定义的具体领域模型（实体、值对象、事件）是更专门化的类型，它们可能会使用 `shared/types` 中定义的基础类型，或者 `shared/types` 中的某些类型可能是对 `models/` 中类型的泛化或抽象。
    -   本目录不应依赖 `core/` 或 `services/`。
