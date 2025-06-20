/**
 * 值对象统一导出文件
 * 集中导出所有值对象定义
 *
 * 职责范围：
 * - 导出时间跨度值对象
 * - 导出URL值对象
 * - 导出保留策略值对象
 * - 导出界面主题值对象
 *
 * 功能边界：
 * ✅ 包含：值对象类、不可变对象、值比较方法
 * ❌ 不包含：可变状态、业务逻辑、数据持久化
 *
 * 依赖关系：
 * - 依赖：shared/utils/、shared/constants/
 * - 被依赖：models/entities/、core/
 *
 * TODO:
 * - [ ] 实现TimeSpan值对象
 * - [ ] 实现URLValue值对象
 * - [ ] 实现RetentionPolicy值对象
 * - [ ] 实现UITheme值对象
 * - [ ] 实现FilterRule值对象
 */

// 暂时导出空对象，避免构建错误
export {};
