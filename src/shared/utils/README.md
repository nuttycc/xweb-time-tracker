# Utils 通用工具函数

## 模块职责
本模块提供在应用中多个地方可复用的通用工具函数和辅助方法。这些函数旨在封装常用的、与具体业务领域无关的逻辑，如图数据转换、格式化、特定算法实现等，以提高代码复用性和可维护性。

## 功能范围
-   ✅ **包含内容**:
    *   **纯函数 (Pure Functions)**: 大部分工具函数应设计为纯函数，即给定相同输入总是返回相同输出，并且没有副作用。
    *   **数据转换与格式化**: 例如日期/时间格式化、字符串操作、数字处理、URL 解析与构建等。
    *   **验证辅助**: 轻量级的、通用的验证辅助函数（更复杂的、基于模式的验证应在 `services/validators` 中）。
    *   **算法或逻辑片段**: 可复用的通用算法，如防抖 (`debounce`)、节流 (`throttle`)、深拷贝等。
-   ❌ **不包含内容**:
    *   核心业务逻辑或特定领域规则。
    *   依赖特定应用状态的函数。
    *   直接的 DOM 操作或浏览器 API 调用（除非是极通用的封装）。
    *   任何有副作用的、改变全局状态或外部系统状态的操作（除非明确约定并文档化）。

## 文件说明 (示例结构)

### `index.ts`
通常作为桶式导出文件，统一导出本目录下定义的所有主要工具函数。然而，为了更好的 Tree Shaking 和避免潜在的循环依赖，推荐直接从定义函数的具体文件导入。

### `debounce.ts` (或 `function-utils.ts`)
包含如 `debounce` (防抖) 和 `throttle` (节流) 等高阶函数工具。

### `time-utils.ts` (或 `time.ts`)
提供与日期和时间处理相关的工具函数，例如格式化时长、解析日期字符串、计算时间差等。

### `url-utils.ts` (或 `url.ts`)
提供与 URL 处理相关的工具函数，例如解析 URL 参数、构建带查询参数的 URL、规范化 URL 片段等。

### `validation-utils.ts` (或 `validation.ts`)
(如果存在) 提供一些非常通用的、轻量级的数据验证或检查辅助函数，例如检查字符串是否为空、是否为有效数字等。

## 设计原则
1.  **纯粹性与无副作用**: 工具函数应尽可能设计为纯函数，易于测试和预测。
2.  **类型安全**: 所有函数及其参数和返回值都必须有明确的 TypeScript 类型定义。
3.  **性能意识**: 对于可能在性能敏感路径上使用的工具函数，应考虑其性能影响，避免不必要的计算或内存分配。
4.  **易于测试 (Testability)**: 每个工具函数都应易于进行单元测试，覆盖其所有逻辑分支和边界条件。
5.  **单一职责 (Single Responsibility)**: 每个工具函数应聚焦于完成一个明确、单一的任务。
6.  **文档清晰**: 提供清晰的 TSDoc 注释，说明函数的用途、参数、返回值和任何重要的行为或限制。

## 使用方式 (示例)
```typescript
// 推荐：直接从定义函数的具体文件导入
import { formatDuration } from '@/shared/utils/time-utils';
import { debounce } from '@/shared/utils/function-utils';
import { parseUrlParams } from '@/shared/utils/url-utils';

// const formattedTime = formatDuration(3661); // "1h 1m 1s"
// const debouncedSave = debounce(saveUserData, 500);
// const params = parseUrlParams(window.location.search);
```

## 与其他模块的关系
-   **被依赖**:
    -   应用中的几乎所有模块（`core/`, `services/`, `models/`, `entrypoints/`）都可能使用这些通用工具函数。
-   **依赖**:
    -   通常无依赖或仅依赖第三方纯工具库（如 `lodash-es`, `date-fns` 的部分函数）。
    -   不应依赖应用中的其他高层模块（`core/`, `services/` 等）。
