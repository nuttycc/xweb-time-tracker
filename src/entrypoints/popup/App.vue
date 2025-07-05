<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import { browser } from '#imports';
import { defineExtensionMessaging } from '@webext-core/messaging';
import { createLogger } from '@/utils/logger';
import DebugDataDisplay from '@/components/DebugDataDisplay.vue';
import type {
  PopupDebugProtocolMap,
  CompleteTabDataResponse,
  ManualAggregationRequest,
} from '@/types/messaging';
import { isTabDataErrorResponse } from '@/types/messaging';
import type { Browser } from 'wxt/browser';

// ============================================================================
// Setup and State Management
// ============================================================================

const logger = createLogger('PopupApp');

// Initialize messaging
const { sendMessage } = defineExtensionMessaging<PopupDebugProtocolMap>();

// Reactive state
const loading = ref(false);
const error = ref<string | null>(null);
const tabData = ref<CompleteTabDataResponse | null>(null);
const currentTab = ref<Browser.tabs.Tab | null>(null);

// Aggregation state
const aggregationLoading = ref(false);
const aggregationResult = ref<string | null>(null);

// ============================================================================
// Methods
// ============================================================================

/**
 * Get current active tab
 */
async function getCurrentTab(): Promise<Browser.tabs.Tab | null> {
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    return tabs[0] || null;
  } catch (err) {
    logger.error('Failed to get current tab:', err);
    return null;
  }
}

/**
 * Fetch tab data from background script
 */
async function fetchTabData(): Promise<void> {
  if (!currentTab.value?.id) {
    error.value = 'No active tab found';
    return;
  }

  loading.value = true;
  error.value = null;

  try {
    logger.debug('Requesting tab data', { tabId: currentTab.value.id });

    const response = await sendMessage('getTabDataRequest', {
      tabId: currentTab.value.id,
    });

    if (isTabDataErrorResponse(response)) {
      error.value = `${response.code}: ${response.error}`;
      tabData.value = null;
    } else {
      tabData.value = response as CompleteTabDataResponse;
      logger.debug('Received tab data', {
        eventsCount: response.events.length,
        statsCount: response.stats.length,
      });
    }
  } catch (err) {
    logger.error('Failed to fetch tab data:', err);
    error.value = err instanceof Error ? err.message : 'Unknown error occurred';
    tabData.value = null;
  } finally {
    loading.value = false;
  }
}

/**
 * Refresh data manually
 */
async function refreshData(): Promise<void> {
  logger.info('Manual refresh requested');
  await fetchTabData();
}

/**
 * Trigger manual aggregation
 */
async function triggerAggregation(): Promise<void> {
  aggregationLoading.value = true;
  aggregationResult.value = null;

  try {
    logger.info('Manual aggregation requested');

    const response = await sendMessage('triggerManualAggregation', {
      force: false,
    } as ManualAggregationRequest);

    if (response.success) {
      aggregationResult.value = `Success! Duration: ${response.duration}ms`;
      logger.info('Manual aggregation completed', { duration: response.duration });

      // Auto-refresh data after successful aggregation
      setTimeout(() => {
        fetchTabData();
      }, 500);
    } else {
      aggregationResult.value = `Failed: ${response.error}`;
      logger.error('Manual aggregation failed:', response.error);
    }
  } catch (err) {
    logger.error('Failed to trigger aggregation:', err);
    aggregationResult.value = `Error: ${err instanceof Error ? err.message : 'Unknown error'}`;
  } finally {
    aggregationLoading.value = false;

    // Clear result message after 3 seconds
    setTimeout(() => {
      aggregationResult.value = null;
    }, 3000);
  }
}

/**
 * Initialize popup
 */
async function initialize(): Promise<void> {
  logger.info('Initializing popup');

  // Get current tab
  currentTab.value = await getCurrentTab();

  if (!currentTab.value) {
    error.value = 'Unable to access current tab';
    return;
  }

  // Fetch initial data
  await fetchTabData();
}

// ============================================================================
// Lifecycle
// ============================================================================

onMounted(() => {
  initialize();
});
</script>

<template>
  <div class="animate-zoom-in h-[600px] w-96 bg-white">
    <!-- Header -->
    <div class="bg-gradient-to-r from-blue-600 to-blue-700 p-4 text-white shadow-lg">
      <div class="flex items-center justify-between">
        <div class="flex items-center space-x-2">
          <div class="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
            <span class="text-sm">⏱️</span>
          </div>
          <div>
            <h1 class="text-lg font-semibold">WebTime Debug</h1>
            <p class="text-xs text-blue-100">Development Tools</p>
          </div>
        </div>

        <div class="flex items-center space-x-2">
          <!-- Aggregation Button -->
          <button
            @click="triggerAggregation"
            :disabled="aggregationLoading || loading"
            class="group relative flex items-center space-x-1 rounded-lg bg-green-500 px-3 py-2 text-sm font-medium transition-all hover:bg-green-400 disabled:cursor-not-allowed disabled:bg-green-400/50"
            title="Trigger manual aggregation"
          >
            <span v-if="aggregationLoading" class="animate-pulse">⚡</span>
            <span v-else>🔧</span>
            <span class="hidden sm:inline">Aggregate</span>
          </button>

          <!-- Refresh Button -->
          <button
            @click="refreshData"
            :disabled="loading || aggregationLoading"
            class="group relative flex items-center space-x-1 rounded-lg bg-blue-500 px-3 py-2 text-sm font-medium transition-all hover:bg-blue-400 disabled:cursor-not-allowed disabled:bg-blue-400/50"
            title="Refresh data"
          >
            <span v-if="loading" class="animate-spin">⟳</span>
            <span v-else>🔄</span>
            <span class="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Aggregation Result -->
    <div v-if="aggregationResult" class="border-l-4 border-yellow-400 bg-yellow-50 p-3 text-sm">
      <div class="text-yellow-800">{{ aggregationResult }}</div>
    </div>

    <!-- Content -->
    <div class="h-full overflow-y-auto">
      <DebugDataDisplay
        :events="tabData?.events || []"
        :stats="tabData?.stats || []"
        :tab-info="tabData?.tabInfo || { id: 0, url: '', hostname: '' }"
        :loading="loading"
        :error="error || undefined"
      />
    </div>
  </div>
</template>

<style scoped>
/* Custom scrollbar for the main content */
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

/* Refresh button animation */
@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

button:disabled span {
  animation: spin 1s linear infinite;
}
</style>
