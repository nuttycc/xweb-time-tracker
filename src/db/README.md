# Database Module Documentation

WebTime Tracker 数据库模块 - 基于 Dexie.js 的 IndexedDB 封装，提供类型安全的数据访问层

为WebTime Tracker应用提供统一、类型安全的数据库访问接口，实现事件记录和时间统计数据的持久化存储。通过分层架构设计，确保数据访问逻辑与业务逻辑的清晰分离，提高代码可维护性和可测试性。

## 🏗️ 架构概览

本模块采用分层架构设计，从底层到顶层依次为：

```
indexedDB 模块：
├── Services层 (CRUD接口)
│   └── desc：提供统一的数据库操作接口，封装Repository层复杂性
├── Repositories层 (CRUD实现)
│   └── desc：实现数据访问模式，提供类型安全的CRUD操作和查询方法
├── Models层 (类型验证)
│   └── desc：Zod验证和TypeScript类型, 定义数据结构和运行时验证规则，确保数据完整性
├── Schemas层 (表结构)
│   └── desc： Dexie表定义和钩子, 定义数据库表结构、索引和生命周期钩子
├── Connection层 (连接管理)
│   └── desc：管理数据库连接状态、事务处理和错误恢复
└── Utils层 (工具函数)
```

## 🚀 快速开始

### 基本使用

**Desc**：演示如何使用DatabaseService进行基本的数据库操作，包括添加事件、查询未处理事件和管理聚合统计数据。

```typescript
import { database, DatabaseService } from '@/db';

// 使用模块提供的单例数据库实例，确保全局一致性
const db = database;

// 初始化数据库服务，提供类型安全的 CRUD 操作接口
const dbService = new DatabaseService(db);

const eventId = await dbService.addEvent({
  eventType: 'open_time_start',
  url: 'https://example.com',
  timestamp: Date.now(),
  visitId: 'visit-123',
  activityId: 'activity-456',
});

const unprocessedEvents = await dbService.getUnprocessedEvents();
console.log(`发现 ${unprocessedEvents.length} 个未处理事件`);

// 插入或更新单个时间统计
// 目的：将事件数据聚合为按日期和URL分组的时间统计，支持增量更新
await dbService.upsertStat({
  date: '2025-06-23',
  url: 'https://example.com',
  hostname: 'example.com',
  parentDomain: 'example.com',
  openTimeToAdd: 3600,
  activeTimeToAdd: 1800,
});

// 查询聚合统计数据
// 目的：获取特定主机名的所有时间统计数据，用于报表展示
const hostStats = await dbService.getStatsByHostname('example.com');
console.log(`${hostStats.length} 条聚合统计记录`);
```

### 健康检查

**操作目的**：监控数据库运行状态和数据完整性，及时发现潜在问题，确保系统稳定运行。

```typescript
// 获取数据库健康信息
// 目的：检查数据库连接状态、数据量统计，用于系统监控和故障诊断
const health = await dbService.getDatabaseHealth();
console.log('数据库状态:', health.isHealthy ? '正常' : '异常');
console.log('未处理事件数:', health.unprocessedEventCount);
console.log('总事件数:', health.totalEventCount);
console.log('总统计数:', health.totalStatsCount);
```

## 📚 API 参考

**文档目的**：提供完整的API接口说明，帮助开发者理解每个类和方法的功能、参数和返回值，确保正确使用数据库模块。

### 核心类

#### WebTimeTrackerDB

**类的目的**：作为数据库的主入口点，继承自Dexie，定义表结构和基本操作方法，提供类型安全的数据库访问接口。

```typescript
class WebTimeTrackerDB extends Dexie {
  eventslog: Table<EventsLogRecord, number>;
  aggregatedstats: Table<AggregatedStatsRecord, number>;

  constructor();
  open(): Promise<WebTimeTrackerDB>;
  close(): void;
  delete(): Promise<void>;
}
```

### Repository 层

#### BaseRepository<T, PK>

**类的目的**：实现Repository设计模式，为所有数据表提供统一的CRUD操作接口，确保数据访问的一致性和类型安全。直接使用Dexie.js EntityTable，无需手动类型转换。

```typescript
import type { IDType } from 'dexie';

abstract class BaseRepository<T, PK extends keyof T> {
  create(entity: InsertType<T, PK>): Promise<IDType<T, PK>>;
  findById(id: IDType<T, PK>): Promise<T | undefined>;
  getById(id: IDType<T, PK>): Promise<T>; // 抛出NotFoundError如果未找到
  update(id: IDType<T, PK>, changes: Partial<T>): Promise<number>;
  upsert(entity: InsertType<T, PK>): Promise<IDType<T, PK>>;
  delete(id: IDType<T, PK>): Promise<void>;

  findAll(): Promise<T[]>;
  count(): Promise<number>;
  clear(): Promise<void>;
}
```

**泛型参数说明**：

- `T`: 实体类型
- `PK`: 主键字段名（字符串字面量类型，如 'id' 或 'key'）
- 主键类型通过 `IDType<T, PK>` 推断，确保与 Dexie.js 类型系统完全兼容

#### EventsLogRepository

**类的目的**：专门处理事件日志数据的Repository，提供事件记录、查询和状态管理功能，支持事件处理工作流。使用number类型主键，支持自动递增ID。

```typescript
class EventsLogRepository extends BaseRepository<EventsLogRecord, 'id'> {
  createEvent(event: Omit<EventsLogRecord, 'id' | 'isProcessed'>): Promise<number>;

  getUnprocessedEvents(options?: EventsLogQueryOptions): Promise<EventsLogRecord[]>;
  getUnprocessedEventsCount(options?: RepositoryOptions): Promise<number>;

  markEventsAsProcessed(eventIds: number[]): Promise<number>;
  deleteEventsByIds(eventIds: number[]): Promise<number>;

  getEventsByVisitId(visitId: string, options?: EventsLogQueryOptions): Promise<EventsLogRecord[]>;
  getEventsByActivityId(
    activityId: string,
    options?: EventsLogQueryOptions
  ): Promise<EventsLogRecord[]>;
  getEventsByTypeAndTimeRange(
    eventType: EventType,
    startTime: number,
    endTime: number,
    options?: EventsLogQueryOptions
  ): Promise<EventsLogRecord[]>;
}
```

#### AggregatedStatsRepository

**类的目的**：管理聚合统计数据，提供时间统计的增量更新、多维度查询和汇总分析功能，支持报表生成和数据分析。使用string类型复合主键（格式："YYYY-MM-DD:url"）。

```typescript
class AggregatedStatsRepository extends BaseRepository<AggregatedStatsRecord, 'key'> {
  upsertTimeAggregation(data: TimeAggregationData, options?: RepositoryOptions): Promise<string>;

  getStatsByHostname(
    hostname: string,
    options?: AggregatedStatsQueryOptions
  ): Promise<AggregatedStatsRecord[]>;

  getStatsByParentDomain(
    parentDomain: string,
    options?: AggregatedStatsQueryOptions
  ): Promise<AggregatedStatsRecord[]>;

  getStatsByDateRange(
    startDate: string,
    endDate: string,
    options?: AggregatedStatsQueryOptions
  ): Promise<AggregatedStatsRecord[]>;

  getStatsByDateAndUrl(
    date: string,
    url: string,
    options?: RepositoryOptions
  ): Promise<AggregatedStatsRecord | undefined>;

  getTotalTimeByDateRange(
    startDate: string,
    endDate: string,
    options?: RepositoryOptions
  ): Promise<{
    totalOpenTime: number;
    totalActiveTime: number;
    recordCount: number;
  }>;

  static generateKey(date: string, url: string): string;
  static getCurrentUtcDate(timestamp?: number): string;
}
```

### Services 层

#### DatabaseService

**类的目的**：提供统一的数据库服务接口，封装Repository层的复杂性，为上层业务逻辑提供简洁、类型安全的数据访问方法。

```typescript
class DatabaseService {
  addEvent(event: Omit<CreateEventsLogRecord, 'isProcessed'>): Promise<number>;
  getUnprocessedEvents(options?: EventsLogQueryOptions): Promise<EventsLogRecord[]>;
  markEventsAsProcessed(eventIds: number[]): Promise<number>;
  deleteEventsByIds(eventIds: number[]): Promise<number>;

  upsertStat(data: TimeAggregationData): Promise<string>;
  getStatsByDateRange(startDate: string, endDate: string): Promise<AggregatedStatsRecord[]>;
  getStatsByHostname(hostname: string): Promise<AggregatedStatsRecord[]>;
  getStatsByParentDomain(parentDomain: string): Promise<AggregatedStatsRecord[]>;

  getDatabaseHealth(): Promise<DatabaseHealthInfo>;
}
```

### 工具层

#### HealthCheckUtil

**类的目的**：提供数据库健康监控功能，检测连接状态、性能指标和数据完整性，支持系统运维和故障预警。

```typescript
class HealthCheckUtil {
  static performHealthCheck(
    db: WebTimeTrackerDB,
    options?: HealthCheckOptions
  ): Promise<HealthCheckResult>;

  static quickHealthCheck(db: WebTimeTrackerDB): Promise<boolean>;
}
```

#### VersionManagerUtil

**类的目的**：管理数据库版本信息，支持版本兼容性检查和升级决策，确保数据库结构的正确性。

```typescript
class VersionManagerUtil {
  static getVersionInfo(db: WebTimeTrackerDB): Promise<VersionInfo>;
  static compareVersions(v1: number, v2: number): VersionComparison;

  static needsUpgrade(db: WebTimeTrackerDB): Promise<boolean>;
  static isCompatible(db: WebTimeTrackerDB, requiredVersion?: number): Promise<boolean>;
}
```

## 🎯 核心特性

**特性目的**：展示数据库模块的关键功能，帮助开发者了解如何使用核心工具来解决常见的数据处理和系统监控问题。

### 类型安全保障

**功能目的**：通过泛型约束和强类型系统，确保编译时类型检查，防止运行时类型错误，提高代码质量和开发效率。

```typescript
import type { IDType } from 'dexie';

// BaseRepository 直接使用 Dexie.js EntityTable，主键类型通过 IDType 推断
class EventsLogRepository extends BaseRepository<EventsLogRecord, 'id'> {
  // 主键类型通过 IDType<EventsLogRecord, 'id'> 推断为 number，编译时类型安全
  async findById(id: IDType<EventsLogRecord, 'id'>): Promise<EventsLogRecord | undefined> { ... }
  async update(id: IDType<EventsLogRecord, 'id'>, changes: Partial<EventsLogRecord>): Promise<number> { ... }
}

class AggregatedStatsRepository extends BaseRepository<AggregatedStatsRecord, 'key'> {
  // 主键类型通过 IDType<AggregatedStatsRecord, 'key'> 推断为 string，编译时类型安全
  async findById(key: IDType<AggregatedStatsRecord, 'key'>): Promise<AggregatedStatsRecord | undefined> { ... }
  async update(key: IDType<AggregatedStatsRecord, 'key'>, changes: Partial<AggregatedStatsRecord>): Promise<number> { ... }
}
```

### URL规范化

**功能目的**：防止URL参数爆炸导致的数据膨胀，通过移除营销追踪参数，确保统计数据的准确性和存储效率。

```typescript
import { normalizeUrl } from '@/db';

const originalUrl = 'https://example.com/page?id=123&utm_source=google&fbclid=abc';
const normalizedUrl = normalizeUrl(originalUrl);
```

### 健康检查

**功能目的**：实时监控数据库运行状态，及时发现连接问题、性能瓶颈或数据异常，确保系统稳定运行。

```typescript
import { HealthCheckUtil, database } from '@/db';

const health = await HealthCheckUtil.performHealthCheck(database);
console.log('数据库状态:', health.healthy ? '正常' : '异常');
```
