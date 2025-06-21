/**
 * Aggregated Stats Schema Definition
 * 
 * This file defines the schema for the aggregatedstats table based.
 * The table stores final computed statistics for query and display.
 */

/**
 * Aggregated stats table record interface
 * 
 * Based on LLD section 3.3 aggregated_stats table structure
 */
export interface AggregatedStatsRecord {
  /**
   * Primary key in format "YYYY-MM-DD:full_url"
   * Ensures uniqueness for each URL per day
   */
  key: string;

  /**
   * Date in YYYY-MM-DD format (UTC date)
   * Indexed field for date-based queries
   * Must be UTC date as per project rules
   */
  date: string;

  /**
   * Complete URL as minimum aggregation granularity
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
 * Utility function to generate primary key for aggregated stats
 *
 * @param date - Date in YYYY-MM-DD format (UTC)
 * @param url - Complete URL
 * @returns Primary key in format "YYYY-MM-DD:full_url"
 */
export function generateAggregatedStatsKey(date: string, url: string): string {
  return `${date}:${url}`;
}

/**
 * Utility function to generate primary key for aggregated stats using current UTC date
 *
 * @param url - Complete URL
 * @param timestamp - Optional UTC timestamp (defaults to current time)
 * @returns Primary key in format "YYYY-MM-DD:full_url"
 */
export function generateAggregatedStatsKeyForToday(url: string, timestamp?: number): string {
  const utcDate = getUtcDateString(timestamp);
  return generateAggregatedStatsKey(utcDate, url);
}

/**
 * Utility function to parse primary key into date and URL components
 * 
 * @param key - Primary key in format "YYYY-MM-DD:full_url"
 * @returns Object with date and url properties
 */
export function parseAggregatedStatsKey(key: string): { date: string; url: string } {
  const colonIndex = key.indexOf(':');
  if (colonIndex === -1 || colonIndex !== 10) { // YYYY-MM-DD is 10 characters
    throw new Error(`Invalid aggregated stats key format: ${key}`);
  }
  
  return {
    date: key.substring(0, colonIndex),
    url: key.substring(colonIndex + 1)
  };
}
