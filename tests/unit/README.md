# Unit Tests 单元测试

## 目录职责
单元测试目录包含对单个组件、函数或类的独立测试，确保每个最小单元的功能正确性。

## 测试原则

### 单元测试特征
- **独立性**: 每个测试独立运行，不依赖其他测试
- **快速性**: 执行速度快，通常在毫秒级别
- **确定性**: 相同输入总是产生相同输出
- **单一职责**: 每个测试只验证一个功能点

### 测试范围
- 函数逻辑正确性
- 类方法行为验证
- 边界值处理
- 错误处理机制
- 数据转换和计算

## 目录结构

```
unit/
├── database/           # 数据库层单元测试
│   ├── schemas.test.ts         # Schema定义和验证
│   ├── db-manager.test.ts      # 数据库管理器
│   ├── event-repository.test.ts # 事件仓库
│   ├── stats-repository.test.ts # 统计仓库
│   └── error-handler.test.ts   # 错误处理器
├── core/              # 核心业务逻辑测试
├── services/          # 服务层测试
├── models/            # 模型层测试
└── shared/            # 共享组件测试
```

## 运行单元测试

```bash
# 运行所有单元测试
npm run test:unit

# 运行数据库单元测试
npm run test:unit -- tests/unit/database

# 运行特定测试文件
npm run test:unit -- tests/unit/database/schemas.test.ts

# 监视模式运行
npm run test:unit -- --watch
```

## 编写规范

### 测试文件命名
- 文件名: `[模块名].test.ts`
- 测试描述: 使用中文描述测试场景
- 测试分组: 使用 `describe` 按功能分组

### 测试结构
```typescript
describe('模块名', () => {
  describe('功能分组', () => {
    it('应该[期望行为]', () => {
      // Arrange - 准备测试数据
      // Act - 执行被测试的操作
      // Assert - 验证结果
    });
  });
});
```

### Mock和Stub
- 使用 `vi.fn()` 创建模拟函数
- 使用 `vi.mock()` 模拟模块
- 避免真实的外部依赖（数据库、网络等）

## 最佳实践

### 1. 测试命名
```typescript
// ✅ 好的命名
it('应该在输入有效数据时创建事件记录', () => {});
it('应该在URL无效时抛出验证错误', () => {});

// ❌ 避免的命名
it('test create event', () => {});
it('should work', () => {});
```

### 2. 测试数据
```typescript
// ✅ 使用明确的测试数据
const validEvent = {
  timestamp: 1640995200000, // 2022-01-01 00:00:00
  eventType: 'open_time_start',
  tabId: 123,
  url: 'https://example.com'
};

// ❌ 避免随机或不明确的数据
const event = { timestamp: Date.now(), ... };
```

### 3. 断言
```typescript
// ✅ 具体的断言
expect(result.id).toBeTypeOf('number');
expect(result.id).toBeGreaterThan(0);
expect(result.eventType).toBe('open_time_start');

// ❌ 模糊的断言
expect(result).toBeTruthy();
expect(result).toBeDefined();
```

### 4. 测试隔离
```typescript
describe('EventRepository', () => {
  let repository: EventRepository;
  
  beforeEach(() => {
    // 每个测试前重新初始化
    repository = new EventRepository(mockDb);
  });
  
  afterEach(() => {
    // 清理测试数据
    vi.clearAllMocks();
  });
});
```

## 覆盖率要求

### 目标覆盖率
- **行覆盖率**: ≥ 90%
- **分支覆盖率**: ≥ 85%
- **函数覆盖率**: ≥ 90%
- **语句覆盖率**: ≥ 90%

### 覆盖率检查
```bash
# 生成覆盖率报告
npm run test:coverage -- tests/unit

# 查看详细报告
open coverage/index.html
```

## 常见问题

### 1. 异步测试
```typescript
// ✅ 正确的异步测试
it('应该异步创建事件', async () => {
  const result = await repository.create(event);
  expect(result).toBeTypeOf('number');
});

// ✅ Promise测试
it('应该返回Promise', () => {
  return expect(repository.create(event)).resolves.toBeTypeOf('number');
});
```

### 2. 错误测试
```typescript
// ✅ 测试异常情况
it('应该在无效输入时抛出错误', async () => {
  await expect(repository.create(invalidEvent)).rejects.toThrow('Invalid URL');
});
```

### 3. 模拟依赖
```typescript
// ✅ 模拟外部依赖
const mockDb = {
  events_log: {
    add: vi.fn().mockResolvedValue(1),
    get: vi.fn().mockResolvedValue(mockEvent)
  }
};
```

## 与其他测试的关系
- **集成测试**: 单元测试通过后进行集成测试
- **边界测试**: 单元测试覆盖正常情况，边界测试覆盖极限情况
- **性能测试**: 单元测试确保功能正确，性能测试确保效率
