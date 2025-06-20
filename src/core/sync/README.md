# Sync 配置同步核心模块

## 模块职责
本模块负责用户配置（如偏好设置、数据保留策略等）在不同设备间的同步业务逻辑。其核心目标是确保用户在切换设备时能获得一致的应用体验。

## 核心功能与策略
-   **配置自动同步**：用户的偏好设置（如数据保留策略、界面主题、过滤规则等）在发生变更后，会自动尝试同步到云端存储。新设备安装扩展后也会尝试从云端获取最新配置。
-   **冲突处理**：
    *   **策略**：默认采用“最后修改者优先”的整体覆盖策略。即，以时间戳最新的那份完整配置为准，覆盖本地或云端的旧配置。
    *   **用户透明**：冲突解决后，会明确通知用户配置已更新及其来源。
-   **变更通知**：当配置因同步而发生变更时，会通过适当的机制（如 UI 提示）通知用户。
-   **手动导入/导出**：支持用户手动备份当前配置或从备份文件中恢复配置，作为自动同步的补充。

## 文件结构
```typescript
sync/
├── README.md             // 本文档
├── config-synchronizer.ts // 配置同步的主要逻辑实现 (原 config-sync.ts)
├── conflict-resolver.ts  // 冲突处理策略的实现 (原 conflict.ts)
├── sync-recovery.ts      // 同步失败时的恢复与重试机制 (原 recovery.ts)
└── change-notifier.ts    // 配置变更通知逻辑 (原 notification.ts)
```

## 关键业务逻辑与流程

### 配置版本与元数据
-   每个同步的配置对象都包含元数据，如：
    *   `version`: 配置结构的版本号。
    *   `lastModified`: 最后修改的时间戳。
    *   `deviceId`: 最后修改该配置的设备标识。
-   这些元数据用于冲突检测、版本控制和问题追溯。

### 同步触发与执行流程
-   **上传（本地变更时）**：
    1.  监听到用户配置发生本地修改。
    2.  更新配置的 `lastModified` 时间戳和 `deviceId`。
    3.  通过 `services/chrome-api/` 将配置写入 `chrome.storage.sync`。
    4.  向用户反馈同步状态（成功、失败、等待中）。
-   **下载（远程变更时）**：
    1.  通过 `chrome.storage.onChanged` 事件监听到云端配置发生变化。
    2.  获取本地配置和远程配置，比较其 `lastModified` 时间戳。
    3.  根据冲突解决策略（通常是远程覆盖本地，如果远程更新），更新本地配置。
    4.  触发变更通知，告知用户配置已更新。

### 核心数据结构示例
```typescript
interface IUserSyncableConfiguration {
  version: string;           // 配置的版本，用于结构迁移
  lastModified: number;      // 最后修改的时间戳 (Unix ms)
  modifiedByDeviceId: string; // 最后修改此配置的设备ID

  retentionPolicy: string;   // 例如: '7days', '30days', 'permanent'
  uiTheme: 'light' | 'dark' | 'system';
  filterRules: { type: 'domain' | 'url', value: string }[];
  // ... 其他需要同步的用户配置项
}
```

## 与其他模块的关系
-   **依赖（服务）**：
    -   `services/chrome-api/`: 强依赖此服务提供的 `chrome.storage.sync` API 进行云端数据读写。
-   **协调与交互**：
    -   `core/lifecycle/`: 当数据保留策略 (`retentionPolicy`) 因同步而变更时，需要通知生命周期管理模块以应用新的策略。
    -   `entrypoints/options/`: 选项页面是用户查看和修改配置的主要界面，也是展示同步状态和接收用户手动导入/导出操作的入口。
    -   `shared/config/`: 同步的配置项定义来源于共享配置。
