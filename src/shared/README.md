# Shared 共享资源层

## 模块职责
Shared 层是应用的基础设施层，提供所有其他模块（如 `core/`, `services/`, `models/`, `entrypoints/`）共同使用的资源。这包括通用的类型定义、可复用的工具函数、应用范围的常量和配置管理等。

## 功能边界
-   ✅ **包含内容**:
    *   **通用类型定义**: 应用范围内共享的 TypeScript 接口、类型别名和枚举。
    *   **工具函数 (Utilities)**: 纯粹的、无副作用的辅助函数，如日期处理、字符串操作、URL 解析、数据转换等。
    *   **常量定义**: 应用中广泛使用的常量值，如事件名称、存储键名、默认配置值等。
    *   **配置管理**: 提供访问应用默认配置、用户设置或环境变量的机制。
    *   **(可选) 通用组件**: 如果有跨多个入口点复用的纯 UI 组件或逻辑组件，且不适合放在特定业务模块。
-   ❌ **不包含内容**:
    *   核心业务逻辑或特定领域的业务规则。
    *   特定模块的实现细节。
    *   直接的数据库操作或浏览器 API 调用（这些应在 `services/` 层）。

## 子目录说明

### `types/` - 通用类型定义
定义在整个应用中共享的 TypeScript 类型、接口和枚举，为跨模块的类型安全提供基础。

### `utils/` - 工具函数
包含一系列可复用的、纯粹的工具函数，用于执行常见的辅助任务。

### `constants/` - 常量定义
集中管理应用中使用的各种硬编码常量值，提高可维护性和一致性。

### `config/` - 配置管理
负责管理和提供对应用默认配置、用户可配置项以及可能的运行环境变量的访问。

## 设计原则
1.  **无副作用 (Side-Effect Free)**: `utils/` 中的工具函数应尽可能设计为纯函数，不产生外部副作用，易于测试和推理。
2.  **类型安全 (Type Safety)**: 所有导出的成员（类型、函数、常量）都应有明确和严格的 TypeScript 类型定义。
3.  **稳定性与向后兼容 (Stability & Backward Compatibility)**: Shared 层的 API 应保持相对稳定，避免频繁的破坏性变更，因为它们被广泛依赖。
4.  **文档清晰 (Clear Documentation)**: 每个重要的工具函数、类型或常量都应有清晰的 JSDoc 或 TSDoc 文档说明其用途和用法。
5.  **通用性 (Generality)**: 提供的资源应具有足够的通用性，适用于多个模块，而非仅为特定场景服务。

## 依赖关系
-   **依赖**: 通常情况下，Shared 层自身不应依赖应用中的其他高层模块（如 `core/`, `services/`）。它可以依赖外部的、通用的第三方库（如 `date-fns`）。
-   **被依赖**: 应用中的几乎所有其他模块（`core/`, `services/`, `models/`, `entrypoints/`）都会依赖 Shared 层提供的资源。

## 使用规范

### 导入规范
```typescript
// 推荐：使用具体的、深层的导入路径，以利于 Tree Shaking 和避免循环依赖。
import { formatDuration } from '@/shared/utils/time-utils'; // 假设 time.ts 改为 time-utils.ts
import { DEFAULT_APP_CONFIG } from '@/shared/config/app-config'; // 假设 app.ts 改为 app-config.ts

// 避免：从 shared/index.ts 进行大规模的桶式导入 (barrel exports),
// 这可能影响 Tree Shaking 效果、编译速度，并增加循环依赖的风险。
// import { formatDuration, DEFAULT_APP_CONFIG } from '@/shared'; // 应避免此类导入
```

### 命名规范 (建议)
-   **工具函数**: 动词或动词短语开头的驼峰命名法 (camelCase)，如 `formatDuration`, `parseUrlParameters`。
-   **常量**: 全大写蛇形命名法 (UPPER_SNAKE_CASE)，如 `DEFAULT_RETENTION_POLICY`, `API_TIMEOUT_MS`。
-   **类型/接口**: 帕斯卡命名法 (PascalCase)，如 `TimeRange`, `ILoggerService` (或 `LoggerService`)。

## 质量保证
-   **单元测试**: 所有工具函数都必须有全面的单元测试，覆盖正常情况、边界条件和异常输入。
-   **性能意识**: 工具函数的设计应考虑到性能影响，避免不必要的计算开销或内存分配。
-   **错误处理**: 工具函数应有清晰的错误处理机制，例如通过参数验证、返回明确的错误值或在约定情况下抛出异常。
