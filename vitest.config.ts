import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing';
import { resolve } from 'path';

export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    // 基础配置 - 让WxtVitest自动处理环境配置
    globals: true,
    setupFiles: ['./tests/setup.ts'],

    // TypeScript 配置
    typecheck: {
      enabled: true,
      checker: 'tsc',
      tsconfig: './tests/tsconfig.json',
      include: ['tests/**/*.test-d.ts'],
      exclude: ['node_modules/**', 'dist/**', '.wxt/**', 'coverage/**'],
    },

    // 超时配置 - 修复大量数据测试超时问题
    testTimeout: 30000, // 测试超时时间 30秒 (针对大量数据测试)
    hookTimeout: 15000, // 钩子超时时间 15秒
    teardownTimeout: 10000, // 清理超时时间 10秒

    // 重试机制 - 提高测试稳定性
    retry: 1,

    include: [
      'tests/**/*.{test,spec}.{js,ts}',
      'tests/**/*.test-d.ts',
      'tests/unit/**/*.test.ts',
      'tests/integration/**/*.test.ts',
      'tests/boundary/**/*.test.ts',
      'tests/performance/**/*.test.ts',
    ],
    exclude: ['node_modules/**', 'dist/**', '.wxt/**', 'coverage/**'],

    coverage: {
      enabled: false,
      provider: 'v8',
      reporter: ['text', 'html', 'json', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/entrypoints/**',
        'src/assets/**',
      ],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
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
      '#imports': resolve(__dirname, './tests/mocks/wxt-imports.ts'),
    },
  },
});
