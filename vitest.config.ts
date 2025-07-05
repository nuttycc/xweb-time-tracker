import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing';

import pkg from './package.json';

export default defineConfig({
  plugins: [WxtVitest()],
  define: {
    __APP_NAME__: JSON.stringify(pkg.name),
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  test: {
    globals: true,
    setupFiles: ['./vitest.setup.ts'],

    typecheck: {
      enabled: true,
      checker: 'tsc',
      include: ['src/**/*.test-d.ts'],
      exclude: ['node_modules/**', 'dist/**', '.wxt/**', 'coverage/**'],
    },

    testTimeout: 30000,
    hookTimeout: 15000,
    teardownTimeout: 10000,

    retry: 1,

    include: [
      'src/**/__tests__/**/*.{test,spec}.{js,ts}',
      'src/**/*.{test,spec}.{js,ts}',
      'tests/**/*.{test,spec}.{js,ts}',
      'tests/**/*.test-d.ts',
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
        'src/**/__tests__/**',
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

    benchmark: {
      include: ['src/**/__tests__/**/*.bench.ts', 'tests/**/*.bench.ts'],
      exclude: ['node_modules/**'],
      reporters: ['verbose'],
    },
  },
});
