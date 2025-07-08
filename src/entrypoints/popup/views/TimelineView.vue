<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { createLogger } from '@/utils/logger';
import { formatDuration, getDateRange, type DateRange } from '@/utils/time-formatter';
import { databaseService } from '@/core/db/services';
import type { AggregatedStatsRecord } from '@/core/db/schemas';

const logger = createLogger('TimelineView');

// Reactive state
const loading = ref(false);
const error = ref<string | null>(null);
const selectedTimeRange = ref<string>('today');
const aggregatedStats = ref<AggregatedStatsRecord[]>([]);

// Time range options
const timeRangeOptions = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'all', label: 'All Time' },
];

// Computed properties for data aggregation
const totalStats = computed(() => {
  if (aggregatedStats.value.length === 0) {
    return { totalOpenTime: 0, totalActiveTime: 0, recordCount: 0 };
  }

  return aggregatedStats.value.reduce(
    (acc, stat) => ({
      totalOpenTime: acc.totalOpenTime + stat.total_open_time,
      totalActiveTime: acc.totalActiveTime + stat.total_active_time,
      recordCount: acc.recordCount + 1,
    }),
    { totalOpenTime: 0, totalActiveTime: 0, recordCount: 0 }
  );
});

// Group stats by parent domain for hierarchical display
const statsByParentDomain = computed(() => {
  const grouped = new Map<string, AggregatedStatsRecord[]>();

  for (const stat of aggregatedStats.value) {
    if (!grouped.has(stat.parentDomain)) {
      grouped.set(stat.parentDomain, []);
    }
    grouped.get(stat.parentDomain)!.push(stat);
  }

  // Convert to array and sort by total time
  return Array.from(grouped.entries())
    .map(([parentDomain, stats]) => ({
      parentDomain,
      stats,
      totalOpenTime: stats.reduce((sum, s) => sum + s.total_open_time, 0),
      totalActiveTime: stats.reduce((sum, s) => sum + s.total_active_time, 0),
      hostnameCount: new Set(stats.map(s => s.hostname)).size,
      urlCount: stats.length,
    }))
    .sort((a, b) => b.totalOpenTime - a.totalOpenTime);
});

// Group stats by hostname within each parent domain
const getHostnameGroups = (stats: AggregatedStatsRecord[]) => {
  const grouped = new Map<string, AggregatedStatsRecord[]>();

  for (const stat of stats) {
    if (!grouped.has(stat.hostname)) {
      grouped.set(stat.hostname, []);
    }
    grouped.get(stat.hostname)!.push(stat);
  }

  return Array.from(grouped.entries())
    .map(([hostname, hostStats]) => ({
      hostname,
      stats: hostStats.sort((a, b) => b.total_open_time - a.total_open_time),
      totalOpenTime: hostStats.reduce((sum, s) => sum + s.total_open_time, 0),
      totalActiveTime: hostStats.reduce((sum, s) => sum + s.total_active_time, 0),
    }))
    .sort((a, b) => b.totalOpenTime - a.totalOpenTime);
};

// Current date range info
const currentDateRange = computed((): DateRange => {
  return getDateRange(selectedTimeRange.value);
});

/**
 * Load aggregated statistics for the selected time range
 */
async function loadTimelineData(): Promise<void> {
  loading.value = true;
  error.value = null;

  try {
    const dateRange = currentDateRange.value;
    const dbService = await databaseService.getInstance();

    logger.info('Loading timeline data', {
      timeRange: selectedTimeRange.value,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
    });

    const stats = await dbService.getStatsByDateRange(dateRange.startDate, dateRange.endDate, {
      orderBy: 'date',
      orderDirection: 'desc', // Most recent first
    });

    aggregatedStats.value = stats;

    logger.info('Timeline data loaded', {
      timeRange: selectedTimeRange.value,
      statsCount: stats.length,
      totalOpenTime: totalStats.value.totalOpenTime,
      totalActiveTime: totalStats.value.totalActiveTime,
      domainCount: statsByParentDomain.value.length,
    });
  } catch (err) {
    logger.error('Failed to load timeline data:', err);
    error.value = err instanceof Error ? err.message : '加载数据失败';
  } finally {
    loading.value = false;
  }
}

/**
 * Handle time range change
 */
async function handleTimeRangeChange(): Promise<void> {
  logger.info('Time range changed', { selectedTimeRange: selectedTimeRange.value });
  await loadTimelineData();
}

onMounted(() => {
  logger.info('TimelineView mounted');
  loadTimelineData();
});
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- Header -->
    <div class="flex-shrink-0 border-b border-gray-200 p-3">
      <div class="flex items-center justify-between">
        <div class="flex items-center space-x-2">
          <span class="text-base">📊</span>
          <div>
            <h2 class="text-base font-medium text-gray-900">Activity Timeline</h2>
            <p class="text-xs text-gray-600">Browse all recorded activity history</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Time Range Filter -->
    <div class="flex-shrink-0 border-b border-gray-200 bg-gray-50 p-4">
      <div class="flex items-center space-x-2">
        <label for="timeRange" class="text-sm font-medium text-gray-700">Time Range:</label>
        <select
          id="timeRange"
          v-model="selectedTimeRange"
          @change="handleTimeRangeChange"
          class="block w-32 rounded-md border border-gray-300 px-3 py-1 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500 focus:outline-none"
        >
          <option v-for="option in timeRangeOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </div>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto p-4">
      <!-- Loading State -->
      <div v-if="loading" class="flex items-center justify-center py-8">
        <div class="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600"></div>
        <span class="ml-2 text-gray-600">Loading...</span>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="rounded-lg border border-red-200 bg-red-50 p-4">
        <div class="flex items-center">
          <span class="mr-2 text-xl text-red-500">⚠️</span>
          <div>
            <h3 class="font-medium text-red-800">Error</h3>
            <p class="text-sm text-red-700">{{ error }}</p>
          </div>
        </div>
      </div>

      <!-- Main Content -->
      <div v-else class="space-y-6">
        <!-- Time Range Summary -->
        <div class="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <h3 class="mb-2 font-medium text-blue-900">Time Range Summary</h3>
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-sm text-blue-700">Viewing Range:</span>
              <span class="font-medium text-blue-800">
                {{ timeRangeOptions.find(opt => opt.value === selectedTimeRange)?.label }}
              </span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-sm text-blue-700">Date Range:</span>
              <span class="font-mono text-xs text-blue-600">
                {{ currentDateRange.startDate }} ~ {{ currentDateRange.endDate }}
              </span>
            </div>
          </div>
        </div>

        <!-- Overall Statistics -->
        <div class="rounded-lg border border-green-200 bg-green-50 p-4">
          <h3 class="mb-3 font-medium text-green-900">总体统计</h3>
          <div v-if="aggregatedStats.length === 0" class="py-4 text-center text-green-600">
            <span class="mb-2 block text-2xl">📊</span>
            <p class="text-sm">该时间范围内暂无活动记录</p>
          </div>
          <div v-else class="grid grid-cols-3 gap-4 text-center">
            <div>
              <div class="text-lg font-bold text-green-800">
                {{ formatDuration(totalStats.totalOpenTime) }}
              </div>
              <div class="text-xs text-green-600">总访问时长</div>
            </div>
            <div>
              <div class="text-lg font-bold text-green-800">
                {{ formatDuration(totalStats.totalActiveTime) }}
              </div>
              <div class="text-xs text-green-600">总活跃时长</div>
            </div>
            <div>
              <div class="text-lg font-bold text-green-800">{{ statsByParentDomain.length }}</div>
              <div class="text-xs text-green-600">访问域名</div>
            </div>
          </div>
        </div>

        <!-- Domain Activity List -->
        <div class="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <h3 class="mb-3 font-medium text-gray-900">域名活动列表</h3>
          <div v-if="aggregatedStats.length === 0" class="py-4 text-center text-gray-500">
            <span class="mb-2 block text-2xl">🌐</span>
            <p class="text-sm">暂无域名活动数据</p>
          </div>
          <div v-else class="space-y-3">
            <!-- Parent Domain Groups -->
            <div
              v-for="domainGroup in statsByParentDomain"
              :key="domainGroup.parentDomain"
              class="rounded border border-gray-300 bg-white"
            >
              <!-- Parent Domain Header -->
              <div class="flex items-center justify-between bg-gray-100 px-3 py-2">
                <div class="flex items-center space-x-2">
                  <span class="text-sm font-medium text-gray-800">{{
                    domainGroup.parentDomain
                  }}</span>
                  <span class="rounded bg-gray-200 px-2 py-1 text-xs text-gray-600">
                    {{ domainGroup.hostnameCount }} 主机 / {{ domainGroup.urlCount }} 页面
                  </span>
                </div>
                <div class="text-xs text-gray-600">
                  {{ formatDuration(domainGroup.totalOpenTime) }}
                </div>
              </div>

              <!-- Hostname Groups -->
              <div class="divide-y divide-gray-200">
                <div
                  v-for="hostnameGroup in getHostnameGroups(domainGroup.stats)"
                  :key="hostnameGroup.hostname"
                  class="px-3 py-2"
                >
                  <!-- Hostname Header -->
                  <div class="mb-2 flex items-center justify-between">
                    <div class="flex items-center space-x-2">
                      <span class="text-sm font-medium text-gray-700">{{
                        hostnameGroup.hostname
                      }}</span>
                      <span class="rounded bg-blue-100 px-2 py-1 text-xs text-blue-600">
                        {{ hostnameGroup.stats.length }} 页面
                      </span>
                    </div>
                    <div class="text-xs text-gray-600">
                      {{ formatDuration(hostnameGroup.totalOpenTime) }}
                    </div>
                  </div>

                  <!-- URL Details -->
                  <div class="ml-4 space-y-1">
                    <div
                      v-for="stat in hostnameGroup.stats"
                      :key="stat.key"
                      class="flex items-center justify-between py-1"
                    >
                      <div class="min-w-0 flex-1">
                        <div class="truncate text-xs text-gray-600">{{ stat.url }}</div>
                        <div class="text-xs text-gray-400">{{ stat.date }}</div>
                      </div>
                      <div class="ml-2 text-right">
                        <div class="text-xs font-medium text-gray-700">
                          {{ formatDuration(stat.total_open_time) }}
                        </div>
                        <div class="text-xs text-gray-500">
                          活跃: {{ formatDuration(stat.total_active_time) }}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Custom scrollbar */
.overflow-y-auto::-webkit-scrollbar {
  width: 6px;
}

.overflow-y-auto::-webkit-scrollbar-track {
  background: #f1f5f9;
}

.overflow-y-auto::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 3px;
}

.overflow-y-auto::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}
</style>
