# Services 技术服务层

## 模块职责
Services 层负责提供所有具体的技术实现和服务。它的主要目标是为 `core/` 业务核心层提供必要的技术支撑，同时封装所有外部依赖（如浏览器 API、数据库、第三方库）和技术实现细节。

## 功能边界
-   ✅ **包含内容**: 数据库交互 (CRUD 操作)、浏览器 API (Chrome API) 调用封装、事件总线实现、数据验证服务、对外部库的封装、以及其他技术性工具或服务。
-   ❌ **不包含内容**: 核心业务规则、领域模型的决策逻辑（这些应在 `core/` 层）。

## 子目录说明

### `database/` - 数据库服务
封装对 IndexedDB (或其他持久化存储) 的所有操作。提供统一的数据访问接口 (Repositories)，管理事务和错误处理。

### `chrome-api/` - Chrome API 封装
封装对 Chrome 扩展原生 API 的调用，提供类型更安全、更易于测试的接口。处理 API 的兼容性问题和底层的错误。

### `event-bus/` - 事件总线服务
实现应用内部的事件发布/订阅机制，支持不同模块间的松耦合通信。

### `validators/` - 数据验证服务
提供技术性的数据验证功能，例如基于模式 (Schema) 验证数据对象的结构和类型。

## 设计原则
1.  **接口驱动 (Interface-Driven)**: 所有服务都应通过清晰定义的 TypeScript 接口暴露其功能，便于依赖注入、模拟 (Mocking) 和替换实现。
2.  **错误处理 (Error Handling)**: 实现统一的错误处理策略，将底层的技术错误（如 API 错误、数据库异常）转换为更通用的、业务层可理解的错误类型或结果。
3.  **类型安全 (Type Safety)**: 充分利用 TypeScript 的类型系统，确保服务接口和实现都是类型安全的。
4.  **可测试性 (Testability)**: 服务应设计为易于进行单元测试和集成测试，通常通过依赖注入和接口模拟来实现。

## 与其他模块的关系
-   **依赖**:
    -   `models/`: 使用定义好的数据模型和模式。
    -   `shared/`: 使用通用的工具函数、常量和类型。
    -   **外部依赖**: 直接与 Chrome APIs, IndexedDB, 以及可能的第三方库交互。
-   **被依赖**:
    -   `core/`: 业务核心层通过接口调用这些服务来执行技术操作。
    -   `entrypoints/`: 应用入口点（如 Background Script）可能会直接使用某些服务（如事件总线、Chrome API 服务）。

## 服务接口约定 (示例)

### 统一结果格式 (可选)
服务方法的返回结果可以考虑使用统一的包装对象，以明确表示操作成功或失败，并携带数据或错误信息。
```typescript
interface IServiceResult<TData, TError = Error> {
  success: boolean;
  data?: TData;
  error?: TError;
}
// 例: async someOperation(): Promise<IServiceResult<MyData>>
```

### 异步操作
所有涉及 I/O (如数据库、API 调用) 的服务操作都应该是异步的，返回 `Promise`。

### 配置化
服务应支持通过构造函数注入或配置方法来管理其依赖和行为参数，避免硬编码。
