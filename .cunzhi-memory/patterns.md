# 常用模式和最佳实践
- 拆分任务为可验证的子任务，通过vitest进行单元测试和集成测试覆盖，确保每个子任务完成后都有对应的测试验证。只有测试通过并汇报结果且经过确认之后才能进入下一步。
- typescript 禁止使用不安全的 any 类型
- 数据库层开发最佳实践：使用Dexie+TypeScript实现类型安全的IndexedDB操作，采用Repository模式分离数据访问逻辑，实现完整的错误处理和性能监控体系
- 数据库错误处理最佳实践：1. 错误映射表使用枚举键而非字符串；2. createError方法需要空值检查和默认错误处理；3. 测试文件中使用DatabaseErrorCode枚举而非字符串字面量；4. 泛型函数避免any类型，使用TArgs extends readonly unknown[]和TReturn模式；5. 性能监控装饰器使用正确的函数签名类型
- 项目已完成完整的Zod Schema定义层，包括数据库、配置、API三大类Schema，支持类型安全验证、错误本地化和Schema工厂模式
- Zod v4验证器开发最佳实践：1. Zod v4内部结构使用_def.type而非_def.typeName；2. 内部类型访问使用innerType.def.type路径；3. 类型值直接使用无需转换；4. 缓存机制可能导致错误结果持续返回需谨慎使用；5. 版本升级时必须查询官方文档确认API变化；6. 实际调试验证比理论分析更可靠
- 验证器迁移最佳实践：阶段化迁移策略（时间工具→Schema定义→验证中间件→现有代码迁移）确保了项目稳定性，关键是先修复验证器内部问题（Zod v4适配、时间戳范围、DateValidator统一）再进行测试验证，边界测试需要使用合理的测试数据而非极值数据，Chrome特殊值（如tabId:-1）需要特别处理
- Zod验证器调试技巧：遇到"验证失败：发现N个错误"时，需要检查Schema定义中的动态值（如Date.now()）和refine函数，时间戳验证失败通常是范围问题，可以通过创建调试测试文件快速定位问题，修复时要同时更新Schema定义和相关的工具函数（如DateValidator），确保验证逻辑的一致性
- Zod v4迁移最佳实践：ZodTypeAny→z.ZodType，错误消息使用error函数替代required_error/invalid_type_error，避免any类型使用unknown，统一导入import { z } from "zod/v4"
