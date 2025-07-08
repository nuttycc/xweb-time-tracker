<template>
  <div class="hostname-events-list w-full">
    <div v-if="events.length <= 10" class="space-y-3">
      <!-- For small lists, render normally without virtual scrolling -->
      <EventItem v-for="event in events" :key="event.id" :event="event" />
    </div>

    <div
      v-else
      class="virtual-scroll-container rounded border border-gray-100"
      style="height: 300px"
    >
      <!-- For large lists, use virtual scrolling -->
      <div v-bind="containerProps" class="h-full overflow-y-auto">
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
import { ref, watch } from 'vue';
import { useVirtualList } from '@vueuse/core';
import type { EventsLogRecord } from '@/core/db/schemas';
import EventItem from '@/components/EventItem.vue';

interface Props {
  events: EventsLogRecord[];
}

const props = defineProps<Props>();

// Create a ref for virtual list items
const virtualItems = ref<{ event: EventsLogRecord; id: string }[]>([]);

// Watch for changes in props.events and update virtualItems
watch(
  () => props.events,
  (newEvents) => {
    virtualItems.value = newEvents.map(event => ({
      event,
      id: `event-${event.id}`,
    }));
  },
  { immediate: true, deep: true }, // immediate to run on mount, deep for safety
);

// Setup virtual list for large event lists
const { list, containerProps, wrapperProps } = useVirtualList(virtualItems, {
  itemHeight: 120, // Fixed height for event items
  overscan: 3,
});
</script>

<style scoped>
/* 自定义滚动条样式 */
.virtual-scroll-container :deep(.overflow-y-auto) {
  /* Firefox 滚动条 */
  scrollbar-width: thin;
  scrollbar-color: #cbd5e1 #f1f5f9;
}

.virtual-scroll-container :deep(.overflow-y-auto::-webkit-scrollbar) {
  width: 8px;
}

.virtual-scroll-container :deep(.overflow-y-auto::-webkit-scrollbar-track) {
  background: #f1f5f9;
  border-radius: 1px;
}

.virtual-scroll-container :deep(.overflow-y-auto::-webkit-scrollbar-thumb) {
  background: #cbd5e1;
  border-radius: 1px;
  transition: background-color 0.2s ease;
}

.virtual-scroll-container :deep(.overflow-y-auto::-webkit-scrollbar-thumb:hover) {
  background: #94a3b8;
}

.virtual-scroll-container :deep(.overflow-y-auto::-webkit-scrollbar-thumb:active) {
  background: #64748b;
}
</style>
