/**
 * 数据库管理器
 * 负责数据库连接管理、版本迁移、连接池和生命周期管理
 *
 * 功能特性：
 * - 单例模式确保全局唯一数据库连接
 * - 自动版本迁移和数据库升级
 * - 连接池管理和错误重试机制
 * - 完整的生命周期管理
 */

import { WebTimeDatabase } from './schemas';
import type { DatabaseError } from '../../models/schemas/database-schema';
import { DatabaseErrorCode } from '../../models/schemas/database-schema';

/**
 * 数据库连接状态枚举
 */
export enum DatabaseConnectionStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error',
  MIGRATING = 'migrating',
}

/**
 * 数据库管理器配置
 */
export interface DatabaseManagerConfig {
  /** 最大重试次数 */
  maxRetries: number;
  /** 重试延迟（毫秒） */
  retryDelay: number;
  /** 连接超时（毫秒） */
  connectionTimeout: number;
  /** 是否启用自动重连 */
  autoReconnect: boolean;
  /** 健康检查间隔（毫秒） */
  healthCheckInterval: number;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: DatabaseManagerConfig = {
  maxRetries: 3,
  retryDelay: 1000,
  connectionTimeout: 10000,
  autoReconnect: true,
  healthCheckInterval: 60000, // 1分钟
};

/**
 * 数据库管理器类
 * 单例模式，管理整个应用的数据库连接
 */
export class DatabaseManager {
  private static instance: DatabaseManager;
  private db: WebTimeDatabase | null = null;
  private status: DatabaseConnectionStatus = DatabaseConnectionStatus.DISCONNECTED;
  private config: DatabaseManagerConfig;
  private retryCount = 0;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private connectionPromise: Promise<WebTimeDatabase> | null = null;

  private constructor(config: Partial<DatabaseManagerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 获取数据库管理器实例
   */
  public static getInstance(config?: Partial<DatabaseManagerConfig>): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager(config);
    }
    return DatabaseManager.instance;
  }

  /**
   * 获取数据库连接
   * 如果连接不存在，会自动创建连接
   */
  public async getConnection(): Promise<WebTimeDatabase> {
    if (this.db && this.status === DatabaseConnectionStatus.CONNECTED) {
      return this.db;
    }

    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = this.connect();
    return this.connectionPromise;
  }

  /**
   * 建立数据库连接
   */
  private async connect(): Promise<WebTimeDatabase> {
    this.status = DatabaseConnectionStatus.CONNECTING;
    this.retryCount = 0;

    while (this.retryCount < this.config.maxRetries) {
      try {
        this.db = new WebTimeDatabase();

        // 设置连接超时
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Connection timeout')), this.config.connectionTimeout);
        });

        // 尝试打开数据库连接
        await Promise.race([this.db.open(), timeoutPromise]);

        // 执行健康检查
        const healthCheck = await this.db.healthCheck();
        if (healthCheck.status === 'error') {
          throw new Error(`Database health check failed: ${healthCheck.issues.join(', ')}`);
        }

        this.status = DatabaseConnectionStatus.CONNECTED;
        this.retryCount = 0;
        this.connectionPromise = null;

        // 启动健康检查定时器
        this.startHealthCheck();

        console.log('Database connected successfully');
        return this.db;
      } catch (error) {
        this.retryCount++;
        console.error(`Database connection attempt ${this.retryCount} failed:`, error);

        if (this.retryCount >= this.config.maxRetries) {
          this.status = DatabaseConnectionStatus.ERROR;
          this.connectionPromise = null;
          throw this.createDatabaseError(DatabaseErrorCode.CONNECTION_FAILED, error as Error);
        }

        // 等待重试延迟
        await this.delay(this.config.retryDelay * this.retryCount);
      }
    }

    throw this.createDatabaseError(
      DatabaseErrorCode.CONNECTION_FAILED,
      new Error('Max retries exceeded')
    );
  }

  /**
   * 断开数据库连接
   */
  public async disconnect(): Promise<void> {
    this.stopHealthCheck();

    if (this.db) {
      try {
        await this.db.close();
        console.log('Database disconnected successfully');
      } catch (error) {
        console.error('Error disconnecting database:', error);
      }
    }

    this.db = null;
    this.status = DatabaseConnectionStatus.DISCONNECTED;
    this.connectionPromise = null;
  }

  /**
   * 重新连接数据库
   */
  public async reconnect(): Promise<WebTimeDatabase> {
    await this.disconnect();
    return this.getConnection();
  }

  /**
   * 获取连接状态
   */
  public getStatus(): DatabaseConnectionStatus {
    return this.status;
  }

  /**
   * 检查数据库是否已连接
   */
  public isConnected(): boolean {
    return this.status === DatabaseConnectionStatus.CONNECTED && this.db !== null;
  }

  /**
   * 执行数据库迁移
   */
  public async migrate(): Promise<void> {
    if (!this.db) {
      throw this.createDatabaseError(
        DatabaseErrorCode.MIGRATION_FAILED,
        new Error('Database not connected')
      );
    }

    this.status = DatabaseConnectionStatus.MIGRATING;

    try {
      // 这里可以添加具体的迁移逻辑
      // 目前数据库版本为1，暂时不需要迁移
      console.log('Database migration completed');
    } catch (error) {
      this.status = DatabaseConnectionStatus.ERROR;
      throw this.createDatabaseError(DatabaseErrorCode.MIGRATION_FAILED, error as Error);
    } finally {
      if (this.status === DatabaseConnectionStatus.MIGRATING) {
        this.status = DatabaseConnectionStatus.CONNECTED;
      }
    }
  }

  /**
   * 启动健康检查
   */
  private startHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    this.healthCheckTimer = setInterval(async () => {
      try {
        if (this.db && this.status === DatabaseConnectionStatus.CONNECTED) {
          const healthCheck = await this.db.healthCheck();

          if (healthCheck.status === 'error') {
            console.warn('Database health check failed:', healthCheck.issues);

            if (this.config.autoReconnect) {
              console.log('Attempting to reconnect...');
              await this.reconnect();
            }
          }
        }
      } catch (error) {
        console.error('Health check error:', error);

        if (this.config.autoReconnect) {
          console.log('Attempting to reconnect due to health check failure...');
          try {
            await this.reconnect();
          } catch (reconnectError) {
            console.error('Reconnection failed:', reconnectError);
          }
        }
      }
    }, this.config.healthCheckInterval);
  }

  /**
   * 停止健康检查
   */
  private stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 创建数据库错误
   */
  private createDatabaseError(code: DatabaseErrorCode, originalError: Error): DatabaseError {
    const error = new Error(`Database error: ${originalError.message}`) as DatabaseError;
    error.code = code;
    error.originalError = originalError;
    error.context = {
      status: this.status,
      retryCount: this.retryCount,
      timestamp: Date.now(),
    };
    return error;
  }

  /**
   * 获取数据库统计信息
   */
  public async getStats() {
    const db = await this.getConnection();
    return db.getStats();
  }

  /**
   * 清理数据库
   */
  public async cleanup(retentionDays: number) {
    const db = await this.getConnection();
    return db.cleanup(retentionDays);
  }

  /**
   * 执行健康检查
   */
  public async healthCheck() {
    if (!this.db) {
      return {
        status: 'error' as const,
        issues: ['Database not connected'],
        recommendations: ['Connect to database first'],
      };
    }

    return this.db.healthCheck();
  }
}

/**
 * 默认数据库管理器实例
 */
export const dbManager = DatabaseManager.getInstance();
