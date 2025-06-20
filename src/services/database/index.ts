/**
 * 数据库服务模块统一导出文件
 * 集中导出数据库操作和管理功能
 *
 * 职责范围：
 * - 导出IndexedDB操作封装
 * - 导出数据库模式定义
 * - 导出数据库迁移逻辑
 * - 导出事务管理
 *
 * 功能边界：
 * ✅ 包含：数据库连接、CRUD操作、事务管理、错误处理
 * ❌ 不包含：业务逻辑、数据验证、UI组件
 *
 * 依赖关系：
 * - 依赖：models/schemas/、shared/
 * - 被依赖：core/、其他services/
 */

// 数据库Schema和连接
export { WebTimeDatabase, db } from './schemas';

// 数据库管理器
export {
  DatabaseManager,
  DatabaseConnectionStatus,
  dbManager,
  type DatabaseManagerConfig,
} from './db-manager';

// 数据库迁移
export {
  MigrationManager,
  type Migration,
  type MigrationRecord,
  type MigrationResult,
} from './migrations';

// Repository层
export {
  EventRepository,
  StatsRepository,
  type AggregatedData,
  type AggregateOptions,
} from './repositories';

// 错误处理和监控
export {
  DatabaseErrorHandler,
  ErrorSeverity,
  RecoveryStrategy,
  dbErrorHandler,
  withRetry,
  type ErrorHandlerConfig,
  type ErrorInfo,
  type ErrorStats,
} from './error-handler';

export {
  DatabasePerformanceMonitor,
  OperationType,
  dbPerformanceMonitor,
  withPerformanceMonitoring,
  type PerformanceMetric,
  type PerformanceStats,
  type StorageQuotaInfo,
  type SystemHealth,
  type MonitorConfig,
} from './performance-monitor';
