/**
 * Time formatting utilities for the popup interface
 */

/**
 * Format time duration in milliseconds to human readable format
 *
 * @param milliseconds - Duration in milliseconds
 * @returns Formatted duration string in Chinese
 *
 * @example
 * ```typescript
 * formatDuration(30000) // "30秒"
 * formatDuration(90000) // "1分30秒"
 * formatDuration(3661000) // "1小时1分"
 * ```
 */
export function formatDuration(milliseconds: number): string {
  if (milliseconds < 1000) {
    return '0s';
  }

  const seconds = Math.floor(milliseconds / 1000);

  if (seconds < 60) {
    return `${seconds}s`;
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return remainingSeconds > 0 ? `${minutes}m${remainingSeconds}s` : `${minutes}m`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return minutes > 0 ? `${hours}h${minutes}m` : `${hours}h`;
  }
}

/**
 * Format time duration in milliseconds to compact format
 *
 * @param milliseconds - Duration in milliseconds
 * @returns Compact formatted duration string
 *
 * @example
 * ```typescript
 * formatDurationCompact(30000) // "30s"
 * formatDurationCompact(90000) // "1m30s"
 * formatDurationCompact(3661000) // "1h1m"
 * ```
 */
export function formatDurationCompact(milliseconds: number): string {
  if (milliseconds < 1000) {
    return '0s';
  }

  const seconds = Math.floor(milliseconds / 1000);

  if (seconds < 60) {
    return `${seconds}s`;
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return remainingSeconds > 0 ? `${minutes}m${remainingSeconds}s` : `${minutes}m`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return minutes > 0 ? `${hours}h${minutes}m` : `${hours}h`;
  }
}

/**
 * Format percentage with one decimal place
 *
 * @param value - Percentage value (0-100)
 * @returns Formatted percentage string
 */
export function formatPercentage(value: number): string {
  return `${value.toFixed(1)}%`;
}

/**
 * Calculate percentage of active time vs open time
 *
 * @param activeTime - Active time in milliseconds
 * @param openTime - Open time in milliseconds
 * @returns Percentage of active time
 */
export function calculateActivePercentage(activeTime: number, openTime: number): number {
  if (openTime === 0) return 0;
  return Math.min(100, (activeTime / openTime) * 100);
}

/**
 * Time range calculation utilities
 */
export interface DateRange {
  startDate: string;
  endDate: string;
}

/**
 * Get date range for different time periods
 *
 * @param timeRange - Time range identifier
 * @returns Date range in YYYY-MM-DD format
 */
export function getDateRange(timeRange: string): DateRange {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (timeRange) {
    case 'today': {
      const dateStr = today.toISOString().split('T')[0];
      return { startDate: dateStr, endDate: dateStr };
    }

    case 'yesterday': {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const dateStr = yesterday.toISOString().split('T')[0];
      return { startDate: dateStr, endDate: dateStr };
    }

    case 'week': {
      // Get start of current week (Monday)
      const startOfWeek = new Date(today);
      const dayOfWeek = startOfWeek.getDay();
      const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Sunday = 0, Monday = 1
      startOfWeek.setDate(startOfWeek.getDate() - daysToMonday);

      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(endOfWeek.getDate() + 6); // Sunday

      return {
        startDate: startOfWeek.toISOString().split('T')[0],
        endDate: endOfWeek.toISOString().split('T')[0],
      };
    }

    case 'month': {
      // Get start and end of current month
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

      return {
        startDate: startOfMonth.toISOString().split('T')[0],
        endDate: endOfMonth.toISOString().split('T')[0],
      };
    }

    case 'all':
    default: {
      // Return a very wide range for "all" data
      return {
        startDate: '2020-01-01',
        endDate: new Date().toISOString().split('T')[0],
      };
    }
  }
}
