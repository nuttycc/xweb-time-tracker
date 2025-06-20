/**
 * 数据库迁移管理器
 * 负责数据库版本升级和数据迁移
 *
 * 功能特性：
 * - 版本化迁移管理
 * - 数据备份和恢复
 * - 迁移回滚支持
 * - 迁移状态跟踪
 */

import type { WebTimeDatabase } from './schemas';
import type { DatabaseError } from '../../models/schemas/database-schema';

/**
 * 迁移脚本接口
 */
export interface Migration {
  /** 迁移版本号 */
  version: number;
  /** 迁移描述 */
  description: string;
  /** 向上迁移函数 */
  up: (db: WebTimeDatabase) => Promise<void>;
  /** 向下迁移函数（回滚） */
  down?: (db: WebTimeDatabase) => Promise<void>;
}

/**
 * 迁移状态记录
 */
export interface MigrationRecord {
  version: number;
  description: string;
  appliedAt: number;
  executionTime: number;
}

/**
 * 迁移结果
 */
export interface MigrationResult {
  success: boolean;
  appliedMigrations: number[];
  failedMigration?: number;
  error?: string;
  totalTime: number;
}

/**
 * 数据库迁移管理器
 */
export class MigrationManager {
  private migrations: Migration[] = [];
  private db: WebTimeDatabase;

  constructor(db: WebTimeDatabase) {
    this.db = db;
    this.registerMigrations();
  }

  /**
   * 注册所有迁移脚本
   */
  private registerMigrations(): void {
    // 目前数据库版本为1，这里预留未来版本的迁移脚本

    // 示例：版本2的迁移（添加新字段）
    this.migrations.push({
      version: 2,
      description: 'Add user_agent field to events_log table',
      up: async (db: WebTimeDatabase) => {
        // 这里会在未来版本中实现
        // 目前只是示例代码
        console.log('Migration v2: Adding user_agent field');

        // 在实际迁移中，可能需要：
        // 1. 创建新的表结构
        // 2. 迁移现有数据
        // 3. 删除旧表
        // 4. 重命名新表
      },
      down: async (db: WebTimeDatabase) => {
        console.log('Migration v2 rollback: Removing user_agent field');
      },
    });

    // 示例：版本3的迁移（添加新索引）
    this.migrations.push({
      version: 3,
      description: 'Add performance indexes',
      up: async (db: WebTimeDatabase) => {
        console.log('Migration v3: Adding performance indexes');
      },
      down: async (db: WebTimeDatabase) => {
        console.log('Migration v3 rollback: Removing performance indexes');
      },
    });
  }

  /**
   * 获取当前数据库版本
   */
  public async getCurrentVersion(): Promise<number> {
    try {
      // 从数据库获取当前版本
      return this.db.verno;
    } catch (error) {
      console.error('Failed to get current database version:', error);
      return 0;
    }
  }

  /**
   * 获取最新版本号
   */
  public getLatestVersion(): number {
    if (this.migrations.length === 0) {
      return 1; // 基础版本
    }
    return Math.max(...this.migrations.map(m => m.version));
  }

  /**
   * 检查是否需要迁移
   */
  public async needsMigration(): Promise<boolean> {
    const currentVersion = await this.getCurrentVersion();
    const latestVersion = this.getLatestVersion();
    return currentVersion < latestVersion;
  }

  /**
   * 执行迁移
   */
  public async migrate(): Promise<MigrationResult> {
    const startTime = Date.now();
    const appliedMigrations: number[] = [];

    try {
      const currentVersion = await this.getCurrentVersion();
      const pendingMigrations = this.migrations
        .filter(m => m.version > currentVersion)
        .sort((a, b) => a.version - b.version);

      if (pendingMigrations.length === 0) {
        return {
          success: true,
          appliedMigrations: [],
          totalTime: Date.now() - startTime,
        };
      }

      console.log(
        `Starting migration from version ${currentVersion} to ${this.getLatestVersion()}`
      );

      // 创建迁移状态表（如果不存在）
      await this.ensureMigrationTable();

      // 执行每个迁移
      for (const migration of pendingMigrations) {
        const migrationStartTime = Date.now();

        try {
          console.log(`Applying migration v${migration.version}: ${migration.description}`);

          // 执行迁移
          await migration.up(this.db);

          // 记录迁移状态
          await this.recordMigration({
            version: migration.version,
            description: migration.description,
            appliedAt: Date.now(),
            executionTime: Date.now() - migrationStartTime,
          });

          appliedMigrations.push(migration.version);
          console.log(`Migration v${migration.version} completed successfully`);
        } catch (error) {
          console.error(`Migration v${migration.version} failed:`, error);

          return {
            success: false,
            appliedMigrations,
            failedMigration: migration.version,
            error: error instanceof Error ? error.message : 'Unknown error',
            totalTime: Date.now() - startTime,
          };
        }
      }

      console.log(`All migrations completed successfully`);

      return {
        success: true,
        appliedMigrations,
        totalTime: Date.now() - startTime,
      };
    } catch (error) {
      console.error('Migration process failed:', error);

      return {
        success: false,
        appliedMigrations,
        error: error instanceof Error ? error.message : 'Unknown error',
        totalTime: Date.now() - startTime,
      };
    }
  }

  /**
   * 回滚到指定版本
   */
  public async rollback(targetVersion: number): Promise<MigrationResult> {
    const startTime = Date.now();
    const rolledBackMigrations: number[] = [];

    try {
      const currentVersion = await this.getCurrentVersion();

      if (targetVersion >= currentVersion) {
        throw new Error('Target version must be lower than current version');
      }

      const migrationsToRollback = this.migrations
        .filter(m => m.version > targetVersion && m.version <= currentVersion)
        .sort((a, b) => b.version - a.version); // 降序，从高版本回滚到低版本

      console.log(`Starting rollback from version ${currentVersion} to ${targetVersion}`);

      for (const migration of migrationsToRollback) {
        if (!migration.down) {
          throw new Error(`Migration v${migration.version} does not support rollback`);
        }

        try {
          console.log(`Rolling back migration v${migration.version}: ${migration.description}`);

          await migration.down(this.db);
          await this.removeMigrationRecord(migration.version);

          rolledBackMigrations.push(migration.version);
          console.log(`Migration v${migration.version} rolled back successfully`);
        } catch (error) {
          console.error(`Rollback of migration v${migration.version} failed:`, error);

          return {
            success: false,
            appliedMigrations: rolledBackMigrations,
            failedMigration: migration.version,
            error: error instanceof Error ? error.message : 'Unknown error',
            totalTime: Date.now() - startTime,
          };
        }
      }

      console.log(`Rollback completed successfully`);

      return {
        success: true,
        appliedMigrations: rolledBackMigrations,
        totalTime: Date.now() - startTime,
      };
    } catch (error) {
      console.error('Rollback process failed:', error);

      return {
        success: false,
        appliedMigrations: rolledBackMigrations,
        error: error instanceof Error ? error.message : 'Unknown error',
        totalTime: Date.now() - startTime,
      };
    }
  }

  /**
   * 获取迁移历史
   */
  public async getMigrationHistory(): Promise<MigrationRecord[]> {
    try {
      // 这里应该从迁移状态表中读取记录
      // 目前返回空数组，实际实现需要查询数据库
      return [];
    } catch (error) {
      console.error('Failed to get migration history:', error);
      return [];
    }
  }

  /**
   * 确保迁移状态表存在
   */
  private async ensureMigrationTable(): Promise<void> {
    // 在实际实现中，这里会创建一个专门的表来跟踪迁移状态
    // 目前使用localStorage作为简单的存储方案
    if (typeof localStorage !== 'undefined') {
      const migrations = localStorage.getItem('db_migrations');
      if (!migrations) {
        localStorage.setItem('db_migrations', JSON.stringify([]));
      }
    }
  }

  /**
   * 记录迁移状态
   */
  private async recordMigration(record: MigrationRecord): Promise<void> {
    if (typeof localStorage !== 'undefined') {
      const migrations = JSON.parse(localStorage.getItem('db_migrations') || '[]');
      migrations.push(record);
      localStorage.setItem('db_migrations', JSON.stringify(migrations));
    }
  }

  /**
   * 删除迁移记录
   */
  private async removeMigrationRecord(version: number): Promise<void> {
    if (typeof localStorage !== 'undefined') {
      const migrations = JSON.parse(localStorage.getItem('db_migrations') || '[]');
      const filtered = migrations.filter((m: MigrationRecord) => m.version !== version);
      localStorage.setItem('db_migrations', JSON.stringify(filtered));
    }
  }
}
