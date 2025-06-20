# Schemas 数据模式目录

## 目录职责
定义应用中所有结构化数据的模式，包括数据库表结构、API接口定义、配置文件格式等，为数据验证和类型检查提供统一标准。

## 模式分类

### 数据库模式 (Database Schemas)
定义IndexedDB中各个对象存储的结构和索引。

### API模式 (API Schemas)
定义内部API接口的请求和响应格式。

### 配置模式 (Configuration Schemas)
定义各种配置文件和设置的结构。

### 导入导出模式 (Import/Export Schemas)
定义数据导入导出时的文件格式。

## 文件结构
```
schemas/
├── README.md           # 本文档
├── database.ts         # 数据库表结构定义
├── api.ts             # API接口模式定义
├── config.ts          # 配置文件模式定义
├── export.ts          # 导出文件模式定义
└── index.ts           # 统一导出
```

## 数据库模式定义

### IndexedDB数据库结构
```typescript
// 数据库版本和配置
interface DatabaseConfig {
  name: string;
  version: number;
  stores: ObjectStoreConfig[];
}

interface ObjectStoreConfig {
  name: string;
  keyPath?: string;
  autoIncrement?: boolean;
  indexes: IndexConfig[];
}

interface IndexConfig {
  name: string;
  keyPath: string | string[];
  unique?: boolean;
  multiEntry?: boolean;
}

// 具体数据库配置
const WebTimeTrackerDB: DatabaseConfig = {
  name: 'webtime_tracker',
  version: 1,
  stores: [
    {
      name: 'events_log',
      keyPath: 'id',
      autoIncrement: true,
      indexes: [
        { name: 'isProcessed_idx', keyPath: 'isProcessed' },
        { name: 'visitId_idx', keyPath: 'visitId' },
        { name: 'activityId_idx', keyPath: 'activityId' },
        { name: 'timestamp_idx', keyPath: 'timestamp' },
        { name: 'eventType_idx', keyPath: 'eventType' }
      ]
    },
    {
      name: 'aggregated_stats',
      keyPath: 'key',
      indexes: [
        { name: 'date_idx', keyPath: 'date' },
        { name: 'hostname_idx', keyPath: 'hostname' },
        { name: 'parentDomain_idx', keyPath: 'parentDomain' },
        { name: 'lastUpdated_idx', keyPath: 'last_updated' }
      ]
    }
  ]
};
```

### 数据记录模式
```typescript
// 事件日志记录模式
interface EventLogSchema {
  id?: number;                      // 主键，自增
  timestamp: number;                // 事件时间戳
  eventType: 'open_time_start' | 'open_time_end' | 'active_time_start' | 'active_time_end' | 'checkpoint';
  tabId: number;                   // 标签页ID
  url: string;                     // 完整URL
  visitId: string;                 // 访问会话ID (UUID)
  activityId: string | null;       // 活动会话ID (UUID)
  isProcessed: 0 | 1;              // 是否已处理
  resolution?: 'crash_recovery';    // 特殊标记
}

// 聚合统计记录模式
interface AggregatedStatsSchema {
  key: string;                     // 主键：date:url
  date: string;                    // 日期 YYYY-MM-DD
  url: string;                     // 完整URL
  hostname: string;                // 主机名
  parentDomain: string;            // 父域名
  total_open_time: number;         // 总打开时间（秒）
  total_active_time: number;       // 总活跃时间（秒）
  last_updated: number;            // 最后更新时间戳
}
```

## API模式定义

### 查询API模式
```typescript
// 时间统计查询请求
interface TimeStatsQueryRequest {
  dateRange: {
    startDate: string;             // YYYY-MM-DD
    endDate: string;               // YYYY-MM-DD
  };
  groupBy: 'url' | 'hostname' | 'parentDomain';
  filters?: {
    domains?: string[];            // 域名过滤
    urls?: string[];               // URL过滤
    minDuration?: number;          // 最小时长过滤（秒）
  };
  sortBy?: 'total_open_time' | 'total_active_time' | 'date';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

// 时间统计查询响应
interface TimeStatsQueryResponse {
  success: boolean;
  data: {
    records: TimeStatsRecord[];
    totalCount: number;
    hasMore: boolean;
    aggregations: {
      totalOpenTime: number;
      totalActiveTime: number;
      uniqueUrls: number;
      uniqueDomains: number;
    };
  };
  error?: {
    code: string;
    message: string;
  };
}

interface TimeStatsRecord {
  key: string;                     // URL/hostname/domain
  displayName: string;             // 显示名称
  totalOpenTime: number;           // 总打开时间
  totalActiveTime: number;         // 总活跃时间
  efficiencyRatio: number;         // 效率比率
  lastAccessed: string;            // 最后访问时间
  accessCount: number;             // 访问次数
}
```

### 配置API模式
```typescript
// 配置更新请求
interface ConfigUpdateRequest {
  updates: Array<{
    key: string;
    value: any;
    type: 'retentionPolicy' | 'uiTheme' | 'filterRules' | 'displayPreferences';
  }>;
  deviceId: string;
  timestamp: number;
}

// 配置更新响应
interface ConfigUpdateResponse {
  success: boolean;
  data?: {
    updatedConfig: UserConfigurationSchema;
    syncStatus: 'synced' | 'pending' | 'conflict';
    conflictDetails?: ConfigConflictDetails;
  };
  error?: {
    code: string;
    message: string;
    validationErrors?: ValidationError[];
  };
}

interface ConfigConflictDetails {
  localVersion: {
    deviceId: string;
    lastModified: number;
  };
  remoteVersion: {
    deviceId: string;
    lastModified: number;
  };
  conflictingFields: string[];
  resolutionStrategy: 'manual' | 'auto_latest' | 'auto_local' | 'auto_remote';
}
```

## 配置模式定义

### 用户配置模式
```typescript
interface UserConfigurationSchema {
  version: string;                 // 配置版本 (semver)
  lastModified: number;            // 最后修改时间戳
  deviceId: string;                // 设备标识符
  
  // 数据保留设置
  retentionPolicy: {
    type: 'immediate' | 'short' | 'long' | 'permanent';
    customDays?: number;           // 自定义天数（当type为custom时）
  };
  
  // 界面设置
  uiSettings: {
    theme: 'light' | 'dark' | 'auto';
    language: 'zh-CN' | 'en-US';
    dateFormat: 'YYYY-MM-DD' | 'MM/DD/YYYY' | 'DD/MM/YYYY';
    timeFormat: '24h' | '12h';
  };
  
  // 过滤规则
  filterRules: {
    excludedDomains: string[];     // 排除的域名
    excludedUrls: string[];        // 排除的URL模式
    trackingParamsToRemove: string[]; // 要移除的跟踪参数
    minTrackingDuration: number;   // 最小追踪时长（秒）
  };
  
  // 显示偏好
  displayPreferences: {
    defaultView: 'daily' | 'weekly' | 'monthly';
    defaultGrouping: 'url' | 'hostname' | 'parentDomain';
    showEfficiencyRatio: boolean;
    showActiveTimeOnly: boolean;
    compactMode: boolean;
  };
  
  // 通知设置
  notifications: {
    dailySummary: boolean;
    weeklyReport: boolean;
    storageWarnings: boolean;
    syncConflicts: boolean;
  };
}
```

### 应用配置模式
```typescript
interface ApplicationConfigSchema {
  // 追踪设置
  tracking: {
    checkpointInterval: number;    // 检查点间隔（毫秒）
    inactivityTimeout: number;     // 非活跃超时（毫秒）
    focusDetectionDelay: number;   // 焦点检测延迟（毫秒）
    batchSize: number;             // 批处理大小
  };
  
  // 存储设置
  storage: {
    maxEventLogSize: number;       // 事件日志最大条数
    maxAggregatedStatsSize: number; // 聚合数据最大条数
    quotaWarningThreshold: number; // 配额警告阈值（百分比）
    autoCleanupEnabled: boolean;   // 自动清理启用
  };
  
  // 同步设置
  sync: {
    enabled: boolean;              // 同步启用
    conflictResolution: 'manual' | 'auto_latest' | 'auto_local';
    syncInterval: number;          // 同步间隔（毫秒）
    retryAttempts: number;         // 重试次数
  };
  
  // 性能设置
  performance: {
    eventBufferSize: number;       // 事件缓冲区大小
    aggregationBatchSize: number;  // 聚合批处理大小
    queryTimeout: number;          // 查询超时（毫秒）
    maxConcurrentOperations: number; // 最大并发操作数
  };
}
```

## 导出模式定义

### 数据导出格式
```typescript
// 统计数据导出格式
interface StatsExportSchema {
  metadata: {
    exportVersion: string;         // 导出格式版本
    exportDate: string;            // 导出日期 ISO 8601
    exportedBy: string;            // 导出设备ID
    dataRange: {
      startDate: string;           // 数据起始日期
      endDate: string;             // 数据结束日期
    };
    recordCount: number;           // 记录总数
    checksum: string;              // 数据校验和
  };
  
  configuration: UserConfigurationSchema; // 导出时的配置
  
  data: {
    aggregatedStats: AggregatedStatsSchema[];
    summary: {
      totalOpenTime: number;
      totalActiveTime: number;
      uniqueUrls: number;
      uniqueDomains: number;
      topDomains: Array<{
        domain: string;
        totalTime: number;
        percentage: number;
      }>;
    };
  };
}

// 原始数据导出格式（调试用）
interface RawDataExportSchema {
  metadata: {
    exportVersion: string;
    exportDate: string;
    exportedBy: string;
    purpose: 'debug' | 'analysis' | 'migration';
    recordCount: number;
  };
  
  events: EventLogSchema[];
  
  sessions: Array<{
    visitId: string;
    activityId?: string;
    url: string;
    startTime: number;
    endTime?: number;
    duration?: number;
    checkpoints: Array<{
      timestamp: number;
      cumulativeDuration: number;
    }>;
  }>;
}
```

## 模式验证

### JSON Schema定义
```typescript
// 使用JSON Schema进行运行时验证
const UserConfigJsonSchema = {
  type: 'object',
  required: ['version', 'lastModified', 'deviceId', 'retentionPolicy'],
  properties: {
    version: {
      type: 'string',
      pattern: '^\\d+\\.\\d+\\.\\d+$'
    },
    lastModified: {
      type: 'number',
      minimum: 0
    },
    deviceId: {
      type: 'string',
      minLength: 1,
      maxLength: 100
    },
    retentionPolicy: {
      type: 'object',
      required: ['type'],
      properties: {
        type: {
          type: 'string',
          enum: ['immediate', 'short', 'long', 'permanent', 'custom']
        },
        customDays: {
          type: 'number',
          minimum: 1,
          maximum: 3650
        }
      }
    }
    // ... 其他属性定义
  }
};
```

## 与其他模块的关系
- **使用者**：services/database/（数据库操作）、services/validators/（数据验证）
- **定义来源**：根据models/entities/和业务需求定义
- **版本管理**：支持模式版本演进和向后兼容
