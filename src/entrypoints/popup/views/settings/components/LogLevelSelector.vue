<script lang="ts" setup>
import { ref, onMounted, watch } from 'vue';
import {
  getLogLevel,
  setLogLevel,
  getAvailableLogLevels,
} from '@/utils/logger';
import { createLogger } from '@/utils/logger';
import { type LogLevel } from '@/config/logging';

const logger = createLogger('LogLevelSelector');
const availableLevels = getAvailableLogLevels();
const selectedLevel = ref<LogLevel>();
const isLoading = ref(true);

onMounted(() => {
  try {
    selectedLevel.value = getLogLevel();
    logger.info('Log level selector mounted, current level:', selectedLevel.value);
  } catch (error) {
    logger.error('Failed to get log level on mount:', error);
  } finally {
    isLoading.value = false;
  }
});

watch(selectedLevel, async (newLevel, oldLevel) => {
  if (newLevel && oldLevel) {
    try {
      await setLogLevel(newLevel);
      logger.info('Log level changed to:', newLevel);
    } catch (error) {
      logger.error('Failed to set log level:', error);
    }
  }
});
</script>

<template>
  <div class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
    <div class="flex items-center justify-between">
      <div>
        <h3 class="text-base font-semibold text-gray-800">Log Level</h3>
        <p class="text-sm text-gray-500">
          Adjust the verbosity of extension logs.
        </p>
      </div>
      <div v-if="isLoading || !selectedLevel" class="h-9 w-28 animate-pulse rounded-md bg-gray-200"></div>
      <select
        v-else
        v-model="selectedLevel"
        class="rounded-md border-gray-300 py-1.5 pl-3 pr-8 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
      >
        <option v-for="level in availableLevels" :key="level" :value="level">
          {{ level.charAt(0).toUpperCase() + level.slice(1) }}
        </option>
      </select>
    </div>
  </div>
</template> 