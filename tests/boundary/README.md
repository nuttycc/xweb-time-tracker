# Boundary Tests 边界测试

## 目录职责
边界测试目录包含极限条件、边界值和异常场景的测试，确保系统在各种边界情况下的稳定性和正确性。

## 测试原则

### 边界测试特征
- **极限值测试**: 测试最大值、最小值、零值
- **边界条件**: 测试临界点和边界值
- **异常输入**: 测试无效、恶意、异常输入
- **资源限制**: 测试内存、存储、网络限制
- **并发边界**: 测试高并发和竞态条件

### 测试范围
- 数据验证边界
- 资源使用限制
- 并发操作边界
- 错误处理边界
- 系统容量限制

## 目录结构

```
boundary/
├── database/                    # 数据库边界测试
│   └── boundary-conditions.test.ts # 边界条件测试
├── validation/                  # 数据验证边界测试
├── resources/                   # 资源限制测试
├── concurrency/                # 并发边界测试
└── security/                   # 安全边界测试
```

## 运行边界测试

```bash
# 运行所有边界测试
npm run test:boundary

# 运行数据库边界测试
npm run test:boundary -- tests/boundary/database

# 运行特定测试文件
npm run test:boundary -- tests/boundary/database/boundary-conditions.test.ts

# 详细输出模式
npm run test:boundary -- --reporter=verbose
```

## 边界测试类型

### 1. 数据边界测试
```typescript
describe('数据边界测试', () => {
  it('应该处理最小有效值', async () => {
    const minimalData = {
      timestamp: 1,              // 最小时间戳
      tabId: 1,                 // 最小tabId
      url: 'https://a.com',     // 最短有效URL
      visitId: 'v'              // 最短visitId
    };
    
    const result = await repository.create(minimalData);
    expect(result).toBeTypeOf('number');
  });

  it('应该处理最大有效值', async () => {
    const maximalData = {
      timestamp: Number.MAX_SAFE_INTEGER,
      tabId: Number.MAX_SAFE_INTEGER,
      url: 'https://' + 'a'.repeat(2000) + '.com', // 长URL
      visitId: 'v'.repeat(100)                      // 长visitId
    };
    
    const result = await repository.create(maximalData);
    expect(result).toBeTypeOf('number');
  });

  it('应该拒绝超出边界的值', async () => {
    const invalidData = {
      timestamp: -1,            // 负数时间戳
      tabId: -1,               // 负数tabId
      url: 'invalid-url',      // 无效URL
      visitId: ''              // 空visitId
    };
    
    await expect(repository.create(invalidData)).rejects.toThrow();
  });
});
```

### 2. 容量边界测试
```typescript
describe('容量边界测试', () => {
  it('应该处理大量数据', async () => {
    const largeDataset = Array.from({ length: 10000 }, (_, i) => ({
      timestamp: Date.now() + i,
      eventType: 'checkpoint',
      tabId: i + 1,
      url: `https://example${i}.com`,
      visitId: `visit-${i}`,
      activityId: null,
      isProcessed: 0
    }));
    
    const result = await repository.createBatch(largeDataset);
    expect(result.successCount).toBeGreaterThan(9900); // 允许少量失败
  });

  it('应该处理空数据集', async () => {
    const emptyResult = await repository.createBatch([]);
    expect(emptyResult.successCount).toBe(0);
    expect(emptyResult.failureCount).toBe(0);
  });

  it('应该处理单条记录', async () => {
    const singleRecord = [{
      timestamp: Date.now(),
      eventType: 'checkpoint',
      tabId: 1,
      url: 'https://single.com',
      visitId: 'single-visit',
      activityId: null,
      isProcessed: 0
    }];
    
    const result = await repository.createBatch(singleRecord);
    expect(result.successCount).toBe(1);
  });
});
```

### 3. 并发边界测试
```typescript
describe('并发边界测试', () => {
  it('应该处理高并发读操作', async () => {
    // 先创建测试数据
    await setupTestData(1000);
    
    // 100个并发读操作
    const concurrentReads = Array.from({ length: 100 }, () => 
      repository.query({ limit: 10 })
    );
    
    const results = await Promise.allSettled(concurrentReads);
    const successCount = results.filter(r => r.status === 'fulfilled').length;
    
    expect(successCount).toBeGreaterThan(95); // 95%成功率
  });

  it('应该处理并发写操作', async () => {
    const concurrentWrites = Array.from({ length: 50 }, (_, i) => 
      repository.create({
        timestamp: Date.now() + i,
        eventType: 'checkpoint',
        tabId: i + 1,
        url: `https://concurrent${i}.com`,
        visitId: `concurrent-${i}`,
        activityId: null,
        isProcessed: 0
      })
    );
    
    const results = await Promise.allSettled(concurrentWrites);
    const successCount = results.filter(r => r.status === 'fulfilled').length;
    
    expect(successCount).toBeGreaterThan(45); // 90%成功率
  });

  it('应该处理读写混合操作', async () => {
    const operations = [];
    
    // 混合读写操作
    for (let i = 0; i < 100; i++) {
      if (i % 3 === 0) {
        // 写操作
        operations.push(repository.create(generateTestEvent()));
      } else {
        // 读操作
        operations.push(repository.query({ limit: 5 }));
      }
    }
    
    const results = await Promise.allSettled(operations);
    const successCount = results.filter(r => r.status === 'fulfilled').length;
    
    expect(successCount).toBeGreaterThan(90); // 90%成功率
  });
});
```

### 4. 内存边界测试
```typescript
describe('内存边界测试', () => {
  it('应该处理内存密集型操作', async () => {
    const initialMemory = process.memoryUsage().heapUsed;
    
    // 分批处理大量数据，避免内存溢出
    const batchSize = 1000;
    const totalBatches = 10;
    
    for (let batch = 0; batch < totalBatches; batch++) {
      const events = generateTestEvents(batchSize);
      await repository.createBatch(events);
      
      // 检查内存使用
      const currentMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = currentMemory - initialMemory;
      
      // 内存增长应该在合理范围内
      expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024); // 100MB
    }
  });

  it('应该正确释放内存', async () => {
    const initialMemory = process.memoryUsage().heapUsed;
    
    // 创建大量临时对象
    for (let i = 0; i < 1000; i++) {
      const largeObject = new Array(1000).fill(0).map(() => ({
        data: new Array(100).fill('test data')
      }));
      
      // 使用对象
      await processLargeObject(largeObject);
    }
    
    // 强制垃圾回收
    if (global.gc) {
      global.gc();
    }
    
    // 等待垃圾回收完成
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const finalMemory = process.memoryUsage().heapUsed;
    const memoryIncrease = finalMemory - initialMemory;
    
    // 内存应该基本回到初始状态
    expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024); // 10MB容差
  });
});
```

### 5. 错误边界测试
```typescript
describe('错误边界测试', () => {
  it('应该处理数据库连接失败', async () => {
    // 模拟数据库连接失败
    const failingDb = {
      ...db,
      transaction: vi.fn().mockRejectedValue(new Error('Connection lost'))
    };
    
    const failingRepo = new EventRepository(failingDb);
    
    await expect(failingRepo.create(validEvent)).rejects.toThrow('Connection lost');
  });

  it('应该处理磁盘空间不足', async () => {
    // 模拟磁盘空间不足
    vi.mocked(db.events_log.add).mockRejectedValue(
      new Error('QuotaExceededError')
    );
    
    await expect(repository.create(validEvent)).rejects.toThrow('QuotaExceededError');
  });

  it('应该处理网络超时', async () => {
    // 模拟网络超时
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Network timeout')), 100);
    });
    
    vi.mocked(repository.create).mockReturnValue(timeoutPromise);
    
    await expect(repository.create(validEvent)).rejects.toThrow('Network timeout');
  });

  it('应该处理恶意输入', async () => {
    const maliciousInputs = [
      { url: 'javascript:alert("xss")' },
      { visitId: '<script>alert("xss")</script>' },
      { url: 'data:text/html,<script>alert("xss")</script>' },
      { visitId: '../../etc/passwd' },
      { url: 'file:///etc/passwd' }
    ];
    
    for (const maliciousInput of maliciousInputs) {
      const maliciousEvent = { ...validEvent, ...maliciousInput };
      await expect(repository.create(maliciousEvent)).rejects.toThrow();
    }
  });
});
```

## 边界值分析

### 1. 等价类划分
```typescript
// 有效等价类
const validInputs = [
  { timestamp: 1640995200000 },      // 正常时间戳
  { tabId: 1 },                      // 最小有效tabId
  { tabId: 999999 },                 // 大tabId
  { url: 'https://example.com' },    // 标准URL
  { visitId: 'visit-123' }           // 标准visitId
];

// 无效等价类
const invalidInputs = [
  { timestamp: -1 },                 // 负数时间戳
  { timestamp: 'invalid' },          // 非数字时间戳
  { tabId: 0 },                      // 零tabId
  { tabId: -1 },                     // 负数tabId
  { url: 'invalid-url' },            // 无效URL
  { url: '' },                       // 空URL
  { visitId: '' },                   // 空visitId
  { visitId: null }                  // null visitId
];
```

### 2. 边界值测试
```typescript
const boundaryValues = {
  timestamp: [
    1,                              // 最小值
    Number.MAX_SAFE_INTEGER,        // 最大值
    Date.now(),                     // 当前时间
    0,                              // 边界值
    -1                              // 无效边界
  ],
  
  stringLength: [
    '',                             // 空字符串
    'a',                            // 单字符
    'a'.repeat(255),                // 标准长度
    'a'.repeat(256),                // 超长字符串
    'a'.repeat(1000)                // 极长字符串
  ],
  
  arraySize: [
    [],                             // 空数组
    [1],                            // 单元素
    new Array(1000).fill(1),        // 大数组
    new Array(10000).fill(1)        // 极大数组
  ]
};
```

## 压力测试

### 1. 系统极限测试
```typescript
describe('系统极限测试', () => {
  it('应该在极限负载下保持稳定', async () => {
    const extremeLoad = 1000;
    const operations = [];
    
    for (let i = 0; i < extremeLoad; i++) {
      operations.push(performComplexOperation(i));
    }
    
    const startTime = performance.now();
    const results = await Promise.allSettled(operations);
    const endTime = performance.now();
    
    const successCount = results.filter(r => r.status === 'fulfilled').length;
    const successRate = successCount / extremeLoad;
    const duration = endTime - startTime;
    
    // 在极限负载下仍应保持基本功能
    expect(successRate).toBeGreaterThan(0.8); // 80%成功率
    expect(duration).toBeLessThan(30000);     // 30秒内完成
  });
});
```

### 2. 资源耗尽测试
```typescript
describe('资源耗尽测试', () => {
  it('应该优雅处理内存不足', async () => {
    // 逐步增加内存使用直到接近限制
    const memoryChunks = [];
    let memoryExhausted = false;
    
    try {
      while (!memoryExhausted) {
        // 分配大块内存
        const chunk = new Array(1000000).fill('memory test');
        memoryChunks.push(chunk);
        
        // 检查内存使用
        const memoryUsage = process.memoryUsage();
        if (memoryUsage.heapUsed > 500 * 1024 * 1024) { // 500MB
          memoryExhausted = true;
        }
      }
    } catch (error) {
      // 应该优雅处理内存不足错误
      expect(error.message).toMatch(/memory|heap/i);
    }
    
    // 清理内存
    memoryChunks.length = 0;
    if (global.gc) global.gc();
  });
});
```

## 最佳实践

### 1. 测试设计原则
- **全面覆盖**: 覆盖所有可能的边界条件
- **现实场景**: 基于真实使用场景设计测试
- **渐进测试**: 从正常值逐步推向边界值
- **错误恢复**: 测试系统的错误恢复能力

### 2. 测试数据准备
```typescript
// 系统化生成边界测试数据
class BoundaryTestDataGenerator {
  generateBoundaryValues(type: 'number' | 'string' | 'array') {
    switch (type) {
      case 'number':
        return [
          Number.MIN_SAFE_INTEGER,
          -1, 0, 1,
          Number.MAX_SAFE_INTEGER,
          Infinity, -Infinity, NaN
        ];
      
      case 'string':
        return [
          '',
          'a',
          'a'.repeat(255),
          'a'.repeat(256),
          'a'.repeat(1000),
          null, undefined
        ];
      
      case 'array':
        return [
          [],
          [1],
          new Array(1000).fill(1),
          new Array(10000).fill(1),
          null, undefined
        ];
    }
  }
}
```

### 3. 错误处理验证
```typescript
// 验证错误处理的完整性
async function testErrorHandling(operation: () => Promise<any>, expectedError: string) {
  let errorThrown = false;
  let actualError: Error;
  
  try {
    await operation();
  } catch (error) {
    errorThrown = true;
    actualError = error as Error;
  }
  
  expect(errorThrown).toBe(true);
  expect(actualError.message).toMatch(expectedError);
  
  // 验证系统状态未被破坏
  await verifySystemIntegrity();
}
```

## 与其他测试的关系
- **单元测试**: 边界测试基于单元测试的功能验证
- **集成测试**: 边界测试验证组件间的边界交互
- **性能测试**: 边界测试关注极限条件下的性能表现
- **安全测试**: 边界测试包含安全边界的验证
