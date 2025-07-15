<script lang="ts" setup>
import { ref, onMounted, computed } from 'vue';
import { createLogger } from '@/utils/logger';
import { configManager } from '@/config/manager';
import type { Config } from '@/config/constants';

const logger = createLogger('DataCleanupCard');

// Component State
const isLoading = ref(true);
const isSaving = ref(false);
const error = ref<string | null>(null);
const config = ref<Config | null>(null);

// Form Data
const formData = ref({
  retentionPolicy: 'immediate' as 'immediate' | 'short' | 'long' | 'permanent',
  customLongDays: 30, // Custom days for long retention policy
});

// Retention Policy Options
const retentionPolicyOptions = [
  { value: 'immediate', label: 'Immediate Cleanup', description: 'Clean up after 1 day' },
  { value: 'short', label: 'Short Retention', description: 'Clean up after 7 days' },
  { value: 'long', label: 'Long Retention', description: 'Clean up after custom days' },
  { value: 'permanent', label: 'Permanent Retention', description: 'Never clean up' },
];

// Calculate Retention Days Display
const retentionDaysDisplay = computed(() => {
  switch (formData.value.retentionPolicy) {
    case 'immediate':
      return '1 day (Immediate Cleanup)';
    case 'short':
      return `${config.value?.retentionPolicy.shortDays || 7} days`;
    case 'long':
      return `${formData.value.customLongDays} days`;
    case 'permanent':
      return 'Permanent Retention';
    default:
      return 'Unknown Policy';
  }
});

// Load Config
const loadConfig = async (): Promise<void> => {
  try {
    isLoading.value = true;
    error.value = null;

    await configManager.initialize();
    config.value = configManager.getConfig();

    // Update Form Data
    formData.value = {
      retentionPolicy: config.value.retentionPolicy.policy,
      customLongDays: config.value.retentionPolicy.longDays,
    };

    logger.info('Config loaded', config.value);
  } catch (err) {
    logger.error('Failed to load config:', err);
    error.value = err instanceof Error ? err.message : 'Failed to load config';
  } finally {
    isLoading.value = false;
  }
};

// Save Config
const saveConfig = async (): Promise<void> => {
  try {
    isSaving.value = true;
    error.value = null;

    // Update Config
    await configManager.updateConfig({
      retentionPolicy: {
        ...config.value!.retentionPolicy,
        policy: formData.value.retentionPolicy,
        longDays: formData.value.customLongDays,
      },
    });

    // Reload config to ensure sync
    await loadConfig();

    logger.info('Config saved successfully');
  } catch (err) {
    logger.error('Failed to save config:', err);
    error.value = err instanceof Error ? err.message : 'Failed to save config';
  } finally {
    isSaving.value = false;
  }
};

// Reset Config
const resetConfig = (): void => {
  if (config.value) {
    formData.value = {
      retentionPolicy: config.value.retentionPolicy.policy,
      customLongDays: config.value.retentionPolicy.longDays,
    };
  }
};

onMounted(() => {
  loadConfig();
});
</script>

<template>
  <div class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
    <h3 class="mb-3 font-medium text-gray-800">Data Cleanup Configuration</h3>

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
      <p class="text-sm text-gray-600">Loading config...</p>
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
        @click="loadConfig"
        class="mt-2 rounded bg-red-50 px-3 py-1 text-sm text-red-600 hover:bg-red-100"
      >
        Retry
      </button>
    </div>

    <!-- Config Form -->
    <div v-else class="space-y-4">
      <!-- Retention Policy -->
      <div>
        <label class="mb-2 block text-sm font-medium text-gray-700">Event log retention policy</label>
        <select
          v-model="formData.retentionPolicy"
          class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
        >
          <option
            v-for="option in retentionPolicyOptions"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }} - {{ option.description }}
          </option>
        </select>
        <div class="mt-2 text-xs text-gray-600">Current Setting: {{ retentionDaysDisplay }}</div>
      </div>

      <!-- Custom Retention Days -->
      <div v-if="formData.retentionPolicy === 'long'">
        <label class="mb-1 block text-sm font-medium text-gray-700">Custom Retention Days</label>
        <input
          v-model.number="formData.customLongDays"
          type="number"
          min="1"
          max="365"
          class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
          placeholder="Enter Retention Days"
        />
        <div class="mt-1 text-xs text-gray-500">Range: 1-365 days</div>
      </div>

      <!-- Action Buttons -->
      <div class="flex justify-end space-x-2 pt-2">
        <button
          @click="resetConfig"
          :disabled="isSaving"
          class="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Reset
        </button>
        <button
          @click="saveConfig"
          :disabled="isSaving"
          class="flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <svg
            v-if="isSaving"
            class="mr-1 h-4 w-4 animate-spin"
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
          {{ isSaving ? 'Saving...' : 'Save Settings' }}
        </button>
      </div>
    </div>
  </div>
</template>
