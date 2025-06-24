# 常用模式和最佳实践

- vitest时间Mock最佳实践：需要同时Mock Date.now和performance.now，使用vi.useFakeTimers()和vi.spyOn()配合，确保在afterEach中调用vi.useRealTimers()清理。
- 数据库Mock只读属性处理：对于只读属性如verno，不能直接赋值，必须使用Object.defineProperty(mockDb, 'verno', { value: 1, writable: true })进行设置。
