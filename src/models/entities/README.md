# Entities 实体模型目录

## 目录职责
定义应用中的核心实体模型，这些实体具有唯一标识符，代表业务领域中的重要概念和对象。

## 实体特征
- **唯一标识**：每个实体都有唯一的标识符（ID）
- **生命周期**：实体有明确的创建、更新、删除生命周期
- **状态变更**：实体的状态可以随时间变化
- **业务含义**：实体代表真实的业务概念

## 文件结构
```
entities/
├── README.md           # 本文档
├── TimeRecord.ts       # 时间记录实体
├── UserConfig.ts       # 用户配置实体
├── Session.ts          # 会话实体
├── DomainEvent.ts      # 领域事件实体
└── index.ts           # 统一导出
```

## 核心实体定义

### TimeRecord - 时间记录实体
代表用户在特定URL上的时间使用记录。

```typescript
interface ITimeRecord {
  id: string;                    // 唯一标识符
  date: string;                  // 记录日期 YYYY-MM-DD
  url: string;                   // 完整URL
  hostname: string;              // 主机名
  parentDomain: string;          // 父域名
  totalOpenTime: number;         // 总打开时间（秒）
  totalActiveTime: number;       // 总活跃时间（秒）
  lastUpdated: Date;            // 最后更新时间
  createdAt: Date;              // 创建时间
}
```

**业务规则**：
- 同一天同一URL只能有一条记录
- 活跃时间不能超过打开时间
- 时间值必须为非负数

### UserConfig - 用户配置实体
代表用户的个人偏好设置和配置信息。

```typescript
interface IUserConfig {
  id: string;                    // 配置ID
  version: string;               // 配置版本
  deviceId: string;              // 设备标识
  retentionPolicy: RetentionPolicy; // 数据保留策略
  uiTheme: UITheme;             // 界面主题
  filterRules: string[];         // 过滤规则
  displayPreferences: DisplayPreferences; // 显示偏好
  lastModified: Date;           // 最后修改时间
  lastSyncTime?: Date;          // 最后同步时间
  createdAt: Date;              // 创建时间
}
```

**业务规则**：
- 每个设备只能有一个活跃配置
- 配置变更必须更新lastModified时间
- 同步冲突时以lastModified最新的为准

### Session - 会话实体
代表用户的浏览会话，包括访问会话和活动会话。

```typescript
interface ISession {
  id: string;                    // 会话ID（visitId或activityId）
  type: SessionType;             // 会话类型
  tabId: number;                // 关联的标签页ID
  url: string;                  // 会话URL
  startTime: Date;              // 开始时间
  endTime?: Date;               // 结束时间
  duration?: number;            // 持续时间（秒）
  isActive: boolean;            // 是否活跃
  checkpoints: Checkpoint[];     // 检查点列表
  createdAt: Date;              // 创建时间
}

enum SessionType {
  VISIT = 'visit',              // 访问会话（打开时间）
  ACTIVITY = 'activity'         // 活动会话（活跃时间）
}

interface Checkpoint {
  timestamp: Date;              // 检查点时间
  duration: number;             // 累积时长
  reason: string;               // 创建原因
}
```

**业务规则**：
- 活动会话必须关联到访问会话
- 会话结束时必须计算总持续时间
- 检查点时间必须在会话时间范围内

### DomainEvent - 领域事件实体
代表系统中发生的重要业务事件。

```typescript
interface IDomainEvent {
  id: string;                    // 事件ID
  type: string;                  // 事件类型
  aggregateId: string;           // 聚合根ID
  aggregateType: string;         // 聚合根类型
  eventData: Record<string, any>; // 事件数据
  metadata: EventMetadata;       // 事件元数据
  timestamp: Date;               // 事件时间
  version: number;               // 事件版本
}

interface EventMetadata {
  source: string;                // 事件来源
  correlationId?: string;        // 关联ID
  causationId?: string;          // 因果ID
  userId?: string;               // 用户ID
}
```

**业务规则**：
- 事件一旦创建不可修改
- 事件必须包含完整的上下文信息
- 事件时间戳必须准确反映发生时间

## 实体工厂模式

### 创建工厂
```typescript
class TimeRecordFactory {
  static create(params: CreateTimeRecordParams): TimeRecord {
    return new TimeRecord({
      id: generateId(),
      date: params.date,
      url: params.url,
      hostname: extractHostname(params.url),
      parentDomain: extractParentDomain(params.url),
      totalOpenTime: 0,
      totalActiveTime: 0,
      lastUpdated: new Date(),
      createdAt: new Date()
    });
  }
}
```

### 重建工厂
```typescript
class TimeRecordFactory {
  static fromDatabase(data: TimeRecordData): TimeRecord {
    return new TimeRecord({
      ...data,
      lastUpdated: new Date(data.lastUpdated),
      createdAt: new Date(data.createdAt)
    });
  }
}
```

## 实体方法设计

### 状态变更方法
```typescript
class TimeRecord {
  addOpenTime(seconds: number): void {
    if (seconds < 0) throw new Error('Time cannot be negative');
    this.totalOpenTime += seconds;
    this.lastUpdated = new Date();
  }
  
  addActiveTime(seconds: number): void {
    if (seconds < 0) throw new Error('Time cannot be negative');
    if (this.totalActiveTime + seconds > this.totalOpenTime) {
      throw new Error('Active time cannot exceed open time');
    }
    this.totalActiveTime += seconds;
    this.lastUpdated = new Date();
  }
}
```

### 查询方法
```typescript
class TimeRecord {
  getEfficiencyRatio(): number {
    return this.totalOpenTime > 0 ? this.totalActiveTime / this.totalOpenTime : 0;
  }
  
  isFromToday(): boolean {
    const today = new Date().toISOString().split('T')[0];
    return this.date === today;
  }
}
```

## 与其他模块的关系
- **使用者**：core/（业务逻辑）、services/（数据访问）
- **依赖**：models/value-objects/（值对象）、shared/types/（基础类型）
