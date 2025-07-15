# Development Standards and Rules  

- Avoid using `any` type, use specific type instead.
- 修复了自定义滚动条样式中的Tailwind CSS使用错误：1. 移除了<style scoped>中的@apply指令；2. 将Tailwind类移到模板的class属性中；3. HostnameEventsList使用class="w-full"和class="rounded border border-gray-100"；4. UngroupedEventsList使用class="flex flex-col h-full"；5. 保持了自定义滚动条的CSS样式不变，只修复了Tailwind的正确使用方式。
- 避免使用any类型，使用具体类型：在DataMonitoringCard.vue中将dbHealth从any类型改为DatabaseHealthInfo类型，并正确使用接口中定义的属性名totalEventCount和totalStatsCount而不是totalEvents和totalStats，确保类型安全和IDE支持。
