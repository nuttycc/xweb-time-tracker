<template>
  <div class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0 flex-1 space-y-3">
        <!-- Header Row -->
        <div class="flex flex-wrap items-center gap-1 space-x-2">
          <span class="font-mono text-sm whitespace-nowrap text-gray-500"
            >#{{ event.id }}</span
          >
          <span
            :class="[
              'rounded-full px-2 py-1 text-xs font-medium whitespace-nowrap',
              getEventTypeClass(event.eventType, event),
            ]"
          >
            {{ getEventTypeLabel(event.eventType, event) }}
          </span>
          <span class="text-sm whitespace-nowrap text-gray-600">
            {{ formatRelativeTime(event.timestamp) }}
          </span>
        </div>

        <!-- URL Row -->
        <div class="flex items-start space-x-2">
          <span class="flex-shrink-0 text-sm font-medium text-gray-700">🌐</span>
          <div class="min-w-0 flex-1">
            <div
              class="truncate text-sm font-medium text-gray-900"
              :title="event.url"
            >
              {{ getHostname(event.url) }}
            </div>
            <div class="text-xs break-all text-gray-600" :title="event.url">
              {{ truncateUrl(event.url, 60) }}
            </div>
          </div>
        </div>

        <!-- Details Row -->
        <div class="flex flex-wrap items-center gap-1 text-xs text-gray-500">
          <span class="whitespace-nowrap"
            >📅 {{ formatTimestamp(event.timestamp).split(' ')[1] }}</span
          >
          <span class="whitespace-nowrap">🏷️ {{ event.tabId }}</span>
          <span class="whitespace-nowrap"
            >🔗 {{ event.visitId.slice(0, 4) }}</span
          >
          <span v-if="event.activityId" class="whitespace-nowrap"
            >⚡ {{ event.activityId }}</span
          >
        </div>
      </div>

      <!-- Status Column -->
      <div class="flex-shrink-0">
        <span
          :class="[
            'inline-block rounded-full px-2 py-1 text-xs font-medium whitespace-nowrap',
            event.isProcessed
              ? 'bg-green-100 text-green-800'
              : 'bg-yellow-100 text-yellow-800',
          ]"
        >
          {{ event.isProcessed ? '✓' : '⏳' }}
        </span>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import type { EventsLogRecord } from '@/core/db/schemas';

interface Props {
  event: EventsLogRecord;
}

defineProps<Props>();

/**
 * Format timestamp to readable date string
 */
function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

/**
 * Format relative time (e.g., "2 minutes ago")
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
  return `${seconds}s ago`;
}

/**
 * Extract hostname from URL
 */
function getHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return 'Invalid URL';
  }
}

/**
 * Truncate URL for display
 */
function truncateUrl(url: string, maxLength: number = 50): string {
  if (url.length <= maxLength) return url;
  return url.substring(0, maxLength - 3) + '...';
}

/**
 * Get CSS class for event type, with special handling for checkpoints
 */
function getEventTypeClass(eventType: string, event?: EventsLogRecord): string {
  switch (eventType) {
    case 'open_time_start':
      return 'bg-green-100 text-green-800';
    case 'open_time_end':
      return 'bg-red-100 text-red-800';
    case 'active_time_start':
      return 'bg-blue-100 text-blue-800';
    case 'active_time_end':
      return 'bg-purple-100 text-purple-800';
    case 'checkpoint':
      // Special handling for checkpoint events
      if (event?.activityId === null) {
        // Open Time checkpoint
        return 'bg-green-100 text-green-800';
      } else {
        // Active Time checkpoint
        return 'bg-blue-100 text-blue-800';
      }
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

/**
 * Get display label for event type, with special handling for checkpoints
 */
function getEventTypeLabel(eventType: string, event?: EventsLogRecord): string {
  switch (eventType) {
    case 'open_time_start':
      return 'Open Start';
    case 'open_time_end':
      return 'Open End';
    case 'active_time_start':
      return 'Active Start';
    case 'active_time_end':
      return 'Active End';
    case 'checkpoint':
      // Special handling for checkpoint events
      if (event?.activityId === null) {
        return 'Open Time';
      } else {
        return 'Active Time';
      }
    default:
      return eventType;
  }
}
</script>
