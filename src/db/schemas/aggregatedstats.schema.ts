/**
 * Aggregated Stats Schema Definition
 *
 * This file defines the schema for the aggregatedstats table based.
 * The table stores final computed statistics for query and display.
 */

import { parseISO, isValid } from 'date-fns';
import { normalizeUrl } from '../utils/url-normalizer.util';

/**
 * Aggregated stats table record interface
 *
 * This interface defines the structure of records stored in the `aggregatedstats` table.
 *
 * @property {string} key - Primary key in format "YYYY-MM-DD:normalized_url". Ensures uniqueness for each URL per day.
 * @property {string} date - Date in YYYY-MM-DD format (UTC date). Indexed field for date-based queries. Must be UTC date as per project rules.
 * @property {string} url - Complete URL as minimum aggregation granularity.
 * @property {string} hostname - URL hostname for mid-level aggregation. Indexed field for hostname-based queries.
 * @property {string} parentDomain - URL parent domain based on PSL (Public Suffix List) calculation. Indexed field for top-level aggregation.
 * @property {number} total_open_time - Accumulated open time in seconds.
 * @property {number} total_active_time - Accumulated active time in seconds.
 * @property {number} last_updated - Last update timestamp (Unix timestamp in milliseconds). Key dependency for FR-4C smart merge logic implementation.
 */
export interface AggregatedStatsRecord {
  /**
   * Primary key in format "YYYY-MM-DD:normalized_url"
   *
   * Ensures uniqueness for each URL per day
   *
   * normalized_url is the URL after removing some search parameters
   */
  key: string;

  /**
   * Date in YYYY-MM-DD format (UTC date)
   * Indexed field for date-based queries
   * Must be UTC date
   */
  date: string;

  /**
   * Complete URL
   */
  url: string;

  /**
   * URL hostname for mid-level aggregation
   * Indexed field for hostname-based queries
   */
  hostname: string;

  /**
   * URL parent domain based on PSL (Public Suffix List) calculation
   * Indexed field for top-level aggregation
   */
  parentDomain: string;

  /**
   * Accumulated open time in seconds
   */
  total_open_time: number;

  /**
   * Accumulated active time in seconds
   */
  total_active_time: number;

  /**
   * Last update timestamp (Unix timestamp in milliseconds)
   * Key dependency for FR-4C smart merge logic implementation
   */
  last_updated: number;
}

/**
 * Dexie schema string for aggregatedstats table
 *
 * Schema breakdown:
 * - key: Primary key (composite format: date:url)
 * - date: Index for date-based queries
 * - hostname: Index for hostname-based aggregation
 * - parentDomain: Index for top-level domain aggregation
 */
export const AGGREGATEDSTATS_SCHEMA = 'key, date, hostname, parentDomain';

/**
 * Table name constant
 */
export const AGGREGATEDSTATS_TABLE_NAME = 'aggregatedstats';

/**
 * Utility function to get current UTC date in YYYY-MM-DD format
 * Ensures consistent date formatting across the application
 *
 * @param timestamp - Optional UTC timestamp (defaults to current time)
 * @returns UTC date in YYYY-MM-DD format
 */
export function getUtcDateString(timestamp?: number): string {
  const date = new Date(timestamp ?? Date.now());
  return date.toISOString().split('T')[0]; // Extract YYYY-MM-DD from ISO string
}

/**
 * Generates a primary key for the aggregated stats table by combining a UTC date and a normalized URL.
 *
 * The URL is normalized to remove tracking or marketing parameters, ensuring consistent aggregation keys.
 *
 * @param date - UTC date string in "YYYY-MM-DD" format
 * @param url - The original URL to be normalized
 * @returns The primary key in the format "YYYY-MM-DD:normalized_url"
 */
export function generateAggregatedStatsKey(date: string, url: string): string {
  const normalizedUrl = normalizeUrl(url);
  return `${date}:${normalizedUrl}`;
}

/**
 * Generates the primary key for an aggregated stats record for the current or specified UTC date, using a normalized version of the provided URL.
 *
 * The key is formatted as "YYYY-MM-DD:normalized_url", where the URL is normalized to remove tracking parameters for consistent aggregation.
 *
 * @param url - The URL to be normalized and included in the key.
 * @param timestamp - Optional UTC timestamp to specify the date; uses the current time if omitted.
 * @returns The generated primary key string.
 */
export function generateAggregatedStatsKeyForToday(url: string, timestamp?: number): string {
  const utcDate = getUtcDateString(timestamp);
  return generateAggregatedStatsKey(utcDate, url);
}

/**
 * Parses an aggregated stats primary key into its date and normalized URL components.
 *
 * Validates that the key is in the "YYYY-MM-DD:normalized_url" format and that the date portion is a valid ISO date.
 *
 * @param key - The primary key string to parse.
 * @returns An object containing the date and normalized URL extracted from the key.
 * @throws Error if the key format is invalid or the date is not a valid "YYYY-MM-DD" value.
 */
export function parseAggregatedStatsKey(key: string): { date: string; url: string } {
  const colonIndex = key.indexOf(':');
  if (colonIndex === -1 || colonIndex !== 10) {
    // YYYY-MM-DD is 10 characters
    throw new Error(`Invalid aggregated stats key format: ${key}`);
  }

  const dateStr = key.substring(0, colonIndex);

  // Validate that the date string is a valid YYYY-MM-DD date
  // parseISO is optimized for ISO 8601 format (YYYY-MM-DD is a subset)
  const parsedDate = parseISO(dateStr);
  if (!isValid(parsedDate)) {
    throw new Error(`Invalid date in key: ${dateStr}`);
  }

  return {
    date: dateStr,
    url: key.substring(colonIndex + 1),
  };
}
