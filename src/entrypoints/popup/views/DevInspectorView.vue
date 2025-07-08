<script lang="ts" setup>
import { ref, onMounted, computed } from 'vue';
import { createLogger } from '@/utils/logger';
import { databaseService } from '@/core/db/services';
import type { EventsLogRecord } from '@/core/db/schemas';
import 'iconify-icon';
import HostnameEventsList from '@/components/HostnameEventsList.vue';
// import UngroupedEventsList from '@/components/UngroupedEventsList.vue';
const logger = createLogger('DevInspectorView');

// Reactive state
const loading = ref(false);
const error = ref<string | null>(null);
const urlFilter = ref<string>('');
const eventTypeFilter = ref<string>('');
const allEvents = ref<EventsLogRecord[]>([]);
const groupByHost = ref(true); // Group events by hostname


// Event type options for filtering (using actual event types from the model)
const eventTypeOptions = [
  { value: '', label: 'All Events' },
  { value: 'open_time_start', label: 'Open Time Start' },
  { value: 'open_time_end', label: 'Open Time End' },
  { value: 'active_time_start', label: 'Active Time Start' },
  { value: 'active_time_end', label: 'Active Time End' },
  { value: 'checkpoint', label: 'All Checkpoints' },
  { value: 'checkpoint_open', label: 'Checkpoint (Open Time)' },
  { value: 'checkpoint_active', label: 'Checkpoint (Active Time)' },
];

// Computed filtered events
const filteredEvents = computed(() => {
  let events = allEvents.value;

  // Apply URL filter (case-insensitive partial match)
  if (urlFilter.value.trim()) {
    const urlFilterLower = urlFilter.value.toLowerCase().trim();
    events = events.filter(event => event.url.toLowerCase().includes(urlFilterLower));
  }

  // Apply event type filter
  if (eventTypeFilter.value) {
    if (eventTypeFilter.value === 'checkpoint_open') {
      // Filter for checkpoint events with null activityId (Open Time checkpoints)
      events = events.filter(
        event => event.eventType === 'checkpoint' && event.activityId === null
      );
    } else if (eventTypeFilter.value === 'checkpoint_active') {
      // Filter for checkpoint events with non-null activityId (Active Time checkpoints)
      events = events.filter(
        event => event.eventType === 'checkpoint' && event.activityId !== null
      );
    } else {
      // Standard filter for exact event type match
      events = events.filter(event => event.eventType === eventTypeFilter.value);
    }
  }

  return events;
});

// Computed grouped events by hostname
const groupedEvents = computed(() => {
  if (!groupByHost.value) {
    return { ungrouped: filteredEvents.value };
  }

  const groups: Record<string, EventsLogRecord[]> = {};

  filteredEvents.value.forEach(event => {
    try {
      const hostname = new URL(event.url).hostname || 'Unknown';
      if (!groups[hostname]) {
        groups[hostname] = [];
      }
      groups[hostname].push(event);
    } catch {
      // Handle invalid URLs
      if (!groups['Invalid URL']) {
        groups['Invalid URL'] = [];
      }
      groups['Invalid URL'].push(event);
    }
  });

  // Sort groups by hostname and events within groups by timestamp
  const sortedGroups: Record<string, EventsLogRecord[]> = {};
  Object.keys(groups)
    .sort()
    .forEach(hostname => {
      sortedGroups[hostname] = groups[hostname].sort((a, b) => b.timestamp - a.timestamp);
    });

  return sortedGroups;
});


/**
 * Format timestamp to relative time (e.g., "2 minutes ago")
 */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  if (seconds > 0) return `${seconds}s ago`;
  return 'Just now';
}


/**
 * Get display label for event type, with special handling for checkpoints
 */
function getEventTypeLabel(eventType: string, event?: EventsLogRecord): string {
  if (eventType === 'checkpoint' && event) {
    // Distinguish checkpoint types based on activityId
    return event.activityId === null ? 'Checkpoint (Open)' : 'Checkpoint (Active)';
  }

  const option = eventTypeOptions.find(opt => opt.value === eventType);
  return option?.label || eventType;
}


/**
 * Load all events from the database
 * Since there's no direct "get all events" method, we'll use a combination approach
 */
async function loadAllEvents(): Promise<void> {
  loading.value = true;
  error.value = null;

  try {
    const dbService = await databaseService.getInstance();

    logger.info('Loading all events for dev inspector');

    // Get both processed and unprocessed events
    // We'll use a large limit to get most events, and combine different queries
    const [unprocessedEvents, processedEvents] = await Promise.all([
      // Get unprocessed events (recent activity)
      dbService.getUnprocessedEvents({
        limit: 1000,
        orderBy: 'timestamp',
        orderDirection: 'desc',
      }),
      // Get processed events from the last 7 days
      dbService.getProcessedEvents(
        Date.now(), // All processed events
        {
          limit: 1000,
          orderBy: 'timestamp',
          orderDirection: 'desc',
        }
      ),
    ]);

    // Combine and deduplicate events by ID
    const eventMap = new Map<number, EventsLogRecord>();

    [...unprocessedEvents, ...processedEvents].forEach(event => {
      if (event.id !== undefined) {
        eventMap.set(event.id, event);
      }
    });

    // Convert to array and sort by timestamp (most recent first)
    allEvents.value = Array.from(eventMap.values()).sort((a, b) => b.timestamp - a.timestamp);

    logger.info('Events loaded for dev inspector', {
      totalEvents: allEvents.value.length,
      unprocessedCount: unprocessedEvents.length,
      processedCount: processedEvents.length,
    });
  } catch (err) {
    logger.error('Failed to load events:', err);
    error.value = err instanceof Error ? err.message : 'Failed to load events';
  } finally {
    loading.value = false;
  }
}

/**
 * Handle filter changes
 */
function handleFilterChange(): void {
  logger.info('Filters changed', {
    urlFilter: urlFilter.value,
    eventTypeFilter: eventTypeFilter.value,
    filteredCount: filteredEvents.value.length,
  });
}

/**
 * Clear all filters
 */
function clearFilters(): void {
  urlFilter.value = '';
  eventTypeFilter.value = '';
  logger.info('Filters cleared');
}

/**
 * Toggle grouping by hostname
 */
function toggleGrouping(): void {
  groupByHost.value = !groupByHost.value;
  logger.info('Grouping toggled', { groupByHost: groupByHost.value });
}

/**
 * Refresh data
 */
async function refreshData(): Promise<void> {
  logger.info('Refreshing events data');
  await loadAllEvents();
}

onMounted(() => {
  logger.info('DevInspectorView mounted');
  loadAllEvents();
});
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden">
    <!-- Header -->
    <div class="flex-shrink-0 border-b border-gray-200 p-3">
      <div class="flex items-center space-x-2">
        <span class="text-base">🔧</span>
        <div>
          <h2 class="text-base font-medium text-gray-900">Advanced View</h2>
          <p class="text-xs text-gray-600">View raw event log data</p>
        </div>
      </div>
    </div>

    <!-- Filters -->
    <div class="flex-shrink-0 border-b border-gray-200 bg-gray-50 p-3">
      <div class="space-y-3">
        <!-- Filter Controls Row 1 -->
        <div class="grid grid-cols-1 gap-2 md:grid-cols-2">
          <!-- URL Filter -->
          <div class="flex items-center space-x-2">
            <label for="urlFilter" class="w-10 text-xs font-medium text-gray-700">URL:</label>
            <input
              id="urlFilter"
              v-model="urlFilter"
              @input="handleFilterChange"
              type="text"
              placeholder="Filter by URL..."
              class="flex-1 rounded border border-gray-300 px-2 py-1 text-xs shadow-sm focus:border-blue-500 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <!-- Event Type Filter -->
          <div class="flex items-center space-x-2">
            <label for="eventTypeFilter" class="w-10 text-xs font-medium text-gray-700"
              >Type:</label
            >
            <select
              id="eventTypeFilter"
              v-model="eventTypeFilter"
              @change="handleFilterChange"
              class="flex-1 rounded border border-gray-300 px-2 py-1 text-xs shadow-sm focus:border-blue-500 focus:ring-blue-500 focus:outline-none"
            >
              <option v-for="option in eventTypeOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </div>
        </div>

        <!-- Action Buttons Row -->
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-2">
            <button
              @click="refreshData"
              :disabled="loading"
              class="flex items-center space-x-1 rounded bg-blue-500 px-2 py-1 text-xs text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-blue-300"
            >
              <span v-if="loading">🔄</span>
              <span v-else>🔄</span>
              <span v-if="loading">Refreshing...</span>
              <span v-else>Refresh</span>
            </button>

            <button
              @click="toggleGrouping"
              :class="[
                'flex items-center space-x-1 rounded px-2 py-1 text-xs transition-colors',
                groupByHost
                  ? 'bg-green-100 text-green-800 hover:bg-green-200'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
              ]"
            >
              <span>{{ groupByHost ? '📊' : '📋' }}</span>
              <span>{{ groupByHost ? 'Grouped' : 'List' }}</span>
            </button>
          </div>

          <button
            @click="clearFilters"
            class="rounded px-2 py-1 text-xs text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-800"
          >
            Clear
          </button>
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
      <div v-else class="space-y-2">
        <!-- Filter Status -->
        <div
          v-if="urlFilter || eventTypeFilter"
          class="rounded-lg border border-blue-200 bg-blue-50 p-3"
        >
          <h3 class="mb-1 text-sm font-medium text-blue-900">Current Filter Conditions</h3>
          <div class="space-y-1 text-xs">
            <div v-if="urlFilter" class="text-blue-700">
              URL: <span class="rounded bg-blue-100 px-1 font-mono">{{ urlFilter }}</span>
            </div>
            <div v-if="eventTypeFilter" class="text-blue-700">
              Event Type:
              <span class="rounded bg-blue-100 px-1 font-mono">{{
                getEventTypeLabel(eventTypeFilter)
              }}</span>
            </div>
          </div>
        </div>

        <!-- Data Stats -->
        <div class="rounded-lg border border-green-200 bg-green-50 p-4">
          <div class="flex flex-col">
            <div>
              <div class="flex items-center space-x-6 text-sm text-green-700">
                <div class="text-center">
                  <div class="font-semibold text-green-800">{{ allEvents.length }}</div>
                  <div class="text-xs">Total Events</div>
                </div>
                <div class="text-center">
                  <div class="font-semibold text-green-800">{{ filteredEvents.length }}</div>
                  <div class="text-xs">Filtered</div>
                </div>
                <div class="text-center" v-if="groupByHost">
                  <div class="font-semibold text-green-800">
                    {{ Object.keys(groupedEvents).length }}
                  </div>
                  <div class="text-xs">Hosts</div>
                </div>
                <div class="text-center">
                  <div class="font-semibold text-green-800">
                    {{ filteredEvents.length }}
                  </div>
                  <div class="text-xs">Events</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Events Display -->
        <div class="flex-1 overflow-hidden rounded-lg border border-gray-200 bg-white">
          <div v-if="filteredEvents.length === 0" class="py-12 text-center text-gray-500">
            <span class="mb-4 block text-6xl">📋</span>
            <p class="text-lg font-medium">No matching events found</p>
            <p class="mt-2 text-sm">Try adjusting filters or refreshing data</p>
          </div>

          <!-- Grouped View -->
          <div v-else-if="groupByHost" class="flex h-full flex-col">
            <div class="flex-1 overflow-y-auto">
              <div class="space-y-3">
                <div
                  v-for="(events, hostname) in groupedEvents"
                  :key="hostname"
                  class="rounded-lg border border-gray-200 bg-gray-50"
                >
                  <!-- Host Header -->
                  <details name="event-list" class="border-b border-gray-200 bg-white px-4 py-3">
                    <summary class="flex items-center justify-between cursor-pointer">
                      <div class="flex items-center space-x-3">
                        <div>
                          <h3 class="flex items-center space-x-2 text-gray-900">
                            <iconify-icon
                              icon="fad:h-expand"
                              class="h-4 w-4 cursor-pointer"
                            ></iconify-icon>
                            <span>{{ hostname }}</span>
                          </h3>
                        </div>
                      </div>

                      <div class="flex items-center space-x-2 text-xs text-gray-500">
                        <p class="text-gray-600">{{ events.length }} events</p>
                        <span class="text-gray-600">•</span>
                        <span class="text-gray-600">{{
                          formatRelativeTime(events[0].timestamp)
                        }}</span>
                      </div>
                    </summary>
                    <!-- Events for this host (with virtual scrolling if many events) -->
                    <div class="p-2">
                      <HostnameEventsList :events="events" />
                    </div>
                  </details>


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
  width: 8px;
}

.overflow-y-auto::-webkit-scrollbar-track {
  background: #f8fafc;
  border-radius: 4px;
}

.overflow-y-auto::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 4px;
  border: 2px solid #f8fafc;
}

.overflow-y-auto::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}

/* Smooth transitions */
.transition-shadow {
  transition: box-shadow 0.2s ease-in-out;
}

/* Enhanced hover effects */
.hover\:shadow-md:hover {
  box-shadow:
    0 4px 6px -1px rgba(0, 0, 0, 0.1),
    0 2px 4px -1px rgba(0, 0, 0, 0.06);
}

/* Better focus states */
input:focus,
select:focus {
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

/* Improved button states */
button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Animation for loading states */
@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.animate-pulse {
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

/* 自定义滚动条样式 - 域名分组视图 */
.flex-1.overflow-y-auto {
  /* Firefox 滚动条 */
  scrollbar-width: thin;
  scrollbar-color: #cbd5e1 #f1f5f9;
}

.flex-1.overflow-y-auto::-webkit-scrollbar {
  width: 8px;
}

.flex-1.overflow-y-auto::-webkit-scrollbar-track {
  background: #f1f5f9;
  border-radius: 4px;
}

.flex-1.overflow-y-auto::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 4px;
  transition: background-color 0.2s ease;
}

.flex-1.overflow-y-auto::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}

.flex-1.overflow-y-auto::-webkit-scrollbar-thumb:active {
  background: #64748b;
}
</style>
