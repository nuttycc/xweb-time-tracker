/**
 * 数据模式统一导出文件
 * 集中导出所有数据结构定义
 *
 * 职责范围：
 * - 导出数据库表结构
 * - 导出API接口模式
 * - 导出配置文件模式
 * - 导出导入导出模式
 *
 * 功能边界：
 * ✅ 包含：数据结构定义、验证模式、类型约束
 * ❌ 不包含：数据操作、业务逻辑、具体实现
 *
 * 依赖关系：
 * - 依赖：models/entities/、shared/types/
 * - 被依赖：services/database/、services/validators/
 */

export * from './database-schema';
export * from './config-schema';
export * from './api-schema';
