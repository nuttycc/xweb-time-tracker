<script lang="ts" setup>
import type { EventsLogRecord, AggregatedStatsRecord } from '@/core/db';
import { computed, ref } from 'vue';
import { EVENT_TYPES } from '@/core/db/models/eventslog.model';

// ============================================================================
// Props Definition
// ============================================================================

interface Props {
  /** Events log data to display */
  events: EventsLogRecord[];

  /** Aggregated statistics data to display */
  stats: AggregatedStatsRecord[];

  /** Current tab information */
  tabInfo: {
    id: number;
    url: string;
    hostname: string;
    title?: string;
  };

  /** Loading state */
  loading?: boolean;

  /** Error message if any */
  error?: string;
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  error: undefined,
});

// ============================================================================
// Filter State
// ============================================================================

/** Event filter options */
const eventFilter = ref<'all' | 'processed' | 'unprocessed'>('all');
const eventTypeFilter = ref<string>('all');

// ============================================================================
// Computed Properties
// ============================================================================

/** Format timestamp for display */
const formatTimestamp = (timestamp: number) => {
  return new Date(timestamp).toLocaleString();
};

/** Format time duration in milliseconds to human readable format */
const formatDuration = (ms: number) => {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
};

// 辅助函数：区分 checkpoint 类型
function getDisplayEventType(event: EventsLogRecord): string {
  if (event.eventType === 'checkpoint') {
    return event.activityId ? 'checkpoint_active_time' : 'checkpoint_open_time';
  }
  return event.eventType;
}

// 所有可选类型（含合成类型）
const ALL_EVENT_TYPE_OPTIONS = [
  ...EVENT_TYPES.filter(t => t !== 'checkpoint'),
  'checkpoint_active_time',
  'checkpoint_open_time',
];

/** Available event types for filtering */
const availableEventTypes = computed(() => {
  return ALL_EVENT_TYPE_OPTIONS;
});

/** Get event type display color */
const getEventTypeColor = (eventType: string) => {
  const colors: Record<string, string> = {
    open_time_start: 'text-green-600',
    open_time_end: 'text-red-600',
    active_time_start: 'text-blue-600',
    active_time_end: 'text-orange-600',
    checkpoint_active_time: 'text-purple-700',
    checkpoint_open_time: 'text-purple-400',
    checkpoint: 'text-purple-600', // fallback
  };
  return colors[eventType] || 'text-gray-600';
};

/** Filter and sort events by timestamp (newest first) */
const sortedEvents = computed(() => {
  let filteredEvents = [...props.events];

  // Apply processing status filter
  if (eventFilter.value === 'processed') {
    filteredEvents = filteredEvents.filter(event => event.isProcessed === 1);
  } else if (eventFilter.value === 'unprocessed') {
    filteredEvents = filteredEvents.filter(event => event.isProcessed === 0);
  }

  // Apply event type filter (基于 display type)
  if (eventTypeFilter.value !== 'all') {
    filteredEvents = filteredEvents.filter(
      event => getDisplayEventType(event) === eventTypeFilter.value
    );
  }

  // Sort by timestamp (newest first)
  return filteredEvents.sort((a, b) => b.timestamp - a.timestamp);
});

/** Get summary statistics */
const eventsSummary = computed(() => {
  const total = props.events.length;
  const processed = props.events.filter(e => e.isProcessed === 1).length;
  const unprocessed = total - processed;
  const filtered = sortedEvents.value.length;

  return { total, processed, unprocessed, filtered };
});

/** Parse URL to get detailed information */
const parseUrlDetails = (url: string) => {
  try {
    const urlObj = new URL(url);
    return {
      protocol: urlObj.protocol,
      hostname: urlObj.hostname,
      port: urlObj.port,
      pathname: urlObj.pathname,
      search: urlObj.search,
      hash: urlObj.hash,
      fullPath: urlObj.pathname + urlObj.search + urlObj.hash,
    };
  } catch {
    return {
      protocol: '',
      hostname: url,
      port: '',
      pathname: '',
      search: '',
      hash: '',
      fullPath: '',
    };
  }
};

/** Group stats by hostname and calculate host summaries */
const groupedStats = computed(() => {
  if (props.stats.length === 0) return {};

  const groups: Record<
    string,
    {
      hostname: string;
      totalOpenTime: number;
      totalActiveTime: number;
      visitCount: number;
      paths: AggregatedStatsRecord[];
    }
  > = {};

  // Group by hostname
  props.stats.forEach(stat => {
    if (!groups[stat.hostname]) {
      groups[stat.hostname] = {
        hostname: stat.hostname,
        totalOpenTime: 0,
        totalActiveTime: 0,
        visitCount: 0,
        paths: [],
      };
    }

    groups[stat.hostname].totalOpenTime += stat.total_open_time;
    groups[stat.hostname].totalActiveTime += stat.total_active_time;
    groups[stat.hostname].visitCount += 1;
    groups[stat.hostname].paths.push(stat);
  });

  // Sort paths within each group by total time (descending)
  Object.values(groups).forEach(group => {
    group.paths.sort(
      (a, b) => b.total_open_time + b.total_active_time - (a.total_open_time + a.total_active_time)
    );
  });

  return groups;
});

/** Get sorted hostnames by total time */
const sortedHostnames = computed(() => {
  return Object.keys(groupedStats.value).sort((a, b) => {
    const groupA = groupedStats.value[a];
    const groupB = groupedStats.value[b];
    return (
      groupB.totalOpenTime +
      groupB.totalActiveTime -
      (groupA.totalOpenTime + groupA.totalActiveTime)
    );
  });
});
</script>

<template>
  <div class="space-y-4 p-4">
    <!-- Loading State -->
    <div v-if="loading && !events.length && !stats.length" class="flex items-center justify-center py-8">
      <div class="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-500"></div>
      <span class="ml-2 text-gray-600">Loading data...</span>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="rounded-lg border border-red-200 bg-red-50 p-4">
      <div class="flex items-center">
        <div class="mr-2 text-xl text-red-500">⚠️</div>
        <div>
          <h3 class="font-medium text-red-800">Error Loading Data</h3>
          <p class="mt-1 text-sm text-red-600">{{ error }}</p>
        </div>
      </div>
    </div>

    <!-- Data Display -->
    <template v-else>
      <!-- Tab Information -->
      <div class="rounded-lg bg-gray-50 p-4">
        <h2 class="mb-2 text-lg font-semibold text-gray-800">Current Tab Information</h2>
        <div class="space-y-1 text-sm">
          <div><span class="font-medium">ID:</span> {{ tabInfo.id }}</div>
          <div><span class="font-medium">Hostname:</span> {{ tabInfo.hostname }}</div>
          <div><span class="font-medium">Title:</span> {{ tabInfo.title || 'N/A' }}</div>
          <div class="break-all"><span class="font-medium">URL:</span> {{ tabInfo.url }}</div>
        </div>
      </div>

      <!-- Aggregated Statistics -->
      <div class="rounded-lg bg-blue-50 p-4">
        <h2 class="mb-3 text-lg font-semibold text-gray-800">Aggregated Data</h2>
        <div v-if="stats.length === 0" class="text-sm text-gray-500">
          No aggregated data found for this domain.
        </div>
        <div v-else class="space-y-4">
          <!-- Host Groups -->
          <div v-for="hostname in sortedHostnames" :key="hostname" class="space-y-3">
            <!-- Host Summary -->
            <div class="rounded-lg bg-gradient-to-r from-blue-100 to-indigo-100 p-4 shadow-md">
              <div class="mb-3 flex items-center justify-between">
                <h3 class="flex items-center text-lg font-bold text-gray-800">
                  <span class="mr-2 text-blue-600">🌐</span>
                  {{ hostname }}
                </h3>
                <span class="rounded-full bg-white px-2 py-1 text-sm text-gray-600">
                  {{ groupedStats[hostname].visitCount }} paths
                </span>
              </div>

              <div class="grid grid-cols-2 gap-6 text-sm">
                <div class="flex items-center">
                  <span class="mr-2 font-medium text-gray-700">总打开时间:</span>
                  <span class="text-lg font-bold text-green-600">
                    {{ formatDuration(groupedStats[hostname].totalOpenTime) }}
                  </span>
                </div>
                <div class="flex items-center">
                  <span class="mr-2 font-medium text-gray-700">总活跃时间:</span>
                  <span class="text-lg font-bold text-blue-600">
                    {{ formatDuration(groupedStats[hostname].totalActiveTime) }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Path Details -->
            <div class="ml-4 space-y-2">
              <div
                v-for="stat in groupedStats[hostname].paths"
                :key="stat.key"
                class="rounded border-l-4 border-gray-300 bg-white p-3 shadow-sm transition-colors hover:border-blue-400"
              >
                <div class="space-y-2 text-sm">
                  <!-- Path Info -->
                  <div class="flex items-start justify-between">
                    <div class="flex-1">
                      <div class="mb-1 font-medium text-gray-800">
                        {{ parseUrlDetails(stat.url).fullPath || '/' }}
                      </div>
                      <div class="font-mono text-xs break-all text-gray-500">
                        {{ stat.url }}
                      </div>
                    </div>
                    <div class="ml-2 text-xs text-gray-400">
                      {{ stat.date }}
                    </div>
                  </div>

                  <!-- Time Data -->
                  <div class="grid grid-cols-2 gap-4 border-t border-gray-100 pt-2">
                    <div class="flex items-center">
                      <span class="mr-2 h-2 w-2 rounded-full bg-green-400"></span>
                      <span class="font-medium text-gray-600">打开:</span>
                      <span class="ml-1 font-semibold text-green-600">
                        {{ formatDuration(stat.total_open_time) }}
                      </span>
                    </div>
                    <div class="flex items-center">
                      <span class="mr-2 h-2 w-2 rounded-full bg-blue-400"></span>
                      <span class="font-medium text-gray-600">活跃:</span>
                      <span class="ml-1 font-semibold text-blue-600">
                        {{ formatDuration(stat.total_active_time) }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Events Log -->
      <div class="rounded-lg bg-green-50 p-4">
        <div class="mb-3">
          <h2 class="text-lg font-semibold text-gray-800">Event Log</h2>
          <div class="text-sm text-gray-600">
            Total: {{ eventsSummary.total }} | Processed: {{ eventsSummary.processed }} |
            Unprocessed: {{ eventsSummary.unprocessed }}
            <span v-if="eventsSummary.filtered !== eventsSummary.total" class="text-blue-600">
              | Showing: {{ eventsSummary.filtered }}
            </span>
          </div>
        </div>

        <!-- Filters -->
        <div class="mb-3 flex flex-wrap gap-3 rounded bg-white p-3 shadow-sm">
          <div class="flex items-center space-x-2">
            <label class="text-sm font-medium text-gray-700">Status:</label>
            <select
              v-model="eventFilter"
              class="rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="all">All Events</option>
              <option value="processed">Processed Only</option>
              <option value="unprocessed">Unprocessed Only</option>
            </select>
          </div>

          <div class="flex items-center space-x-2">
            <label class="text-sm font-medium text-gray-700">Type:</label>
            <select
              v-model="eventTypeFilter"
              class="rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="all">All Types</option>
              <option v-for="type in availableEventTypes" :key="type" :value="type">
                {{ type }}
              </option>
            </select>
          </div>

          <!-- Filter Reset Button -->
          <button
            v-if="eventFilter !== 'all' || eventTypeFilter !== 'all'"
            @click="
              eventFilter = 'all';
              eventTypeFilter = 'all';
            "
            class="rounded bg-gray-100 px-2 py-1 text-sm text-gray-600 hover:bg-gray-200"
            title="Clear all filters"
          >
            Clear Filters
          </button>
        </div>

        <div v-if="events.length === 0" class="text-sm text-gray-500">
          No events found for this tab.
        </div>

        <div v-else-if="sortedEvents.length === 0" class="text-sm text-gray-500">
          No events match the current filters.
        </div>

        <div v-else class="max-h-64 space-y-2 overflow-y-auto">
          <div
            v-for="event in sortedEvents"
            :key="event.id"
            class="rounded border-l-4 bg-white p-3 shadow-sm"
            :class="event.isProcessed === 1 ? 'border-green-400' : 'border-yellow-400'"
          >
            <div class="mb-1 flex items-center justify-between">
              <span
                class="text-sm font-medium"
                :class="getEventTypeColor(getDisplayEventType(event))"
              >
                {{ getDisplayEventType(event) }}
              </span>
              <span class="text-xs text-gray-500">
                {{ event.isProcessed === 1 ? 'Processed' : 'Unprocessed' }}
              </span>
            </div>

            <div class="space-y-1 text-xs text-gray-600">
              <div>{{ formatTimestamp(event.timestamp) }}</div>
              <div>Tab: {{ event.tabId }} | Visit: {{ event.visitId.slice(0, 8) }}...</div>
              <div v-if="event.activityId">Activity: {{ event.activityId.slice(0, 8) }}...</div>

              <!-- URL Details for Events -->
              <div class="mt-2 border-t pt-1">
                <div><span class="font-medium">URL:</span> {{ event.url }}</div>
                <div v-if="parseUrlDetails(event.url).fullPath !== '/'">
                  <span class="font-medium">Path:</span>
                  <span class="font-mono text-xs break-all">{{
                    parseUrlDetails(event.url).fullPath
                  }}</span>
                </div>
              </div>

              <div v-if="event.resolution" class="text-orange-600">
                Resolution: {{ event.resolution }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* Custom scrollbar for events log */
.overflow-y-auto::-webkit-scrollbar {
  width: 4px;
}

.overflow-y-auto::-webkit-scrollbar-track {
  background: #f1f5f9;
  border-radius: 2px;
}

.overflow-y-auto::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 2px;
}

.overflow-y-auto::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}
</style>
