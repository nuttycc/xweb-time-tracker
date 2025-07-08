<script lang="ts" setup>
import { ref, onMounted, computed } from 'vue';
import { browser } from '#imports';
import { createLogger } from '@/utils/logger';
import { formatDuration } from '@/utils/time-formatter';
import { databaseService } from '@/core/db/services';
import type { AggregatedStatsRecord } from '@/core/db/schemas';
import * as psl from 'psl';

const logger = createLogger('FocusView');

// Reactive state
const loading = ref(false);
const dataLoading = ref(false);
const error = ref<string | null>(null);
const currentUrl = ref<string>('');
const currentHostname = ref<string>('');
const currentParentDomain = ref<string>('');
const aggregatedStats = ref<AggregatedStatsRecord[]>([]);

// Computed properties for data aggregation
const totalStats = computed(() => {
  if (aggregatedStats.value.length === 0) {
    return { totalOpenTime: 0, totalActiveTime: 0 };
  }

  return aggregatedStats.value.reduce(
    (acc, stat) => ({
      totalOpenTime: acc.totalOpenTime + stat.total_open_time,
      totalActiveTime: acc.totalActiveTime + stat.total_active_time,
    }),
    { totalOpenTime: 0, totalActiveTime: 0 }
  );
});

// Group stats by hostname for hierarchical display
const statsByHostname = computed(() => {
  const grouped = new Map<string, AggregatedStatsRecord[]>();

  for (const stat of aggregatedStats.value) {
    if (!grouped.has(stat.hostname)) {
      grouped.set(stat.hostname, []);
    }
    grouped.get(stat.hostname)!.push(stat);
  }

  // Convert to array and sort by total time
  return Array.from(grouped.entries())
    .map(([hostname, stats]) => ({
      hostname,
      stats,
      totalOpenTime: stats.reduce((sum, s) => sum + s.total_open_time, 0),
      totalActiveTime: stats.reduce((sum, s) => sum + s.total_active_time, 0),
    }))
    .sort((a, b) => b.totalOpenTime - a.totalOpenTime);
});

/**
 * Extract parent domain using PSL
 */
function extractParentDomain(hostname: string): string {
  try {
    const domain = psl.get(hostname);
    return domain || hostname;
  } catch (error) {
    logger.warn('Failed to extract parent domain, using hostname', { hostname, error });
    return hostname;
  }
}

/**
 * Get current active tab and extract domain information
 */
async function getCurrentTabInfo(): Promise<void> {
  loading.value = true;
  error.value = null;

  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const currentTab = tabs[0];

    if (!currentTab?.url) {
      error.value = '无法获取当前标签页信息';
      return;
    }

    currentUrl.value = currentTab.url;

    // Extract hostname and parent domain from URL
    try {
      const url = new URL(currentTab.url);
      currentHostname.value = url.hostname;
      currentParentDomain.value = extractParentDomain(url.hostname);
    } catch (urlError) {
      logger.error('Failed to parse URL:', urlError);
      currentHostname.value = '无效URL';
      currentParentDomain.value = '无效URL';
    }

    logger.info('Current tab info loaded', {
      url: currentUrl.value,
      hostname: currentHostname.value,
      parentDomain: currentParentDomain.value,
    });

    // Load aggregated data for this parent domain
    await loadAggregatedData();
  } catch (err) {
    logger.error('Failed to get current tab:', err);
    error.value = err instanceof Error ? err.message : '获取标签页信息失败';
  } finally {
    loading.value = false;
  }
}

/**
 * Load aggregated statistics for the current parent domain
 */
async function loadAggregatedData(): Promise<void> {
  if (!currentParentDomain.value || currentParentDomain.value === '无效URL') {
    return;
  }

  dataLoading.value = true;

  try {
    const dbService = await databaseService.getInstance();
    const stats = await dbService.getStatsByParentDomain(currentParentDomain.value);

    aggregatedStats.value = stats;

    logger.info('Aggregated data loaded', {
      parentDomain: currentParentDomain.value,
      statsCount: stats.length,
      totalOpenTime: totalStats.value.totalOpenTime,
      totalActiveTime: totalStats.value.totalActiveTime,
    });
  } catch (err) {
    logger.error('Failed to load aggregated data:', err);
    error.value = err instanceof Error ? err.message : '加载数据失败';
  } finally {
    dataLoading.value = false;
  }
}

onMounted(() => {
  getCurrentTabInfo();
});
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- Header -->
    <div class="flex-shrink-0 border-b border-gray-200 p-3">
      <div class="flex items-center space-x-2">
        <span class="text-base">🎯</span>
        <div>
          <h2 class="text-base font-medium text-gray-900">Current Domain Insights</h2>
          <p class="text-xs text-gray-600">View activity data for current website</p>
        </div>
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
        <!-- Current Domain Info -->
        <div class="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <h3 class="mb-2 font-medium text-blue-900">Current Domain</h3>
          <div class="space-y-2">
            <div class="flex items-center space-x-2">
              <span class="rounded bg-blue-100 px-2 py-1 font-mono text-sm text-blue-700">
                {{ currentParentDomain }}
              </span>
              <span class="text-xs text-blue-600">Parent Domain</span>
            </div>
            <div class="text-xs text-blue-600">
              <div>Hostname: {{ currentHostname }}</div>
              <div class="mt-1 break-all">Full URL: {{ currentUrl }}</div>
            </div>
          </div>
        </div>

        <!-- Domain Activity Summary -->
        <div class="rounded-lg border border-green-200 bg-green-50 p-4">
          <h3 class="mb-3 font-medium text-green-900">Domain Activity Statistics</h3>
          <div v-if="dataLoading" class="flex items-center justify-center py-4">
            <div class="h-6 w-6 animate-spin rounded-full border-b-2 border-green-600"></div>
            <span class="ml-2 text-sm text-green-600">Loading data...</span>
          </div>
          <div v-else-if="aggregatedStats.length === 0" class="py-4 text-center text-green-600">
            <span class="mb-2 block text-2xl">📊</span>
            <p class="text-sm">No activity records for this domain</p>
          </div>
          <div v-else class="grid grid-cols-2 gap-4">
            <div class="text-center">
              <div class="text-2xl font-bold text-green-800">
                {{ formatDuration(totalStats.totalOpenTime) }}
              </div>
              <div class="text-xs text-green-600">Total Open Time</div>
            </div>
            <div class="text-center">
              <div class="text-2xl font-bold text-green-800">
                {{ formatDuration(totalStats.totalActiveTime) }}
              </div>
              <div class="text-xs text-green-600">Total Active Time</div>
            </div>
          </div>
        </div>

        <!-- Hierarchical Details -->
        <div class="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <h3 class="mb-3 font-medium text-gray-900">Hierarchical Details</h3>
          <div v-if="aggregatedStats.length === 0" class="py-4 text-center text-gray-500">
            <span class="mb-2 block text-2xl">🌳</span>
            <p class="text-sm">No hierarchical data available</p>
          </div>
          <div v-else class="space-y-3">
            <!-- Hostname Groups -->
            <div
              v-for="hostnameGroup in statsByHostname"
              :key="hostnameGroup.hostname"
              class="rounded border border-gray-300 bg-white"
            >
              <!-- Hostname Header -->
              <div class="flex items-center justify-between bg-gray-100 px-3 py-2">
                <div class="flex items-center space-x-2">
                  <span class="text-sm font-medium text-gray-800">{{
                    hostnameGroup.hostname
                  }}</span>
                  <span class="rounded bg-gray-200 px-2 py-1 text-xs text-gray-600">
                    {{ hostnameGroup.stats.length }} pages
                  </span>
                </div>
                <div class="text-xs text-gray-600">
                  {{ formatDuration(hostnameGroup.totalOpenTime) }}
                </div>
              </div>

              <!-- URL Details -->
              <div class="divide-y divide-gray-200">
                <div v-for="stat in hostnameGroup.stats" :key="stat.key" class="px-3 py-2">
                  <div class="flex items-center justify-between">
                    <div class="min-w-0 flex-1">
                      <div :title="stat.url" class="truncate text-sm text-gray-900">{{ stat.url }}</div>
                      <div class="text-xs text-gray-500">{{ stat.date }}</div>
                    </div>
                    <div class="ml-2 text-right">
                      <div class="text-sm font-medium text-gray-900">
                        {{ formatDuration(stat.total_open_time) }}
                      </div>
                      <div class="text-xs text-gray-500">
                        Active: {{ formatDuration(stat.total_active_time) }}
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
