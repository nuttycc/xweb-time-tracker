/**
 * Time formatting utilities for the popup interface
 */

/**
 * Converts a duration in milliseconds to a concise, human-readable string using hours, minutes, and seconds.
 *
 * @param milliseconds - The duration to format, in milliseconds
 * @returns The formatted duration string (e.g., "1h1m", "1m30s", "30s", or "0s" for durations under 1 second)
 *
 * @example
 * formatDuration(30000) // "30s"
 * formatDuration(90000) // "1m30s"
 * formatDuration(3661000) // "1h1m"
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
 * Formats a numeric value as a percentage string with one decimal place.
 *
 * @param value - The numeric value to format as a percentage
 * @returns The formatted percentage string (e.g., "42.5%")
 */
export function formatPercentage(value: number): string {
  return `${value.toFixed(1)}%`;
}

/**
 * Calculates the percentage of active time relative to open time, capped at 100%.
 *
 * @param activeTime - Duration of active time in milliseconds
 * @param openTime - Total open time in milliseconds
 * @returns The percentage of active time, or 0 if open time is zero
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
 * Returns a date range object for a specified time period identifier.
 *
 * Supported identifiers are "today", "yesterday", "week" (Monday to Sunday of the current week), "month" (current calendar month), and "all" (from 2020-01-01 to today). Any unrecognized identifier defaults to the "all" range.
 *
 * @param timeRange - Identifier for the desired time period ("today", "yesterday", "week", "month", or "all")
 * @returns An object with `startDate` and `endDate` in YYYY-MM-DD format
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
