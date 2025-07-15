<script lang="ts" setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { browser } from '#imports';
import { createLogger } from '@/utils/logger';
import { databaseService, type DatabaseHealthInfo } from '@/core/db/services/database.service';
import { storageWarningThresholdPercent } from '@/config/storage';

const logger = createLogger('DataMonitoringCard');

// Data Status
const isLoading = ref(true);
const error = ref<string | null>(null);
const dbHealth = ref<DatabaseHealthInfo | null>(null);
const storageInfo = ref<{
  bytesInUse: number;
  quota: number;
  usagePercentage: number;
  isWarning: boolean;
} | null>(null);

// Storage monitoring
let storageWatcher: (() => void) | null = null;

// Format Storage Size
const formatStorageSize = (bytes: number): string => {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
};

// Get Storage Usage Information using WXT APIs
const getStorageInfo = async () => {
  try {
    let bytesInUse = 0;
    let quota = 0;

    // Try to get IndexedDB storage usage first (most accurate)
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      bytesInUse = estimate.usage || 0;
      quota = estimate.quota || 0;
    } else {
      // Fallback: Use WXT browser storage API
      try {
        // Get extension storage usage using WXT's browser API
        const localUsage = await browser.storage.local.getBytesInUse();
        const syncUsage = await browser.storage.sync.getBytesInUse();

        bytesInUse = (localUsage || 0) + (syncUsage || 0);

        // Extension storage quotas (Chrome limits)
        const localQuota = 5 * 1024 * 1024; // 5MB for local storage
        const syncQuota = 100 * 1024; // 100KB for sync storage
        quota = localQuota + syncQuota;
      } catch (storageError) {
        logger.warn('Failed to get browser storage usage', storageError);

        // Last fallback: Estimate based on database content
        const eventCount = dbHealth.value?.totalEventCount || 0;
        const statsCount = dbHealth.value?.totalStatsCount || 0;
        bytesInUse = eventCount * 500 + statsCount * 200; // Estimate 500 bytes per event, 200 bytes per stat
        quota = 100 * 1024 * 1024; // 100MB estimated quota
      }
    }

    // Get warning threshold from configuration
    const warningThreshold = await storageWarningThresholdPercent.getValue();
    const usagePercentage = quota > 0 ? (bytesInUse / quota) * 100 : 0;
    const isWarning = usagePercentage >= warningThreshold;

    return {
      bytesInUse,
      quota,
      usagePercentage,
      isWarning,
    };
  } catch (err) {
    logger.error('Failed to get storage info', err);
    return {
      bytesInUse: 0,
      quota: 100 * 1024 * 1024,
      usagePercentage: 0,
      isWarning: false,
    };
  }
};

// Load Database Health Information
const loadDatabaseHealth = async (): Promise<void> => {
  try {
    isLoading.value = true;
    error.value = null;

    const dbService = await databaseService.getInstance();
    dbHealth.value = await dbService.getDatabaseHealth();

    // Get Storage Usage Information
    storageInfo.value = await getStorageInfo();

    logger.info('Database health loaded', {
      dbHealth: dbHealth.value,
      storageInfo: storageInfo.value,
    });
  } catch (err) {
    logger.error('Failed to load database health:', err);
    error.value = err instanceof Error ? err.message : 'Failed to load data';
  } finally {
    isLoading.value = false;
  }
};

// Setup storage monitoring
const setupStorageMonitoring = () => {
  // Watch for storage warning threshold changes
  storageWatcher = storageWarningThresholdPercent.watch(async () => {
    // Recalculate storage info when threshold changes
    if (storageInfo.value) {
      storageInfo.value = await getStorageInfo();
    }
  });

  // Listen for storage changes to update usage in real-time
  browser.storage.onChanged.addListener(async (changes, areaName) => {
    if (areaName === 'local' || areaName === 'sync') {
      logger.debug('Storage changed, updating usage info', { areaName, changes });
      storageInfo.value = await getStorageInfo();
    }
  });
};

// Cleanup storage monitoring
const cleanupStorageMonitoring = () => {
  if (storageWatcher) {
    storageWatcher();
    storageWatcher = null;
  }
  // Note: browser.storage.onChanged listeners are automatically cleaned up
  // when the popup closes, so no explicit cleanup needed
};

// Refresh Data
const refreshData = (): void => {
  loadDatabaseHealth();
};

onMounted(() => {
  loadDatabaseHealth();
  setupStorageMonitoring();
});

onUnmounted(() => {
  cleanupStorageMonitoring();
});
</script>

<template>
  <div class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
    <div class="mb-3 flex items-center justify-between">
      <h3 class="font-medium text-gray-800">Data Storage Monitoring</h3>
      <button
        @click="refreshData"
        :disabled="isLoading"
        class="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
        title="Refresh Data"
      >
        <svg
          class="h-4 w-4"
          :class="{ 'animate-spin': isLoading }"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
      </button>
    </div>

    <!-- Loading Status -->
    <div v-if="isLoading" class="py-8 text-center">
      <div class="mb-2 text-blue-600">
        <svg
          class="mx-auto h-6 w-6 animate-spin"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            class="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            stroke-width="4"
          ></circle>
          <path
            class="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          ></path>
        </svg>
      </div>
      <p class="text-sm text-gray-600">Loading data...</p>
    </div>

    <!-- Error Status -->
    <div v-else-if="error" class="py-4 text-center">
      <div class="mb-2 text-red-500">
        <svg class="mx-auto h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </div>
      <p class="text-sm text-red-600">{{ error }}</p>
      <button
        @click="refreshData"
        class="mt-2 rounded bg-red-50 px-3 py-1 text-sm text-red-600 hover:bg-red-100"
      >
        Retry
      </button>
    </div>

    <!-- Data Display -->
    <div v-else-if="dbHealth && storageInfo" class="space-y-4">
      <!-- Database Status -->
      <div class="flex items-center justify-between">
        <span class="text-sm text-gray-600">Database Status</span>
        <span
          :class="dbHealth.isHealthy ? 'text-green-600' : 'text-red-600'"
          class="text-sm font-medium"
        >
          {{ dbHealth.isHealthy ? 'Healthy' : 'Unhealthy' }}
        </span>
      </div>

      <!-- Storage Usage -->
      <div class="flex items-center justify-between">
        <span class="text-sm text-gray-600">Storage Usage</span>
        <span class="text-sm font-medium text-gray-800">
          {{ formatStorageSize(storageInfo.bytesInUse) }}
        </span>
      </div>
    </div>
  </div>
</template>
