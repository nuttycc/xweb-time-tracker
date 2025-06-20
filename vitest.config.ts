import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    // 基础配置
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],

    // TypeScript 配置
    typecheck: {
      tsconfig: './tests/tsconfig.json',
    },

    // 超时配置 - 修复大量数据测试超时问题
    testTimeout: 30000, // 测试超时时间 30秒 (针对大量数据测试)
    hookTimeout: 15000, // 钩子超时时间 15秒
    teardownTimeout: 10000, // 清理超时时间 10秒

    // 重试机制 - 提高测试稳定性
    retry: 1,

    // 测试文件匹配模式 - 支持四分类测试结构
    include: [
      'tests/**/*.{test,spec}.{js,ts}',
      'tests/unit/**/*.test.ts',
      'tests/integration/**/*.test.ts',
      'tests/boundary/**/*.test.ts',
      'tests/performance/**/*.test.ts',
      'tests/database/**/*.test.ts', // 保持现有数据库测试
    ],
    exclude: ['node_modules/**', 'dist/**', '.wxt/**', 'coverage/**'],

    // 覆盖率配置
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/entrypoints/**', // 排除入口文件
        'src/assets/**', // 排除资源文件
      ],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
        // 为不同模块设置不同的覆盖率要求
        'src/core/**': {
          branches: 85,
          functions: 85,
          lines: 85,
          statements: 85,
        },
        'src/services/database/**': {
          branches: 90,
          functions: 90,
          lines: 90,
          statements: 90,
        },
      },
    },

    // 性能基准测试配置
    benchmark: {
      include: ['tests/performance/**/*.bench.ts'],
      exclude: ['node_modules/**'],
      reporters: ['verbose'],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '~': resolve(__dirname, './src'),
      '@tests': resolve(__dirname, './tests'),
    },
  },
});
