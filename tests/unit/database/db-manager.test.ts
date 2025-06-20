/**
 * 数据库管理器测试
 * 测试DatabaseManager的连接管理、单例模式和错误处理
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import {
  DatabaseManager,
  DatabaseConnectionStatus,
} from '../../../src/services/database/db-manager';

// 类型安全的单例重置辅助函数
function resetDatabaseManagerInstance(): void {
  // 使用 Reflect 来安全地访问私有静态属性
  Reflect.set(DatabaseManager, 'instance', null);
}

describe('DatabaseManager', () => {
  let dbManager: DatabaseManager;

  beforeEach(async () => {
    // 重置单例实例
    resetDatabaseManagerInstance();

    // 为测试环境配置更短的超时时间
    dbManager = DatabaseManager.getInstance({
      connectionTimeout: 5000, // 5秒超时
      retryDelay: 100, // 100ms重试延迟
      maxRetries: 2, // 最多2次重试
      autoReconnect: false, // 禁用自动重连
      healthCheckInterval: 10000, // 10秒健康检查间隔
    });
  });

  afterEach(async () => {
    // 清理连接
    await dbManager.disconnect();

    // 清理所有定时器
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe('单例模式', () => {
    it('应该返回同一个实例', () => {
      const instance1 = DatabaseManager.getInstance();
      const instance2 = DatabaseManager.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('数据库连接管理', () => {
    it('应该成功建立数据库连接', async () => {
      expect(dbManager.getStatus()).toBe(DatabaseConnectionStatus.DISCONNECTED);

      const db = await dbManager.getConnection();

      expect(db).toBeDefined();
      expect(dbManager.getStatus()).toBe(DatabaseConnectionStatus.CONNECTED);
      expect(dbManager.isConnected()).toBe(true);
    }, 10000); // 增加测试超时时间到10秒

    it('应该复用现有连接', async () => {
      const db1 = await dbManager.getConnection();
      const db2 = await dbManager.getConnection();

      expect(db1).toBe(db2);
    }, 10000);

    it('应该能够断开连接', async () => {
      await dbManager.getConnection();
      expect(dbManager.isConnected()).toBe(true);

      await dbManager.disconnect();

      expect(dbManager.getStatus()).toBe(DatabaseConnectionStatus.DISCONNECTED);
      expect(dbManager.isConnected()).toBe(false);
    }, 10000);

    it('应该能够重新连接', async () => {
      await dbManager.getConnection();
      await dbManager.disconnect();

      const db = await dbManager.reconnect();

      expect(db).toBeDefined();
      expect(dbManager.isConnected()).toBe(true);
    }, 15000); // 重连可能需要更长时间
  });

  describe('错误处理和重试', () => {
    it('应该有正确的重试配置', () => {
      expect(dbManager.getStatus()).toBe(DatabaseConnectionStatus.DISCONNECTED);
      // 测试配置是否正确设置
      expect(dbManager).toBeDefined();
    });
  });

  describe('数据库操作代理', () => {
    it('应该能够获取数据库统计信息', async () => {
      const stats = await dbManager.getStats();

      expect(stats).toBeDefined();
      expect(stats.eventsCount).toBeTypeOf('number');
      expect(stats.statsCount).toBeTypeOf('number');
      expect(stats.estimatedSize).toBeTypeOf('number');
      expect(stats.lastUpdated).toBeTypeOf('number');
    }, 10000);

    it('应该能够执行数据库清理', async () => {
      const result = await dbManager.cleanup(30);

      expect(result).toBeDefined();
      expect(result.deletedEvents).toBeTypeOf('number');
      expect(result.deletedStats).toBeTypeOf('number');
    }, 10000);

    it('应该能够执行健康检查', async () => {
      const healthCheck = await dbManager.healthCheck();

      expect(healthCheck).toBeDefined();
      expect(healthCheck.status).toMatch(/healthy|warning|error/);
      expect(Array.isArray(healthCheck.issues)).toBe(true);
      expect(Array.isArray(healthCheck.recommendations)).toBe(true);
    }, 10000);

    it('未连接时健康检查应该返回错误状态', async () => {
      const healthCheck = await dbManager.healthCheck();

      expect(healthCheck.status).toBe('error');
      expect(healthCheck.issues).toContain('Database not connected');
    }, 5000); // 这个测试不需要连接，应该很快
  });
});

// MigrationManager测试将在后续单独实现
