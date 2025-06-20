# Chrome API 封装服务

## 模块职责
本模块的核心职责是封装 Chrome 浏览器扩展的 JavaScript API (chrome.\*) 调用。它旨在提供一个类型安全、统一且更易于测试的接口层，用于访问浏览器提供的各种功能，同时处理底层的 API 兼容性问题和错误。

## 功能范围
-   **核心封装功能**:
    *   **标签页管理**: 提供查询、监听和管理浏览器标签页状态的服务。
    *   **存储服务**: 封装 `chrome.storage.sync` (跨设备同步存储) 和 `chrome.storage.local` (本地存储) 的操作。
    *   **定时器服务**: 封装 `chrome.alarms` API，用于创建和管理定时任务。
    *   **权限管理**: 提供检查和请求扩展所需权限的服务。
    *   **运行时交互**: 封装 `chrome.runtime` API，用于消息传递和扩展生命周期事件处理。
    *   **导航事件**: 封装 `chrome.webNavigation` API，用于监听页面导航事件。
-   **主要 API 覆盖**: `chrome.tabs`, `chrome.storage`, `chrome.alarms`, `chrome.runtime`, `chrome.webNavigation`, `chrome.permissions`, 等。

## 文件结构
```typescript
chrome-api/
├── README.md         // 本文档
├── tabs-service.ts   // 标签页相关 API 封装 (原 tabs.ts)
├── storage-service.ts// 存储相关 API 封装 (原 storage.ts)
├── alarms-service.ts // 定时器相关 API 封装 (原 alarms.ts)
├── runtime-service.ts// 运行时相关 API 封装 (原 runtime.ts)
├── navigation-service.ts// 导航事件相关 API 封装 (原 navigation.ts)
├── permissions-service.ts// 权限管理相关 API 封装 (原 permissions.ts)
└── index.ts          // 统一导出各服务接口和实现
```

## API 封装设计概述
每个 Chrome API 的主要功能集合（如 `tabs`, `storage`）通常会被封装成一个专门的服务类或对象。这些封装：
-   将回调风格的 API 转换为基于 Promise 的异步函数，使其更易于在现代 JavaScript/TypeScript 中使用。
-   提供更强的类型检查和更友好的方法签名。
-   统一处理 `chrome.runtime.lastError`，并将其转换为标准的错误对象或服务结果。
-   例如，`TabsService` 会提供如 `getActiveTab(): Promise<Tab | null>`、`queryTabs(query: QueryInfo): Promise<Tab[]>` 以及事件监听的封装（如 `onTabActivated`）。

## 关键设计考量

### 错误处理
-   **统一错误类型**: 定义通用的错误代码或类型，以区分权限问题、API 调用失败、参数错误等。
-   **策略**:
    *   对权限不足的情况，应能引导用户进行授权。
    *   对 API 不可用或调用失败的情况，提供降级方案或清晰的错误反馈。
    *   对存储配额超限等问题，通知上层模块进行处理。

### 兼容性
-   **Manifest V3 适配**: 确保所有 API 调用符合 Manifest V3 的要求（例如，Service Worker 环境下的使用）。
-   **浏览器版本**: 考虑不同 Chrome 版本的 API 差异，并在必要时进行兼容性处理或优雅降级。

### 类型安全
-   **TypeScript**: 充分利用 TypeScript 为 Chrome API 提供的类型定义 (`@types/chrome`)。
-   **自定义类型扩展**: 在必要时，可以扩展或细化官方类型定义，以适应应用的特定需求。
-   **运行时检查**: 对关键输入参数进行运行时验证，以增强健壮性。

### 性能优化
-   **事件监听**: 高效管理事件监听器的注册与注销，避免内存泄漏和不必要的性能开销。
-   **异步操作**: 合理组织异步调用链，避免阻塞。
-   **缓存**: 对某些不经常变化的 API 查询结果（如已安装扩展列表）可以考虑引入缓存机制。

## 与其他模块的关系
-   **服务对象 (被依赖)**:
    -   `core/`: 为核心业务逻辑层提供访问浏览器底层能力的接口。
    -   其他 `services/` 模块 (如 `sync` 模块依赖存储服务)。
    -   `entrypoints/`: 应用入口点（如 Background Script, Content Scripts）直接使用这些封装服务与浏览器交互。
-   **事件转发**:
    -   可以将某些 Chrome 原生事件（如 `chrome.tabs.onUpdated`）通过 `services/event-bus/` 转发为应用内部的领域事件或系统事件。
-   **依赖**:
    -   `shared/utils/`: 可能使用错误处理工具或异步流程控制工具。
    -   `shared/types/`: 可能使用或定义与 API 交互相关的类型。
