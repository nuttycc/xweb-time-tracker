# Performance Tests 性能测试

## 目录职责
性能测试目录包含系统性能、响应时间、吞吐量和资源使用的测试，确保应用在各种负载下的性能表现。

## 测试原则

### 性能测试特征
- **响应时间**: 测试操作完成所需时间
- **吞吐量**: 测试单位时间内处理的请求数
- **资源使用**: 测试内存、CPU、存储使用情况
- **并发性能**: 测试多用户同时操作的性能
- **稳定性**: 测试长时间运行的性能稳定性

### 测试范围
- 数据库操作性能
- 大量数据处理
- 内存使用优化
- 并发操作性能
- 系统资源监控

## 目录结构

```
performance/
├── database/                    # 数据库性能测试
│   └── performance-monitor.test.ts  # 性能监控测试
├── benchmarks/                  # 基准测试
├── load/                       # 负载测试
└── stress/                     # 压力测试
```

## 运行性能测试

```bash
# 运行所有性能测试
npm run test:performance

# 运行基准测试
npm run test:bench

# 运行数据库性能测试
npm run test:performance -- tests/performance/database

# 生成性能报告
npm run test:performance -- --reporter=verbose
```

## 性能指标

### 1. 响应时间指标
- **P50 (中位数)**: 50%请求的响应时间
- **P95**: 95%请求的响应时间
- **P99**: 99%请求的响应时间
- **平均响应时间**: 所有请求的平均时间
- **最大响应时间**: 最慢请求的时间

### 2. 吞吐量指标
- **QPS (每秒查询数)**: 每秒处理的查询数量
- **TPS (每秒事务数)**: 每秒处理的事务数量
- **并发用户数**: 同时处理的用户数量

### 3. 资源使用指标
- **内存使用**: 峰值内存和平均内存使用
- **CPU使用率**: 处理器使用百分比
- **存储空间**: 数据库和缓存使用的存储空间
- **网络带宽**: 数据传输速度

## 测试类型

### 1. 基准测试 (Benchmark)
```typescript
import { bench, describe } from 'vitest';

describe('数据处理基准测试', () => {
  bench('批量插入1000条记录', async () => {
    const events = generateTestEvents(1000);
    await eventRepository.createBatch(events);
  });

  bench('复杂查询操作', async () => {
    await eventRepository.query({
      startTime: Date.now() - 86400000,
      eventTypes: ['open_time_start', 'active_time_start'],
      isProcessed: 0
    });
  });
});
```

### 2. 负载测试 (Load Testing)
```typescript
describe('负载测试', () => {
  it('应该处理正常负载', async () => {
    const concurrentUsers = 50;
    const operationsPerUser = 10;
    
    const promises = Array.from({ length: concurrentUsers }, async () => {
      for (let i = 0; i < operationsPerUser; i++) {
        await performOperation();
      }
    });
    
    const startTime = performance.now();
    await Promise.all(promises);
    const endTime = performance.now();
    
    const totalOperations = concurrentUsers * operationsPerUser;
    const duration = endTime - startTime;
    const throughput = totalOperations / (duration / 1000);
    
    expect(throughput).toBeGreaterThan(100); // 每秒100次操作
  });
});
```

### 3. 压力测试 (Stress Testing)
```typescript
describe('压力测试', () => {
  it('应该在高负载下保持稳定', async () => {
    const highLoad = 200; // 高并发数
    const errors = [];
    
    const promises = Array.from({ length: highLoad }, async (_, index) => {
      try {
        await performHeavyOperation(index);
      } catch (error) {
        errors.push(error);
      }
    });
    
    await Promise.allSettled(promises);
    
    // 允许少量失败，但不应该系统崩溃
    const errorRate = errors.length / highLoad;
    expect(errorRate).toBeLessThan(0.05); // 错误率小于5%
  });
});
```

### 4. 内存测试
```typescript
describe('内存使用测试', () => {
  it('应该有效管理内存', async () => {
    const initialMemory = process.memoryUsage().heapUsed;
    
    // 执行大量操作
    for (let i = 0; i < 1000; i++) {
      await createAndProcessData();
    }
    
    // 强制垃圾回收
    if (global.gc) {
      global.gc();
    }
    
    const finalMemory = process.memoryUsage().heapUsed;
    const memoryIncrease = finalMemory - initialMemory;
    
    // 内存增长应该在合理范围内
    expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024); // 50MB
  });
});
```

## 性能监控

### 1. 自定义性能监控器
```typescript
class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  
  startOperation(operationType: string): () => void {
    const startTime = performance.now();
    
    return (recordCount = 1) => {
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      this.metrics.push({
        operation: operationType,
        duration,
        timestamp: Date.now(),
        recordCount,
        success: true
      });
    };
  }
  
  getStats(): PerformanceStats {
    return {
      totalOperations: this.metrics.length,
      averageDuration: this.calculateAverage(),
      p50Duration: this.calculatePercentile(50),
      p95Duration: this.calculatePercentile(95),
      p99Duration: this.calculatePercentile(99)
    };
  }
}
```

### 2. 性能装饰器
```typescript
function withPerformanceMonitoring<T extends (...args: any[]) => any>(
  fn: T,
  operationType: string
): T {
  return (async (...args: Parameters<T>) => {
    const monitor = getGlobalMonitor();
    const endOperation = monitor.startOperation(operationType);
    
    try {
      const result = await fn(...args);
      endOperation(1);
      return result;
    } catch (error) {
      endOperation(0); // 记录失败
      throw error;
    }
  }) as T;
}

// 使用装饰器
const monitoredCreate = withPerformanceMonitoring(
  eventRepository.create.bind(eventRepository),
  'CREATE_EVENT'
);
```

## 性能优化建议

### 1. 数据库优化
```typescript
// ✅ 批量操作
const batchResult = await repository.createBatch(events);

// ❌ 逐个操作
for (const event of events) {
  await repository.create(event);
}

// ✅ 索引查询
const events = await repository.query({ 
  timestamp: { $gte: startTime, $lte: endTime } 
});

// ❌ 全表扫描
const allEvents = await repository.query();
const filteredEvents = allEvents.filter(e => 
  e.timestamp >= startTime && e.timestamp <= endTime
);
```

### 2. 内存优化
```typescript
// ✅ 流式处理
async function* processLargeDataset(data: LargeDataset) {
  for (const chunk of data.chunks()) {
    yield await processChunk(chunk);
  }
}

// ❌ 一次性加载
const allData = await loadEntireDataset();
const results = await processAllData(allData);
```

### 3. 并发优化
```typescript
// ✅ 控制并发数
const concurrencyLimit = 10;
const semaphore = new Semaphore(concurrencyLimit);

const promises = data.map(async (item) => {
  await semaphore.acquire();
  try {
    return await processItem(item);
  } finally {
    semaphore.release();
  }
});

// ❌ 无限制并发
const promises = data.map(item => processItem(item));
```

## 性能基准

### 数据库操作基准
- **单条插入**: < 10ms
- **批量插入(100条)**: < 100ms
- **简单查询**: < 50ms
- **复杂查询**: < 200ms
- **聚合操作**: < 500ms

### 内存使用基准
- **空闲状态**: < 50MB
- **正常负载**: < 200MB
- **高负载**: < 500MB
- **内存泄漏**: 无持续增长

### 并发性能基准
- **10并发用户**: 响应时间 < 100ms
- **50并发用户**: 响应时间 < 500ms
- **100并发用户**: 响应时间 < 1000ms
- **错误率**: < 1%

## 性能测试工具

### 1. Vitest Benchmark
```bash
# 运行基准测试
npm run test:bench

# 比较基准测试结果
npm run test:bench -- --compare
```

### 2. 性能分析
```typescript
// 使用 console.time 测量
console.time('operation');
await performOperation();
console.timeEnd('operation');

// 使用 performance API
const mark1 = performance.mark('start');
await performOperation();
const mark2 = performance.mark('end');
const measure = performance.measure('operation', 'start', 'end');
```

### 3. 内存分析
```bash
# 启用内存分析
node --expose-gc --inspect test-script.js

# 生成堆快照
node --heapsnapshot-signal=SIGUSR2 test-script.js
```

## 持续性能监控

### 1. CI/CD集成
```yaml
# .github/workflows/performance.yml
name: Performance Tests
on: [push, pull_request]

jobs:
  performance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run Performance Tests
        run: npm run test:performance
      - name: Upload Performance Report
        uses: actions/upload-artifact@v3
        with:
          name: performance-report
          path: performance-report.json
```

### 2. 性能回归检测
```typescript
// 比较性能基准
const currentPerformance = await runPerformanceTests();
const baselinePerformance = await loadBaseline();

const regression = detectRegression(currentPerformance, baselinePerformance);
if (regression.hasRegression) {
  throw new Error(`Performance regression detected: ${regression.details}`);
}
```

## 与其他测试的关系
- **单元测试**: 确保功能正确性后进行性能测试
- **集成测试**: 验证组件协作性能
- **边界测试**: 测试极限条件下的性能表现
- **监控系统**: 性能测试结果指导生产环境监控
