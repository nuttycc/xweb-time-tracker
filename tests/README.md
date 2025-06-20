# Tests 测试目录

## 目录职责
Tests目录包含应用的所有测试代码，采用分层测试策略，确保代码质量和功能正确性。

## 测试分层策略

### 单元测试 (Unit Tests)
测试单个函数、类或组件的功能，确保最小单元的正确性。

### 集成测试 (Integration Tests)
测试模块间的交互和协作，确保系统各部分能够正确集成。

### 端到端测试 (E2E Tests)
测试完整的用户场景，确保整个应用的功能符合预期。

## 目录结构
```
tests/
├── README.md           # 本文档
├── unit/               # 单元测试
│   ├── core/          # 业务逻辑测试
│   ├── services/      # 服务层测试
│   ├── models/        # 模型层测试
│   └── shared/        # 共享层测试
├── integration/        # 集成测试
│   ├── database/      # 数据库集成测试
│   ├── chrome-api/    # Chrome API集成测试
│   └── workflows/     # 业务流程集成测试
├── e2e/               # 端到端测试
│   ├── tracking/      # 时间追踪E2E测试
│   ├── sync/          # 配置同步E2E测试
│   └── ui/            # 用户界面E2E测试
└── fixtures/          # 测试数据和Mock
    ├── data/          # 测试数据
    ├── mocks/         # Mock对象
    └── helpers/       # 测试辅助工具
```

## 测试技术栈

### 测试框架
- **Vitest**: 现代化的测试框架，支持TypeScript和ES模块
- **Vue Test Utils**: Vue组件测试工具
- **Playwright**: 端到端测试框架

### 断言库
- **Vitest内置断言**: 提供丰富的断言方法
- **Testing Library**: 用户行为导向的测试工具

### Mock工具
- **Vitest Mock**: 内置的Mock功能
- **MSW**: API Mock服务
- **Chrome Extension Mock**: Chrome API的Mock实现

## 测试规范

### 命名规范
```typescript
// 测试文件命名
core/tracking/engine.test.ts
services/database/indexeddb.test.ts
models/entities/TimeRecord.test.ts

// 测试用例命名
describe('TimeTrackingEngine', () => {
  describe('startTracking', () => {
    it('should create visit session when tab becomes active', () => {
      // 测试实现
    });
    
    it('should ignore events from non-focus tabs', () => {
      // 测试实现
    });
  });
});
```

### 测试结构
```typescript
// AAA模式：Arrange, Act, Assert
it('should calculate correct duration', () => {
  // Arrange - 准备测试数据
  const startTime = new Date('2024-01-01T10:00:00Z');
  const endTime = new Date('2024-01-01T10:30:00Z');
  
  // Act - 执行被测试的操作
  const duration = calculateDuration(startTime, endTime);
  
  // Assert - 验证结果
  expect(duration).toBe(1800); // 30分钟 = 1800秒
});
```

## 单元测试指南

### Core层测试
```typescript
// core/tracking/engine.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TimeTrackingEngine } from '@/core/tracking/engine';
import { MockChromeAPI } from '@tests/fixtures/mocks/chrome-api';

describe('TimeTrackingEngine', () => {
  let engine: TimeTrackingEngine;
  let mockChromeAPI: MockChromeAPI;
  
  beforeEach(() => {
    mockChromeAPI = new MockChromeAPI();
    engine = new TimeTrackingEngine(mockChromeAPI);
  });
  
  describe('focus validation', () => {
    it('should only track events from active tab', async () => {
      // 设置活跃标签页
      mockChromeAPI.setActiveTab({ id: 123, url: 'https://example.com' });
      
      // 测试来自活跃标签页的事件
      const result = await engine.handleTabInteraction(123);
      expect(result).toBeTruthy();
      
      // 测试来自非活跃标签页的事件
      const result2 = await engine.handleTabInteraction(456);
      expect(result2).toBeFalsy();
    });
  });
});
```

### Services层测试
```typescript
// services/database/indexeddb.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { IndexedDBService } from '@/services/database/indexeddb';
import { createTestDatabase } from '@tests/fixtures/helpers/database';

describe('IndexedDBService', () => {
  let dbService: IndexedDBService;
  let testDB: IDBDatabase;
  
  beforeEach(async () => {
    testDB = await createTestDatabase();
    dbService = new IndexedDBService(testDB);
  });
  
  afterEach(async () => {
    await dbService.close();
    testDB.close();
  });
  
  describe('event insertion', () => {
    it('should insert event and return generated ID', async () => {
      const event = {
        timestamp: Date.now(),
        eventType: 'open_time_start',
        tabId: 123,
        url: 'https://example.com',
        visitId: 'visit-123',
        activityId: null,
        isProcessed: 0
      };
      
      const id = await dbService.insertEvent(event);
      expect(id).toBeTypeOf('number');
      expect(id).toBeGreaterThan(0);
    });
  });
});
```

## 集成测试指南

### 数据库集成测试
```typescript
// integration/database/aggregation.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { DataAggregator } from '@/core/analytics/aggregator';
import { IndexedDBService } from '@/services/database/indexeddb';
import { createTestDatabase, seedTestData } from '@tests/fixtures/helpers/database';

describe('Data Aggregation Integration', () => {
  let aggregator: DataAggregator;
  let dbService: IndexedDBService;
  
  beforeEach(async () => {
    const testDB = await createTestDatabase();
    dbService = new IndexedDBService(testDB);
    aggregator = new DataAggregator(dbService);
    
    // 插入测试数据
    await seedTestData(dbService);
  });
  
  it('should aggregate events into daily statistics', async () => {
    await aggregator.processUnprocessedEvents();
    
    const stats = await dbService.getStatsByDate('2024-01-01');
    expect(stats).toHaveLength(2); // 预期有2个URL的统计
    expect(stats[0].total_open_time).toBeGreaterThan(0);
    expect(stats[0].total_active_time).toBeLessThanOrEqual(stats[0].total_open_time);
  });
});
```

### Chrome API集成测试
```typescript
// integration/chrome-api/tabs.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { TabsService } from '@/services/chrome-api/tabs';
import { MockChrome } from '@tests/fixtures/mocks/chrome';

describe('Tabs Service Integration', () => {
  let tabsService: TabsService;
  let mockChrome: MockChrome;
  
  beforeEach(() => {
    mockChrome = new MockChrome();
    global.chrome = mockChrome;
    tabsService = new TabsService();
  });
  
  it('should handle tab activation events', async () => {
    const events: any[] = [];
    
    tabsService.onTabActivated((activeInfo) => {
      events.push(activeInfo);
    });
    
    // 模拟标签页激活
    mockChrome.tabs.triggerActivated({ tabId: 123, windowId: 1 });
    
    expect(events).toHaveLength(1);
    expect(events[0].tabId).toBe(123);
  });
});
```

## E2E测试指南

### 时间追踪E2E测试
```typescript
// e2e/tracking/basic-tracking.test.ts
import { test, expect } from '@playwright/test';

test.describe('Basic Time Tracking', () => {
  test('should track time when user visits a page', async ({ page, context }) => {
    // 加载扩展
    const extensionId = await loadExtension(context);
    
    // 访问测试页面
    await page.goto('https://example.com');
    await page.waitForTimeout(5000); // 等待5秒
    
    // 打开扩展弹窗
    const popup = await openExtensionPopup(context, extensionId);
    
    // 验证时间记录
    const timeDisplay = popup.locator('[data-testid="current-time"]');
    await expect(timeDisplay).toContainText('5秒');
    
    // 切换到其他标签页
    const newPage = await context.newPage();
    await newPage.goto('https://google.com');
    await newPage.waitForTimeout(3000);
    
    // 验证时间停止增长
    await popup.reload();
    const finalTime = popup.locator('[data-testid="current-time"]');
    await expect(finalTime).toContainText('5秒'); // 时间应该停止在5秒
  });
});
```

## 测试数据管理

### 测试数据工厂
```typescript
// fixtures/helpers/data-factory.ts
export class TestDataFactory {
  static createEventLog(overrides: Partial<EventLogRecord> = {}): EventLogRecord {
    return {
      timestamp: Date.now(),
      eventType: 'open_time_start',
      tabId: 123,
      url: 'https://example.com',
      visitId: 'visit-' + Math.random().toString(36),
      activityId: null,
      isProcessed: 0,
      ...overrides
    };
  }
  
  static createTimeRecord(overrides: Partial<TimeRecord> = {}): TimeRecord {
    return {
      id: 'record-' + Math.random().toString(36),
      date: '2024-01-01',
      url: 'https://example.com',
      hostname: 'example.com',
      parentDomain: 'example.com',
      totalOpenTime: 300,
      totalActiveTime: 180,
      lastUpdated: new Date(),
      createdAt: new Date(),
      ...overrides
    };
  }
}
```

### Mock对象
```typescript
// fixtures/mocks/chrome-api.ts
export class MockChromeAPI {
  private activeTab: chrome.tabs.Tab | null = null;
  private tabs: Map<number, chrome.tabs.Tab> = new Map();
  
  setActiveTab(tab: chrome.tabs.Tab): void {
    this.activeTab = tab;
    this.tabs.set(tab.id!, tab);
  }
  
  async getActiveTab(): Promise<chrome.tabs.Tab | null> {
    return this.activeTab;
  }
  
  async queryTabs(queryInfo: chrome.tabs.QueryInfo): Promise<chrome.tabs.Tab[]> {
    if (queryInfo.active && queryInfo.lastFocusedWindow) {
      return this.activeTab ? [this.activeTab] : [];
    }
    return Array.from(this.tabs.values());
  }
}
```

## 测试配置

### Vitest配置
```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.d.ts',
        '**/*.config.*'
      ]
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@tests': path.resolve(__dirname, './tests')
    }
  }
});
```

## 持续集成

### GitHub Actions配置
```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run test:unit
      - run: npm run test:integration
      - run: npm run test:e2e
      - run: npm run coverage
```

## 与其他模块的关系
- **测试对象**：所有应用模块（core/、services/、models/、entrypoints/）
- **依赖**：测试框架、Mock工具、测试数据
- **输出**：测试报告、覆盖率报告、质量指标
