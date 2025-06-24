# 开发规范和规则

- TypeScript规则：1. You should enforce strict TypeScript type safety by avoiding 'any' type and using precise types like 'unknown', specific interfaces, or union types instead; 2. Dexie钩子函数参数应该通过deepwiki调研函数源码签名明确类型注解；
- 严格流程控制经验：每完成一个任务阶段必须通过寸止工具汇报并等待确认，禁止擅自进入下一步；运行测试之前必须明确通过寸只申请，未经同意不得擅自行动；测试验证必须保证通过所有相关测试套件，不能只有部分测试通过就标记完成；发现问题时必须立即暂停并使用寸止报告，不要擅自行动；验证器迁移中遇到测试失败时，需要深入调查根本原因而不是简单修改测试
  -You should must perform multi-step verification anytime you encounter any npm package/library APIs, using 3 more research steps (read_wiki_structure, read_wiki_contents, ask_question, perplexity_ask plus any other available tools) to ensure 100% accurate understanding of syntax, function signatures, and implementation details.
- 项目中代码中，错误信息，UI信息等所有信息一律使用英文
- JavaScript默认参数陷阱：默认参数只在参数为undefined时生效，显式传递null时不会使用默认值。解决方案：在函数内部使用 const safeOptions = options || {} 进行显式处理。
- 项目开发强制规范：禁用TypeScript any类型，必须执行编译→lint→测试三步验证流程不可跳过，重大决策必须通过寸止工具确认，复杂问题必须多工具深入调查，代码修改后必须同步更新相关测试
- 数据库模块命名冲突已解决：连接层服务重命名为ConnectionService，CRUD服务保持DatabaseService命名，符合Core Task Plan架构要求。连接服务实例名为connectionService，数据库服务实例名为databaseService。
- URL规范化工具已移动到数据库模块内部：从src/shared/utils/url-normalizer.util.ts移动到src/db/utils/url-normalizer.util.ts，实现模块自包含，消除跨模块依赖。数据库架构图已更新包含Utils层。
