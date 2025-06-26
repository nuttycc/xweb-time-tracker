# 常用模式和最佳实践

- vitest时间Mock最佳实践：需要同时Mock Date.now和performance.now，使用vi.useFakeTimers()和vi.spyOn()配合，确保在afterEach中调用vi.useRealTimers()清理。
- 数据库Mock只读属性处理：对于只读属性如verno，不能直接赋值，必须使用Object.defineProperty(mockDb, 'verno', { value: 1, writable: true })进行设置。
- 数据库排序性能优化最佳实践：IndexedDB中只有索引字段可以使用数据库层排序（collection.reverse()），非索引字段必须使用内存排序（toArray() + JavaScript sort）。Dexie.js通过isPlainKeyRange()函数判断使用哪种策略。为常用排序字段添加索引可以显著提升性能，从O(n log n)降至O(log n)，特别适用于大数据集场景。
- AggregatedData类型修复：将Map类型改为Record类型以解决chrome.storage序列化问题。技术反馈准确，采用预防性修复策略，选择Record类型方案因其类型安全性更强、原生JSON兼容、符合Chrome扩展最佳实践。迁移成本低，只需修改4处API调用。
