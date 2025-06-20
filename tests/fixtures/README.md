# Test Fixtures 测试工具

## 目录职责
测试工具目录包含测试数据生成器、模拟对象、测试辅助函数和共享的测试资源，为各类测试提供支持。

## 测试工具类型

### 1. 测试数据工厂 (Test Data Factory)
- **数据生成**: 生成各种类型的测试数据
- **数据模板**: 预定义的数据模板和模式
- **随机数据**: 生成随机但有效的测试数据
- **边界数据**: 生成边界条件测试数据

### 2. 模拟对象 (Mock Objects)
- **API模拟**: 模拟外部API和服务
- **数据库模拟**: 模拟数据库操作
- **浏览器API模拟**: 模拟Chrome扩展API
- **网络模拟**: 模拟网络请求和响应

### 3. 测试辅助函数 (Test Helpers)
- **断言辅助**: 自定义断言函数
- **设置辅助**: 测试环境设置函数
- **清理辅助**: 测试后清理函数
- **时间辅助**: 时间相关的测试工具

## 目录结构

```
fixtures/
├── database/                    # 数据库测试工具
│   └── test-data-factory.ts        # 测试数据工厂
├── mocks/                      # 模拟对象
│   ├── chrome-api.ts               # Chrome API模拟
│   ├── database.ts                 # 数据库模拟
│   └── network.ts                  # 网络模拟
├── helpers/                    # 测试辅助函数
│   ├── assertions.ts               # 自定义断言
│   ├── setup.ts                    # 设置辅助
│   └── time.ts                     # 时间辅助
└── data/                       # 静态测试数据
    ├── events.json                 # 事件测试数据
    ├── stats.json                  # 统计测试数据
    └── schemas.json                # Schema测试数据
```

## 测试数据工厂

### 1. 基础数据生成
```typescript
// tests/fixtures/database/test-data-factory.ts
export class TestDataFactory {
  // 生成单个事件
  createEvent(overrides?: Partial<EventsLogSchema>): Omit<EventsLogSchema, 'id'> {
    return {
      timestamp: Date.now(),
      eventType: 'open_time_start',
      tabId: Math.floor(Math.random() * 1000) + 1,
      url: `https://example${Math.floor(Math.random() * 100)}.com`,
      visitId: `visit-${Date.now()}-${Math.random()}`,
      activityId: null,
      isProcessed: 0,
      ...overrides
    };
  }

  // 生成事件批次
  createEvents(count: number): Array<Omit<EventsLogSchema, 'id'>> {
    return Array.from({ length: count }, () => this.createEvent());
  }

  // 生成事件序列
  createEventSequence(visitId: string, activityId: string): Array<Omit<EventsLogSchema, 'id'>> {
    const baseTime = Date.now();
    return [
      this.createEvent({
        timestamp: baseTime,
        eventType: 'open_time_start',
        visitId,
        activityId
      }),
      this.createEvent({
        timestamp: baseTime + 1000,
        eventType: 'active_time_start',
        visitId,
        activityId
      }),
      this.createEvent({
        timestamp: baseTime + 5000,
        eventType: 'active_time_end',
        visitId,
        activityId
      }),
      this.createEvent({
        timestamp: baseTime + 6000,
        eventType: 'open_time_end',
        visitId,
        activityId
      })
    ];
  }
}
```

### 2. 性能测试数据
```typescript
export class PerformanceTestDataFactory extends TestDataFactory {
  // 生成大量性能测试数据
  createPerformanceTestEvents(count: number): Array<Omit<EventsLogSchema, 'id'>> {
    const events = [];
    const baseTime = Date.now() - (count * 1000); // 分散时间
    
    for (let i = 0; i < count; i++) {
      events.push(this.createEvent({
        timestamp: baseTime + (i * 1000),
        tabId: (i % 100) + 1, // 限制tabId范围
        url: `https://perf-test-${i % 50}.com`, // 限制URL数量
        visitId: `perf-visit-${Math.floor(i / 10)}` // 每10个事件一个visit
      }));
    }
    
    return events;
  }

  // 生成内存测试数据
  createMemoryTestData(sizeInMB: number): any[] {
    const itemSize = 1024; // 1KB per item
    const itemCount = (sizeInMB * 1024 * 1024) / itemSize;
    
    return Array.from({ length: itemCount }, (_, i) => ({
      id: i,
      data: 'x'.repeat(itemSize - 50), // 减去其他字段的大小
      timestamp: Date.now() + i
    }));
  }
}
```

### 3. 边界测试数据
```typescript
export class BoundaryTestDataFactory extends TestDataFactory {
  // 生成边界值测试数据
  createBoundaryEvents(): Array<Omit<EventsLogSchema, 'id'>> {
    return [
      // 最小值
      this.createEvent({
        timestamp: 1,
        tabId: 1,
        url: 'https://a.com',
        visitId: 'v'
      }),
      
      // 最大值
      this.createEvent({
        timestamp: Number.MAX_SAFE_INTEGER,
        tabId: Number.MAX_SAFE_INTEGER,
        url: 'https://' + 'a'.repeat(100) + '.com',
        visitId: 'v'.repeat(50)
      }),
      
      // 特殊字符
      this.createEvent({
        url: 'https://测试.com',
        visitId: 'visit-with-特殊字符'
      })
    ];
  }

  // 生成无效数据（用于错误测试）
  createInvalidEvents(): any[] {
    return [
      // 无效时间戳
      { ...this.createEvent(), timestamp: -1 },
      { ...this.createEvent(), timestamp: 'invalid' },
      
      // 无效URL
      { ...this.createEvent(), url: 'invalid-url' },
      { ...this.createEvent(), url: '' },
      
      // 无效visitId
      { ...this.createEvent(), visitId: '' },
      { ...this.createEvent(), visitId: null }
    ];
  }
}
```

## 模拟对象

### 1. Chrome API模拟
```typescript
// tests/fixtures/mocks/chrome-api.ts
export const createChromeMock = () => ({
  storage: {
    sync: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(undefined)
    },
    local: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(undefined)
    }
  },
  
  tabs: {
    query: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(null),
    onActivated: {
      addListener: vi.fn(),
      removeListener: vi.fn()
    },
    onUpdated: {
      addListener: vi.fn(),
      removeListener: vi.fn()
    }
  },
  
  runtime: {
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn()
    },
    sendMessage: vi.fn().mockResolvedValue(undefined)
  }
});
```

### 2. 数据库模拟
```typescript
// tests/fixtures/mocks/database.ts
export const createDatabaseMock = () => {
  const storage = new Map();
  let idCounter = 1;
  
  return {
    events_log: {
      add: vi.fn().mockImplementation(async (data) => {
        const id = idCounter++;
        storage.set(id, { ...data, id });
        return id;
      }),
      
      get: vi.fn().mockImplementation(async (id) => {
        return storage.get(id);
      }),
      
      getAll: vi.fn().mockImplementation(async () => {
        return Array.from(storage.values());
      }),
      
      delete: vi.fn().mockImplementation(async (id) => {
        return storage.delete(id);
      }),
      
      clear: vi.fn().mockImplementation(async () => {
        storage.clear();
      })
    },
    
    aggregated_stats: {
      add: vi.fn(),
      get: vi.fn(),
      getAll: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      clear: vi.fn()
    }
  };
};
```

## 测试辅助函数

### 1. 自定义断言
```typescript
// tests/fixtures/helpers/assertions.ts
export const customAssertions = {
  // 验证事件对象结构
  toBeValidEvent(received: any) {
    const requiredFields = ['timestamp', 'eventType', 'tabId', 'url', 'visitId'];
    const missingFields = requiredFields.filter(field => !(field in received));
    
    if (missingFields.length > 0) {
      return {
        message: () => `Expected valid event, missing fields: ${missingFields.join(', ')}`,
        pass: false
      };
    }
    
    return {
      message: () => 'Expected invalid event',
      pass: true
    };
  },

  // 验证时间范围
  toBeWithinTimeRange(received: number, start: number, end: number) {
    const pass = received >= start && received <= end;
    
    return {
      message: () => pass 
        ? `Expected ${received} not to be within ${start}-${end}`
        : `Expected ${received} to be within ${start}-${end}`,
      pass
    };
  },

  // 验证URL格式
  toBeValidUrl(received: string) {
    try {
      new URL(received);
      return {
        message: () => `Expected ${received} not to be a valid URL`,
        pass: true
      };
    } catch {
      return {
        message: () => `Expected ${received} to be a valid URL`,
        pass: false
      };
    }
  }
};

// 扩展expect
declare global {
  namespace Vi {
    interface Assertion<T = any> {
      toBeValidEvent(): T;
      toBeWithinTimeRange(start: number, end: number): T;
      toBeValidUrl(): T;
    }
  }
}
```

### 2. 设置辅助函数
```typescript
// tests/fixtures/helpers/setup.ts
export class TestSetupHelper {
  private cleanupTasks: (() => Promise<void>)[] = [];
  
  // 设置测试数据库
  async setupTestDatabase(): Promise<WebTimeDatabase> {
    const db = new WebTimeDatabase();
    await db.open();
    
    this.addCleanupTask(async () => {
      await db.delete();
      await db.close();
    });
    
    return db;
  }
  
  // 设置测试数据
  async setupTestData(db: WebTimeDatabase, eventCount: number = 10) {
    const factory = new TestDataFactory();
    const events = factory.createEvents(eventCount);
    
    const eventRepo = new EventRepository(db);
    await eventRepo.createBatch(events);
    
    return events;
  }
  
  // 添加清理任务
  addCleanupTask(task: () => Promise<void>) {
    this.cleanupTasks.push(task);
  }
  
  // 执行清理
  async cleanup() {
    for (const task of this.cleanupTasks.reverse()) {
      await task();
    }
    this.cleanupTasks = [];
  }
}
```

### 3. 时间辅助函数
```typescript
// tests/fixtures/helpers/time.ts
export class TimeTestHelper {
  private originalDate = Date;
  private mockTime: number | null = null;
  
  // 设置固定时间
  setFixedTime(timestamp: number) {
    this.mockTime = timestamp;
    global.Date = class extends Date {
      constructor(...args: any[]) {
        if (args.length === 0) {
          super(timestamp);
        } else {
          super(...args);
        }
      }
      
      static now() {
        return timestamp;
      }
    } as any;
  }
  
  // 前进时间
  advanceTime(milliseconds: number) {
    if (this.mockTime !== null) {
      this.mockTime += milliseconds;
      this.setFixedTime(this.mockTime);
    }
  }
  
  // 恢复真实时间
  restoreTime() {
    global.Date = this.originalDate;
    this.mockTime = null;
  }
  
  // 生成时间序列
  generateTimeSequence(start: number, count: number, interval: number): number[] {
    return Array.from({ length: count }, (_, i) => start + (i * interval));
  }
}
```

## 静态测试数据

### 1. 事件测试数据
```json
// tests/fixtures/data/events.json
{
  "validEvents": [
    {
      "timestamp": 1640995200000,
      "eventType": "open_time_start",
      "tabId": 123,
      "url": "https://example.com",
      "visitId": "visit-1",
      "activityId": null,
      "isProcessed": 0
    }
  ],
  
  "invalidEvents": [
    {
      "timestamp": -1,
      "eventType": "open_time_start",
      "tabId": 123,
      "url": "invalid-url",
      "visitId": "",
      "activityId": null,
      "isProcessed": 0
    }
  ]
}
```

## 使用示例

### 1. 在单元测试中使用
```typescript
import { TestDataFactory } from '../fixtures/database/test-data-factory';
import { customAssertions } from '../fixtures/helpers/assertions';

// 扩展断言
expect.extend(customAssertions);

describe('EventRepository', () => {
  let factory: TestDataFactory;
  
  beforeEach(() => {
    factory = new TestDataFactory();
  });
  
  it('应该创建有效事件', async () => {
    const event = factory.createEvent();
    expect(event).toBeValidEvent();
    
    const result = await repository.create(event);
    expect(result).toBeTypeOf('number');
  });
});
```

### 2. 在集成测试中使用
```typescript
import { TestSetupHelper } from '../fixtures/helpers/setup';

describe('数据库集成测试', () => {
  let setupHelper: TestSetupHelper;
  
  beforeEach(() => {
    setupHelper = new TestSetupHelper();
  });
  
  afterEach(async () => {
    await setupHelper.cleanup();
  });
  
  it('应该处理完整数据流', async () => {
    const db = await setupHelper.setupTestDatabase();
    const events = await setupHelper.setupTestData(db, 100);
    
    // 执行测试...
  });
});
```

## 最佳实践

### 1. 数据生成原则
- **确定性**: 相同参数生成相同数据
- **多样性**: 生成多种类型的测试数据
- **真实性**: 数据应该接近真实使用场景
- **可控性**: 能够精确控制生成的数据

### 2. 模拟对象原则
- **最小化**: 只模拟必要的功能
- **一致性**: 模拟行为应该与真实对象一致
- **可验证**: 能够验证模拟对象的调用
- **可重置**: 能够重置模拟对象的状态

### 3. 辅助函数原则
- **单一职责**: 每个函数只做一件事
- **可复用**: 能够在多个测试中复用
- **易理解**: 函数名和参数应该清晰明了
- **错误处理**: 应该有适当的错误处理

## 与其他测试的关系
- **所有测试类型**: 为单元、集成、边界、性能测试提供支持
- **测试数据管理**: 统一管理所有测试数据
- **测试环境**: 提供一致的测试环境设置
- **测试工具**: 提供通用的测试工具和辅助函数
