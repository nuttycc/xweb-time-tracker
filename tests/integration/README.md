# Integration Tests 集成测试

## 目录职责
集成测试目录包含多个组件协同工作的测试，验证系统各部分之间的交互和数据流。

## 测试原则

### 集成测试特征
- **组件协作**: 测试多个组件之间的交互
- **数据流验证**: 确保数据在组件间正确传递
- **接口测试**: 验证组件间的接口契约
- **端到端场景**: 模拟真实的业务流程

### 测试范围
- 数据库与Repository层集成
- 服务层组件协作
- 业务流程完整性
- 错误传播和处理
- 事务一致性

## 目录结构

```
integration/
├── database/              # 数据库集成测试
│   └── test-suite.test.ts     # 数据库组件集成测试
├── workflows/             # 业务流程集成测试
├── api/                   # API集成测试
└── services/              # 服务层集成测试
```

## 运行集成测试

```bash
# 运行所有集成测试
npm run test:integration

# 运行数据库集成测试
npm run test:integration -- tests/integration/database

# 运行特定测试文件
npm run test:integration -- tests/integration/database/test-suite.test.ts

# 详细输出模式
npm run test:integration -- --reporter=verbose
```

## 测试场景

### 1. 数据库集成测试
- **完整数据流**: 事件创建 → 处理 → 聚合 → 查询
- **并发操作**: 多个Repository同时操作
- **事务管理**: 跨表操作的一致性
- **错误恢复**: 异常情况下的数据完整性

### 2. 业务流程集成
- **时间追踪流程**: 开始追踪 → 活动记录 → 结束追踪 → 数据聚合
- **配置同步流程**: 配置变更 → 验证 → 持久化 → 通知
- **数据清理流程**: 过期数据识别 → 备份 → 删除 → 验证

### 3. 服务层集成
- **Chrome API集成**: 扩展API与业务逻辑集成
- **消息传递**: 不同上下文间的消息通信
- **事件总线**: 组件间的事件发布订阅

## 编写规范

### 测试文件结构
```typescript
describe('组件集成测试', () => {
  let component1: Component1;
  let component2: Component2;
  
  beforeEach(async () => {
    // 初始化所有相关组件
    component1 = new Component1();
    component2 = new Component2(component1);
    await setupIntegrationEnvironment();
  });
  
  afterEach(async () => {
    // 清理集成环境
    await cleanupIntegrationEnvironment();
  });
  
  describe('业务流程测试', () => {
    it('应该完成完整的业务流程', async () => {
      // 测试完整的业务场景
    });
  });
});
```

### 测试数据管理
```typescript
// 使用真实的数据结构
const testData = {
  events: [
    { /* 完整的事件数据 */ },
    { /* 相关的事件数据 */ }
  ],
  expectedStats: {
    /* 期望的聚合结果 */
  }
};

// 验证数据流转
const result = await processEvents(testData.events);
expect(result).toMatchObject(testData.expectedStats);
```

## 测试环境设置

### 1. 数据库环境
```typescript
beforeEach(async () => {
  // 创建干净的测试数据库
  db = new WebTimeDatabase();
  await db.open();
  
  // 初始化所有Repository
  eventRepo = new EventRepository(db);
  statsRepo = new StatsRepository(db);
  
  // 设置测试数据
  await seedTestData();
});
```

### 2. 模拟环境
```typescript
// 模拟Chrome API
global.chrome = {
  tabs: mockTabs,
  storage: mockStorage,
  runtime: mockRuntime
};

// 模拟时间
vi.useFakeTimers();
vi.setSystemTime(new Date('2024-01-01'));
```

### 3. 网络模拟
```typescript
// 模拟网络请求
const mockFetch = vi.fn()
  .mockResolvedValueOnce(successResponse)
  .mockRejectedValueOnce(networkError);

global.fetch = mockFetch;
```

## 最佳实践

### 1. 测试隔离
```typescript
// ✅ 每个测试独立的环境
beforeEach(async () => {
  await resetDatabase();
  await clearCache();
  vi.clearAllMocks();
});

// ❌ 避免测试间的依赖
it('test 1', () => { /* 修改全局状态 */ });
it('test 2', () => { /* 依赖test 1的状态 */ });
```

### 2. 真实场景模拟
```typescript
// ✅ 模拟真实的用户操作序列
it('应该处理用户访问网站的完整流程', async () => {
  // 1. 用户打开新标签页
  const tabId = await simulateTabOpen('https://example.com');
  
  // 2. 开始时间追踪
  await timeTracker.startTracking(tabId);
  
  // 3. 用户活动
  await simulateUserActivity(tabId, 5000);
  
  // 4. 结束追踪
  await timeTracker.stopTracking(tabId);
  
  // 5. 验证数据
  const stats = await getTimeStats('example.com');
  expect(stats.totalTime).toBeGreaterThan(5000);
});
```

### 3. 错误场景测试
```typescript
it('应该处理数据库连接失败的情况', async () => {
  // 模拟数据库连接失败
  vi.mocked(db.open).mockRejectedValue(new Error('Connection failed'));
  
  // 验证错误处理
  await expect(dataService.initialize()).rejects.toThrow('Connection failed');
  
  // 验证恢复机制
  vi.mocked(db.open).mockResolvedValue(undefined);
  await expect(dataService.retry()).resolves.not.toThrow();
});
```

### 4. 性能验证
```typescript
it('应该在合理时间内完成大量数据处理', async () => {
  const startTime = performance.now();
  
  // 处理大量数据
  await processLargeDataset(1000);
  
  const endTime = performance.now();
  const duration = endTime - startTime;
  
  // 验证性能要求
  expect(duration).toBeLessThan(5000); // 5秒内完成
});
```

## 常见问题

### 1. 异步操作同步
```typescript
// ✅ 正确等待异步操作
it('应该等待所有异步操作完成', async () => {
  const promises = [
    operation1(),
    operation2(),
    operation3()
  ];
  
  const results = await Promise.all(promises);
  expect(results).toHaveLength(3);
});
```

### 2. 事件时序
```typescript
// ✅ 确保事件按正确顺序发生
it('应该按正确顺序处理事件', async () => {
  const events = [];
  
  eventBus.on('event1', () => events.push('event1'));
  eventBus.on('event2', () => events.push('event2'));
  
  await triggerWorkflow();
  
  expect(events).toEqual(['event1', 'event2']);
});
```

### 3. 资源清理
```typescript
afterEach(async () => {
  // 清理数据库
  await db.delete();
  await db.close();
  
  // 清理定时器
  vi.clearAllTimers();
  
  // 清理事件监听器
  eventBus.removeAllListeners();
  
  // 恢复模拟
  vi.restoreAllMocks();
});
```

## 调试技巧

### 1. 详细日志
```typescript
// 启用详细日志
process.env.DEBUG = 'app:*';

// 在测试中添加日志
console.log('Test state:', { events, stats, errors });
```

### 2. 断点调试
```typescript
// 在关键点设置断点
it('调试测试', async () => {
  const result = await complexOperation();
  debugger; // 在浏览器开发工具中暂停
  expect(result).toBeDefined();
});
```

### 3. 快照测试
```typescript
// 使用快照验证复杂对象
expect(complexResult).toMatchSnapshot();
```

## 与其他测试的关系
- **单元测试**: 集成测试基于通过的单元测试
- **边界测试**: 集成测试覆盖正常流程，边界测试覆盖异常流程
- **性能测试**: 集成测试验证功能，性能测试验证效率
- **E2E测试**: 集成测试验证组件协作，E2E测试验证用户体验
