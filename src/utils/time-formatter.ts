/**
 * Time formatting utilities for the popup interface
 */

import { format, parseISO, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays } from 'date-fns';

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
 * Returns the start and end dates for a given time range identifier.
 *
 * Supported identifiers are:
 * - "today": current local day
 * - "yesterday": previous local day
 * - "week": Monday to Sunday of the current week
 * - "month": current calendar month
 * - "all": from 2020-01-01 to today
 * Unrecognized identifiers default to the "all" range.
 *
 * @param timeRange - The time period identifier to calculate the date range for
 * @returns An object with `startDate` and `endDate` as YYYY-MM-DD strings
 */
export function getDateRange(timeRange: string): DateRange {
  const now = new Date();

  switch (timeRange) {
    case 'today': {
      const localStart = startOfDay(now);
      const localEnd = endOfDay(now);
      return { startDate: format(localStart, 'yyyy-MM-dd'), endDate: format(localEnd, 'yyyy-MM-dd') };
    }

    case 'yesterday': {
      const yesterday = subDays(now, 1);
      const localStart = startOfDay(yesterday);
      const localEnd = endOfDay(yesterday);
      return { startDate: format(localStart, 'yyyy-MM-dd'), endDate: format(localEnd, 'yyyy-MM-dd') };
    }

    case 'week': {
      const localStart = startOfWeek(now, { weekStartsOn: 1 });
      const localEnd = endOfWeek(now, { weekStartsOn: 1 });
      return { startDate: format(localStart, 'yyyy-MM-dd'), endDate: format(localEnd, 'yyyy-MM-dd') };
    }

    case 'month': {
      const localStart = startOfMonth(now);
      const localEnd = endOfMonth(now);
      return { startDate: format(localStart, 'yyyy-MM-dd'), endDate: format(localEnd, 'yyyy-MM-dd') };
    }

    case 'all':
    default: {
      return {
        startDate: '2020-01-01',
        endDate: format(now, 'yyyy-MM-dd'),
      };
    }
  }
}

/**
 * Converts a UTC date string to a local date string in YYYY-MM-DD format.
 *
 * @param utcDateStr - The UTC date string to convert
 * @returns The local date formatted as YYYY-MM-DD
 */
export function formatLocalDate(utcDateStr: string): string {
  const date = parseISO(utcDateStr);
  return format(date, 'yyyy-MM-dd');
}
