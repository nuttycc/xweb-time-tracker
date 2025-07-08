# Development Standards and Rules  

- Avoid using `any` type, use specific type instead.
- 修复了自定义滚动条样式中的Tailwind CSS使用错误：1. 移除了<style scoped>中的@apply指令；2. 将Tailwind类移到模板的class属性中；3. HostnameEventsList使用class="w-full"和class="rounded border border-gray-100"；4. UngroupedEventsList使用class="flex flex-col h-full"；5. 保持了自定义滚动条的CSS样式不变，只修复了Tailwind的正确使用方式。
