# Config 配置管理

## 模块职责
本模块负责管理应用的所有配置信息，包括应用的默认设置、用户可自定义的偏好设置，以及可能的特定环境配置。它为整个应用程序提供一个统一的、类型安全的配置访问接口。

## 功能范围
-   ✅ **包含内容**:
    *   定义和提供应用的默认配置值。
    *   管理和持久化用户个性化设置。
    *   (可选) 处理不同环境（如开发、生产）的特定配置。
    *   (可选) 提供配置数据的基本验证。
-   ❌ **不包含内容**:
    *   核心业务逻辑。
    *   直接的数据操作（配置的持久化可能委托给 `services/storage`）。
    *   UI 组件。

## 文件说明 (示例)

### `default-app-config.ts` (或 `default-config.ts`)
定义应用的全局默认配置参数，例如默认的追踪设置、存储参数、API 端点（如果有）、性能调整参数等。这些是应用启动时的基础配置。

### `user-settings-service.ts` (或 `user-settings.ts`)
负责管理用户可自定义的设置，如界面主题、数据保留策略、通知偏好、过滤规则等。这可能涉及到从存储中读取用户配置，以及在用户更改设置时将其持久化。

### `index.ts`
统一导出配置相关的公共接口、类型、以及获取配置的工具函数或服务实例。

## 配置层次与优先级 (示例)
应用配置的生效可能遵循一定的层次结构和优先级：
1.  **默认配置 (Default Config)**: 应用内置的基础配置，优先级最低。
2.  **环境配置 (Environment Config)**: (如果使用) 特定于部署环境（如 `development`, `production`）的配置，会覆盖默认配置。
3.  **用户配置 (User Settings)**: 用户通过设置界面自定义的配置，优先级最高，会覆盖默认配置和环境配置。
4.  **(可选) 运行时配置 (Runtime Config)**: 在应用运行时动态调整的临时配置。

## 使用方式 (示例)
```typescript
// 假设从具体配置文件或统一导出中获取
import { getDefaultAppConfig } from '@/shared/config/default-app-config';
import { userSettingsService } from '@/shared/config/user-settings-service'; // 假设是一个服务实例

// 获取默认配置
const defaultConfig = getDefaultAppConfig();
console.log(defaultConfig.tracking.defaultInterval);

// 获取用户设置（可能是异步的，如果从存储加载）
async function loadUserSettings() {
  const settings = await userSettingsService.loadSettings();
  if (settings) {
    console.log(settings.uiTheme);
  }
}
```

## 与其他模块的关系
-   **被依赖**:
    -   应用中的几乎所有模块（`core/`, `services/`, `entrypoints/`）都可能需要访问配置信息来调整其行为。
-   **配置来源与持久化**:
    -   用户配置的输入通常来自 `entrypoints/options/` (选项页面)。
    -   用户配置的持久化可能依赖 `services/storage/` (本地存储) 或 `services/chrome-api/` (如 `chrome.storage.sync`)。
    -   默认配置和环境配置通常是代码中定义的静态对象。
-   **模式定义**:
    -   配置的数据结构应在 `models/schemas/config-schema.ts` 中进行定义，以确保类型安全和一致性。
