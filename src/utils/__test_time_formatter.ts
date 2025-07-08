/**
 * Quick test for time formatter to verify milliseconds conversion
 * This is a temporary test file to verify our changes work correctly
 */

import { formatDuration, formatDurationCompact, calculateActivePercentage } from './time-formatter';

// Test cases with milliseconds input
console.log('=== Time Formatter Test (Milliseconds Input) ===');

// Test basic cases
console.log('500ms:', formatDuration(500)); // Should show "0秒"
console.log('1000ms (1s):', formatDuration(1000)); // Should show "1秒"
console.log('30000ms (30s):', formatDuration(30000)); // Should show "30秒"
console.log('90000ms (1m30s):', formatDuration(90000)); // Should show "1分30秒"
console.log('3661000ms (1h1m1s):', formatDuration(3661000)); // Should show "1小时1分"

// Test compact format
console.log('\n=== Compact Format ===');
console.log('30000ms:', formatDurationCompact(30000)); // Should show "30s"
console.log('90000ms:', formatDurationCompact(90000)); // Should show "1m30s"
console.log('3661000ms:', formatDurationCompact(3661000)); // Should show "1h1m"

// Test percentage calculation
console.log('\n=== Percentage Calculation ===');
console.log('50% active:', calculateActivePercentage(30000, 60000)); // Should show 50
console.log('100% active:', calculateActivePercentage(60000, 60000)); // Should show 100
console.log('0% active:', calculateActivePercentage(0, 60000)); // Should show 0

// Test realistic values (what we might see in the database)
console.log('\n=== Realistic Database Values ===');
console.log('5 minutes:', formatDuration(5 * 60 * 1000)); // 300000ms = 5分
console.log('1.5 hours:', formatDuration(1.5 * 60 * 60 * 1000)); // 5400000ms = 1小时30分
console.log('8 hours:', formatDuration(8 * 60 * 60 * 1000)); // 28800000ms = 8小时

export {};
