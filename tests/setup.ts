/**
 * Vitest测试环境设置
 * 配置测试所需的全局设置和模拟
 */

// 导入fake-indexeddb以模拟IndexedDB环境
import 'fake-indexeddb/auto';
import { vi } from 'vitest';

// 设置全局变量 - 扩展控制台对象
Object.assign(globalThis.console, {
  // 在测试中静默某些日志
  warn: vi.fn(),
  error: vi.fn(),
  // 保留重要日志用于调试
  log: console.log,
  info: console.info,
});

// 模拟Chrome扩展API（如果需要）
globalThis.chrome = {
  storage: {
    sync: {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
      clear: vi.fn(),
    },
    local: {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
      clear: vi.fn(),
    },
  },
  tabs: {
    query: vi.fn(),
    get: vi.fn(),
    onActivated: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    onUpdated: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
  runtime: {
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    sendMessage: vi.fn(),
  },
};

// 模拟navigator.storage API
Object.defineProperty(navigator, 'storage', {
  value: {
    estimate: vi.fn().mockResolvedValue({
      quota: 1024 * 1024 * 1024, // 1GB
      usage: 1024 * 1024 * 10, // 10MB
    }),
  },
  writable: true,
});

// 模拟Performance API用于性能测试
Object.defineProperty(globalThis, 'performance', {
  value: {
    ...performance,
    now: vi.fn(() => Date.now()),
    mark: vi.fn(),
    measure: vi.fn(),
    getEntriesByType: vi.fn(() => []),
    getEntriesByName: vi.fn(() => []),
  },
  writable: true,
});

// 注意：全局测试钩子已移除，避免与现有测试冲突
// 如需要测试隔离，请在具体测试文件中单独设置

// 测试环境变量
process.env.NODE_ENV = 'test';
process.env.VITEST = 'true';
