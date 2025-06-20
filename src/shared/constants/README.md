# Constants 常量定义

## 模块职责
本模块负责定义和管理应用中使用的所有常量值。这包括固定的配置参数、事件名称、存储键、枚举状的值、以及用来替代“魔法数字”或“魔法字符串”的具名常量，旨在为整个应用程序提供统一、易于维护的常量来源。

## 功能范围
-   ✅ **包含内容**:
    *   应用范围内的常量值定义 (如 `API_BASE_URL`, `MAX_RETRIES`)。
    *   伪枚举定义（如果 TypeScript 的 `enum` 不适用或不希望使用）。
    *   默认配置中不应硬编码的关键参数（如 `DEFAULT_CACHE_TTL`）。
    *   用于避免魔法数字/字符串的具名常量。
-   ❌ **不包含内容**:
    *   用户可配置的设置（这些属于 `shared/config`）。
    *   运行时动态计算的值。
    *   复杂的业务逻辑。

## 文件说明 (示例结构)

### `index.ts`
通常作为桶式导出文件，统一导出本目录下定义的所有常量，方便其他模块导入。但更推荐直接从具体文件导入。

### `app-constants.ts` (或 `config-constants.ts`)
定义与应用整体配置或行为相关的常量，例如默认超时时间、API 版本、批处理大小等。

### `event-constants.ts` (或 `events.ts`)
定义事件相关的常量，主要是标准化的事件类型字符串/名称。

### `filter-constants.ts` (或 `filters.ts`)
定义与数据过滤相关的常量，如默认的过滤规则键名、排除列表的标识等。

### `storage-constants.ts` (或 `storage.ts`)
定义与数据存储相关的常量，例如数据库名称、对象存储（表）的名称、索引名称、本地存储的键名等。

## 命名规范
-   **常量名称**: 通常使用全大写蛇形命名法 (UPPER_SNAKE_CASE)，例如 `DEFAULT_TIMEOUT_MS`, `MAX_LOGIN_ATTEMPTS`。
-   **伪枚举对象/值**: 如果使用对象模拟枚举，对象名可以是帕斯卡命名法 (PascalCase)，其属性（枚举值）可以是全大写或根据约定。
    ```typescript
    // export const UserStatus = {
    //   ACTIVE: 'ACTIVE',
    //   INACTIVE: 'INACTIVE',
    //   PENDING: 'PENDING',
    // } as const;
    ```
-   **分组与前缀**: 相关的常量可以使用统一的前缀进行分组，以提高可读性和避免命名冲突，例如 `DB_NAME`, `DB_VERSION`。

## 使用方式 (示例)
```typescript
// 推荐：直接从定义常量的具体文件导入
import { DEFAULT_API_TIMEOUT } from '@/shared/constants/app-constants';
import { StorageKeys } from '@/shared/constants/storage-constants'; // 假设 StorageKeys 是一个包含多个键的对象

// 使用常量
// if (elapsedTime > DEFAULT_API_TIMEOUT) { /* ... */ }
// localStorage.setItem(StorageKeys.USER_PREFERENCES, userPrefsJson);
```

## 与其他模块的关系
-   **被依赖**:
    -   应用中的几乎所有模块（`core/`, `services/`, `models/`, `entrypoints/`）都可能需要使用这些全局常量。
-   **依赖**:
    -   无。作为应用的基础常量层，本模块不应依赖其他应用模块。
