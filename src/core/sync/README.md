# Sync 配置同步核心模块

## 模块职责
负责用户配置的跨设备同步业务逻辑，实现PRD中定义的配置管理需求，确保用户在不同设备间的一致体验。

## 功能范围

### 核心功能
- **配置同步**：用户偏好设置的跨设备自动同步
- **冲突处理**：采用"整体覆盖+用户透明"策略处理同步冲突
- **变更通知**：配置变更时的用户界面提示机制
- **导入导出**：支持配置的手动备份和迁移

### 同步策略
1. **同步范围**：数据保留策略、界面主题、过滤规则、显示偏好等
2. **同步时机**：配置变更后立即同步，新设备安装后自动获取
3. **冲突解决**：以最后修改时间最新的完整配置覆盖旧配置
4. **用户感知**：明确展示配置来源和同步状态

## 文件结构
```
sync/
├── README.md           # 本文档
├── config-sync.ts      # 配置同步主逻辑
├── conflict.ts         # 冲突处理策略
├── recovery.ts         # 同步恢复机制
└── notification.ts     # 变更通知逻辑
```

## 业务规则实现

### 冲突处理策略
```typescript
// 伪代码示例
interface ConflictResolution {
  strategy: 'overwrite'; // 整体覆盖策略
  basis: 'lastModified'; // 基于最后修改时间
  notification: boolean; // 必须通知用户
}
```

### 配置版本管理
- **版本标识**：每个配置包含版本号和时间戳
- **设备标识**：记录最后修改的设备信息
- **变更追踪**：跟踪配置项的具体变更内容

## 同步流程

### 配置上传流程
1. **变更检测**：监听用户配置修改
2. **版本更新**：更新时间戳和设备标识
3. **云端同步**：写入chrome.storage.sync
4. **状态反馈**：向用户反馈同步状态

### 配置下载流程
1. **变更监听**：监听chrome.storage.onChanged事件
2. **冲突检测**：比较本地和远程配置的时间戳
3. **策略执行**：执行覆盖策略
4. **用户通知**：显示配置变更通知

## 数据结构

### 用户配置对象
```typescript
interface UserConfiguration {
  version: string;           // 配置版本
  lastModified: number;      // 最后修改时间戳
  deviceId: string;          // 修改设备标识
  retentionPolicy: string;   // 数据保留策略
  uiTheme: string;          // 界面主题
  filterRules: string[];     // 过滤规则
  // ... 其他配置项
}
```

## 与其他模块的关系
- **技术依赖**：services/chrome-api/（chrome.storage.sync API）
- **业务协作**：core/lifecycle/（配置变更影响数据生命周期）
- **用户界面**：entrypoints/options/（配置管理界面）
