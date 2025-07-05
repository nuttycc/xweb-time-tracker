# 常用模式和最佳实践

- vitest时间Mock最佳实践：需要同时Mock Date.now和performance.now，使用vi.useFakeTimers()和vi.spyOn()配合，确保在afterEach中调用vi.useRealTimers()清理。
- 数据库Mock只读属性处理：对于只读属性如verno，不能直接赋值，必须使用Object.defineProperty(mockDb, 'verno', { value: 1, writable: true })进行设置。
- 数据库排序性能优化最佳实践：IndexedDB中只有索引字段可以使用数据库层排序（collection.reverse()），非索引字段必须使用内存排序（toArray() + JavaScript sort）。Dexie.js通过isPlainKeyRange()函数判断使用哪种策略。为常用排序字段添加索引可以显著提升性能，从O(n log n)降至O(log n)，特别适用于大数据集场景。
- AggregatedData类型修复：将Map类型改为Record类型以解决chrome.storage序列化问题。技术反馈准确，采用预防性修复策略，选择Record类型方案因其类型安全性更强、原生JSON兼容、符合Chrome扩展最佳实践。迁移成本低，只需修改4处API调用。
- Web Crypto API迁移最佳实践：从Node.js crypto.randomUUID迁移到Web Crypto API的crypto.randomUUID()以实现Manifest V3兼容性。测试中使用vi.spyOn(globalThis.crypto, 'randomUUID')替代vi.mock('crypto')，确保使用正确的UUID格式进行类型匹配。
- 日志系统重构阶段1完成：创建了基于loglevel库的统一logger工具类(src/utils/logger.ts)，支持模块化命名、环境级别控制、持久化配置，API与现有console接口完全兼容，通过pnpm check验证无错误。
- 日志系统重构阶段2完成：成功替换src/entrypoints/目录下30处console调用，包括content.ts(9处)、background/index.ts(10处)、popup/App.vue(11处)，新增3个logger实例，通过pnpm check验证无错误。
- Chrome扩展E2E测试最佳实践：1)使用chromium.launchPersistentContext()创建共享context避免冲突；2)扩展API测试必须在扩展页面上下文中进行，使用extensionPage fixture；3)数据库测试应直接在扩展上下文中操作IndexedDB，避免页面导航导致的context销毁；4)使用非headless模式确保扩展权限正常；5)错误处理要宽容，将非关键错误降级为警告不阻塞测试；6)Global Setup只负责扩展构建，context管理在Test Fixtures中进行
- Playwright扩展测试架构模式：1)创建extensionPage fixture提供真正的扩展上下文；2)使用data URL或chrome-extension://协议访问扩展页面；3)数据库操作使用page.evaluate()在扩展上下文中直接执行，避免helper类的生命周期问题；4)测试fixture应该共享context但独立管理页面；5)使用ESLint禁用注释处理Playwright特殊语法要求；6)重试机制处理网络相关的偶发问题
- E2E测试问题诊断和解决流程：1)从0%到100%通过率需要系统性方法：语法错误→架构问题→权限配置→上下文管理；2)使用多轮深入调查，每轮专注一个核心问题；3)Context冲突通过统一管理解决；4)权限问题通过正确的测试环境解决；5)生命周期问题通过重新设计测试策略解决；6)使用寸止工具进行阶段性确认和方向调整；7)技术债务要彻底解决而不是简化绕过
- 事件队列去重机制实施经验：1) 使用crypto.randomUUID()生成测试UUID而非硬编码，避免格式错误；2) 测试中需要共享UUID来验证重复事件检测；3) 过滤率计算需要包含队列中未处理事件(totalProcessed + queueLength + duplicatesFiltered)；4) 防止测试中自动刷新需要增大maxQueueSize和maxWaitTime配置；5) LRU缓存实现需要双向链表和HashMap结合确保O(1)操作；6) 事件指纹应基于业务关键字段(eventType+tabId+visitId+activityId)生成唯一标识
- 日志系统重构阶段3完成：已移除src/utils/logger-emoji.ts文件，保留基本的src/utils/logger.ts。项目现在只有统一的基础日志系统，需要后续替换所有emoji logger引用为基本logger调用。
- Aggregator目录重构最佳实践：采用混合优化结构消除过度工程化问题。将单文件目录扁平化到同一层级，通过文件命名体现逻辑分组，保持外部API稳定性。重构原则：简洁性优于复杂分组，开发效率优于理论完美，实用性优于过度设计。
- 防抖节流方案实施完成：使用es-toolkit实现真正的节流(500ms)和防抖机制，动态超时管理(5秒/5分钟)，原子化状态锁防止竞态条件，多层次空闲检测(页内+系统级)，完整的双向通信协议。所有10个任务100%完成，通过pnpm check验证。
