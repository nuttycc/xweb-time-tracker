# Database 数据库服务模块

## 模块职责
封装IndexedDB操作，为应用提供统一、类型安全的数据访问接口，处理数据库连接、事务管理和错误处理。

## 功能范围

### 核心功能
- **数据库连接管理**：IndexedDB连接的创建、维护和关闭
- **事务管理**：读写事务的统一管理和错误处理
- **数据操作封装**：CRUD操作的类型安全封装
- **数据库迁移**：版本升级时的数据库结构迁移

### 数据表管理
1. **events_log表**：原始事件日志的存储和查询
2. **aggregated_stats表**：聚合统计数据的存储和查询
3. **索引管理**：优化查询性能的索引创建和维护

## 文件结构
```
database/
├── README.md           # 本文档
├── indexeddb.ts        # IndexedDB操作封装
├── schemas.ts          # 数据库模式定义
├── migrations.ts       # 数据库迁移逻辑
├── transactions.ts     # 事务管理
└── repositories.ts     # 数据仓库模式实现
```

## 数据库设计

### 数据库信息
- **数据库名称**：`webtime_tracker`
- **当前版本**：1
- **存储引擎**：IndexedDB

### 表结构定义
```typescript
// events_log表结构
interface EventLogRecord {
  id?: number;              // 主键，自增
  timestamp: number;        // 事件时间戳
  eventType: EventType;     // 事件类型
  tabId: number;           // 标签页ID
  url: string;             // 完整URL
  visitId: string;         // 访问会话ID
  activityId: string | null; // 活动会话ID
  isProcessed: 0 | 1;      // 是否已处理
  resolution?: string;      // 特殊标记
}

// aggregated_stats表结构
interface AggregatedStatsRecord {
  key: string;             // 主键：日期:URL组合
  date: string;            // 日期 YYYY-MM-DD
  url: string;             // 完整URL
  hostname: string;        // 主机名
  parentDomain: string;    // 父域名
  total_open_time: number; // 总打开时间
  total_active_time: number; // 总活跃时间
  last_updated: number;    // 最后更新时间
}
```

## 服务接口

### 事件日志操作
```typescript
interface EventLogService {
  // 插入单个事件
  insertEvent(event: EventLogRecord): Promise<number>;
  
  // 批量插入事件
  insertEvents(events: EventLogRecord[]): Promise<number[]>;
  
  // 查询未处理事件
  getUnprocessedEvents(): Promise<EventLogRecord[]>;
  
  // 标记事件为已处理
  markEventsProcessed(eventIds: number[]): Promise<void>;
  
  // 删除指定时间范围的事件
  deleteEventsByDateRange(startDate: Date, endDate: Date): Promise<number>;
}
```

### 聚合数据操作
```typescript
interface AggregatedStatsService {
  // 插入或更新聚合数据
  upsertStats(stats: AggregatedStatsRecord): Promise<void>;
  
  // 批量更新聚合数据
  batchUpsertStats(statsList: AggregatedStatsRecord[]): Promise<void>;
  
  // 按日期范围查询
  getStatsByDateRange(startDate: string, endDate: string): Promise<AggregatedStatsRecord[]>;
  
  // 按主机名查询
  getStatsByHostname(hostname: string, dateRange?: [string, string]): Promise<AggregatedStatsRecord[]>;
  
  // 按父域名查询
  getStatsByParentDomain(domain: string, dateRange?: [string, string]): Promise<AggregatedStatsRecord[]>;
}
```

## 错误处理

### 错误类型定义
```typescript
enum DatabaseErrorCode {
  CONNECTION_FAILED = 'DB_CONNECTION_FAILED',
  TRANSACTION_FAILED = 'DB_TRANSACTION_FAILED',
  QUOTA_EXCEEDED = 'DB_QUOTA_EXCEEDED',
  SCHEMA_ERROR = 'DB_SCHEMA_ERROR',
  MIGRATION_FAILED = 'DB_MIGRATION_FAILED'
}
```

### 错误处理策略
- **连接错误**：重试机制，最多重试3次
- **事务错误**：回滚事务，记录错误日志
- **配额超限**：触发清理机制，通知上层处理
- **迁移错误**：阻止应用启动，要求用户处理

## 性能优化

### 索引策略
- **events_log表**：在`isProcessed`、`visitId`、`activityId`上建立索引
- **aggregated_stats表**：在`date`、`hostname`、`parentDomain`上建立索引

### 批量操作
- 支持批量插入和更新，减少事务开销
- 使用事务批处理提高写入性能

### 查询优化
- 合理使用索引，避免全表扫描
- 分页查询支持，避免大结果集内存占用

## 与其他模块的关系
- **服务对象**：core/（为业务层提供数据访问）
- **数据模型**：models/entities/（使用实体模型定义）
- **配置依赖**：shared/config/（数据库配置参数）
