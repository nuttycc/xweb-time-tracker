/**
 * 数据库Repository统一导出文件
 * 集中导出所有数据访问层Repository
 *
 * 职责范围：
 * - 导出事件存储Repository
 * - 导出聚合数据Repository
 * - 导出Repository工厂函数
 *
 * 功能边界：
 * ✅ 包含：数据访问层、Repository模式实现
 * ❌ 不包含：业务逻辑、数据验证、UI组件
 */

export { EventRepository } from './event-repository';
export { StatsRepository, type AggregatedData, type AggregateOptions } from './stats-repository';
