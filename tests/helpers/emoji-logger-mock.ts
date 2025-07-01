/**
 * Mock helper for emoji logger in tests
 * 
 * Provides consistent mocking for emoji logger functionality
 * across all aggregator module tests.
 */

import { vi } from 'vitest';
import type { EmojiLogger } from '@/utils/logger-emoji';

/**
 * Creates a mock emoji logger with all required methods
 * 
 * @returns Mock emoji logger instance
 */
export function createMockEmojiLogger(): EmojiLogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
    logWithEmoji: vi.fn(),
  };
}

/**
 * Creates expectations for emoji log calls
 * 
 * @param mockLogger - The mock logger instance
 * @param category - Expected emoji category
 * @param level - Expected log level
 * @param phrase - Expected phrase (can be partial)
 */
export function expectEmojiLog(
  mockLogger: EmojiLogger,
  category: string,
  level: string,
  phrase: string
) {
  expect(mockLogger.logWithEmoji).toHaveBeenCalledWith(
    category,
    level,
    expect.stringContaining(phrase),
    expect.anything()
  );
}

/**
 * Creates expectations for emoji log calls without data
 * 
 * @param mockLogger - The mock logger instance
 * @param category - Expected emoji category
 * @param level - Expected log level
 * @param phrase - Expected phrase (can be partial)
 */
export function expectEmojiLogSimple(
  mockLogger: EmojiLogger,
  category: string,
  level: string,
  phrase: string
) {
  expect(mockLogger.logWithEmoji).toHaveBeenCalledWith(
    category,
    level,
    expect.stringContaining(phrase)
  );
} 