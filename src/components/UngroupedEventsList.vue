<template>
  <div class="ungrouped-events-list flex h-full flex-col">
    <div v-if="events.length <= 20" class="flex-1 overflow-y-auto p-2">
      <!-- For small lists, render normally without virtual scrolling -->
      <div class="space-y-3">
        <EventItem v-for="event in events" :key="event.id" :event="event" />
      </div>
    </div>

    <div v-else class="flex-1 overflow-hidden">
      <!-- For large lists, use virtual scrolling -->
      <div v-bind="containerProps" class="h-full overflow-y-auto p-2">
        <div v-bind="wrapperProps">
          <div v-for="{ data } in list" :key="data.id" class="py-1">
            <EventItem :event="data.event" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { useVirtualList } from '@vueuse/core';
import type { EventsLogRecord } from '@/core/db/schemas';
import EventItem from './EventItem.vue';

interface Props {
  events: EventsLogRecord[];
}

const props = defineProps<Props>();

// Create virtual list items
const virtualItems = computed(() =>
  props.events.map(event => ({
    event,
    id: `event-${event.id}`,
  }))
);

// Setup virtual list for large event lists
const { list, containerProps, wrapperProps } = useVirtualList(virtualItems, {
  itemHeight: 120, // Fixed height for event items
  overscan: 5,
});
</script>

<style scoped>
/* 自定义滚动条样式 */
.ungrouped-events-list :deep(.overflow-y-auto) {
  /* Firefox 滚动条 */
  scrollbar-width: thin;
  scrollbar-color: #cbd5e1 #f1f5f9;
}

.ungrouped-events-list :deep(.overflow-y-auto::-webkit-scrollbar) {
  width: 8px;
}

.ungrouped-events-list :deep(.overflow-y-auto::-webkit-scrollbar-track) {
  background: #f1f5f9;
  border-radius: 4px;
}

.ungrouped-events-list :deep(.overflow-y-auto::-webkit-scrollbar-thumb) {
  background: #cbd5e1;
  border-radius: 4px;
  transition: background-color 0.2s ease;
}

.ungrouped-events-list :deep(.overflow-y-auto::-webkit-scrollbar-thumb:hover) {
  background: #94a3b8;
}

.ungrouped-events-list :deep(.overflow-y-auto::-webkit-scrollbar-thumb:active) {
  background: #64748b;
}
</style>
