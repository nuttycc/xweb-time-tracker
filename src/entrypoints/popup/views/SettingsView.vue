<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import { createLogger } from '@/utils/logger';
import DataMonitoringCard from './settings/components/DataMonitoringCard.vue';
import DataCleanupCard from './settings/components/DataCleanupCard.vue';
import LogLevelSelector from './settings/components/LogLevelSelector.vue';

const logger = createLogger('SettingsView');

const isLoading = ref(true);

onMounted(() => {
  logger.info('Settings view mounted');
  isLoading.value = false;
});
</script>

<template>
  <div class="h-full overflow-auto p-4">
    <div v-if="isLoading" class="flex h-full items-center justify-center">
      <div class="text-center">
        <div class="mb-2 text-blue-600">
          <svg
            class="mx-auto h-8 w-8 animate-spin"
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
        <p class="text-sm text-gray-600">Loading ...</p>
      </div>
    </div>

    <div v-else class="space-y-4">
      <h1 class="text-xl font-bold text-gray-800">Settings</h1>

      <!-- Log Level Configuration -->
      <LogLevelSelector />

      <!-- Data Storage Monitoring -->
      <DataMonitoringCard />

      <!-- Data Cleanup Configuration -->
      <DataCleanupCard />
    </div>
  </div>
</template>
