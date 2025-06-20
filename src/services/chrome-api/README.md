# Chrome API 浏览器API封装模块

## 模块职责
封装Chrome扩展API调用，提供类型安全、统一的浏览器功能访问接口，处理API兼容性和错误处理。

## 功能范围

### 核心功能
- **标签页管理**：标签页查询、监听、状态管理
- **存储服务**：chrome.storage.sync和chrome.storage.local的封装
- **定时器服务**：chrome.alarms API的封装
- **权限管理**：扩展权限的检查和请求

### API覆盖范围
1. **chrome.tabs**：标签页相关操作
2. **chrome.storage**：数据存储操作
3. **chrome.alarms**：定时任务管理
4. **chrome.runtime**：运行时事件处理
5. **chrome.webNavigation**：页面导航事件

## 文件结构
```
chrome-api/
├── README.md           # 本文档
├── tabs.ts            # 标签页API封装
├── storage.ts         # 存储API封装
├── alarms.ts          # 定时器API封装
├── runtime.ts         # 运行时API封装
├── navigation.ts      # 导航API封装
└── permissions.ts     # 权限API封装
```

## API封装设计

### 标签页服务
```typescript
interface TabsService {
  // 获取当前活跃标签页
  getActiveTab(): Promise<chrome.tabs.Tab | null>;
  
  // 查询标签页
  queryTabs(queryInfo: chrome.tabs.QueryInfo): Promise<chrome.tabs.Tab[]>;
  
  // 监听标签页激活事件
  onTabActivated(callback: (activeInfo: chrome.tabs.TabActiveInfo) => void): void;
  
  // 监听标签页更新事件
  onTabUpdated(callback: (tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => void): void;
  
  // 监听标签页移除事件
  onTabRemoved(callback: (tabId: number, removeInfo: chrome.tabs.TabRemoveInfo) => void): void;
}
```

### 存储服务
```typescript
interface StorageService {
  // 同步存储操作
  sync: {
    get<T>(keys?: string | string[]): Promise<T>;
    set(items: Record<string, any>): Promise<void>;
    remove(keys: string | string[]): Promise<void>;
    clear(): Promise<void>;
    onChanged(callback: (changes: Record<string, chrome.storage.StorageChange>) => void): void;
  };
  
  // 本地存储操作
  local: {
    get<T>(keys?: string | string[]): Promise<T>;
    set(items: Record<string, any>): Promise<void>;
    remove(keys: string | string[]): Promise<void>;
    clear(): Promise<void>;
  };
}
```

### 定时器服务
```typescript
interface AlarmsService {
  // 创建定时器
  create(name: string, alarmInfo: chrome.alarms.AlarmCreateInfo): Promise<void>;
  
  // 获取定时器
  get(name: string): Promise<chrome.alarms.Alarm | null>;
  
  // 获取所有定时器
  getAll(): Promise<chrome.alarms.Alarm[]>;
  
  // 清除定时器
  clear(name: string): Promise<boolean>;
  
  // 监听定时器触发
  onAlarm(callback: (alarm: chrome.alarms.Alarm) => void): void;
}
```

## 错误处理

### 错误类型定义
```typescript
enum ChromeAPIErrorCode {
  PERMISSION_DENIED = 'CHROME_PERMISSION_DENIED',
  API_NOT_AVAILABLE = 'CHROME_API_NOT_AVAILABLE',
  QUOTA_EXCEEDED = 'CHROME_QUOTA_EXCEEDED',
  INVALID_ARGUMENT = 'CHROME_INVALID_ARGUMENT',
  RUNTIME_ERROR = 'CHROME_RUNTIME_ERROR'
}

interface ChromeAPIError extends Error {
  code: ChromeAPIErrorCode;
  chromeError?: chrome.runtime.LastError;
}
```

### 错误处理策略
- **权限错误**：提示用户授权，提供权限申请流程
- **API不可用**：降级处理，使用替代方案
- **配额超限**：通知上层处理，触发清理机制
- **参数错误**：参数验证，提供详细错误信息

## 兼容性处理

### Manifest V3适配
- 使用Service Worker替代Background Page
- 适配新的权限模型
- 处理API变更和废弃

### 浏览器兼容性
- Chrome版本兼容性检查
- API可用性检测
- 优雅降级处理

## 类型安全

### TypeScript集成
```typescript
// 扩展Chrome API类型定义
declare namespace chrome {
  namespace tabs {
    interface Tab {
      // 扩展标准类型定义
      lastActiveTime?: number;
    }
  }
}
```

### 运行时类型检查
- 参数类型验证
- 返回值类型检查
- 错误类型转换

## 性能优化

### 事件监听优化
- 避免重复注册监听器
- 及时清理无用监听器
- 事件防抖和节流

### 异步操作优化
- Promise化所有回调API
- 并发控制，避免API调用过频
- 缓存机制，减少重复查询

## 与其他模块的关系
- **服务对象**：core/（为业务层提供浏览器能力）
- **事件分发**：services/event-bus/（将浏览器事件转发到应用内）
- **错误处理**：shared/utils/（统一错误处理工具）
