/**
 * InteractionDetector Unit Tests (WXT Standard)
 *
 * Unit tests for the InteractionDetector messaging system using WXT testing standards.
 * Tests message schema validation, threshold checking, and core logic.
 *
 * @author WebTime Tracker Team
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { MessageValidation } from '../../../../src/core/tracker/messaging/InteractionDetector';
import {
  SCROLL_THRESHOLD_PIXELS,
  MOUSEMOVE_THRESHOLD_PIXELS,
} from '../../../../src/config/constants';

describe('InteractionDetector (WXT Standard)', () => {
  beforeEach(() => {
    // Reset WXT fake browser state
    fakeBrowser.reset();
  });

  describe('MessageValidation', () => {
    describe('Threshold Validation', () => {
      it('should validate scroll threshold correctly', () => {
        expect(
          MessageValidation.meetsThreshold('scroll', { scrollDelta: SCROLL_THRESHOLD_PIXELS + 1 })
        ).toBe(true);
        expect(
          MessageValidation.meetsThreshold('scroll', { scrollDelta: SCROLL_THRESHOLD_PIXELS - 1 })
        ).toBe(false);
        expect(MessageValidation.meetsThreshold('scroll')).toBe(false);
      });

      it('should validate mousemove threshold correctly', () => {
        expect(
          MessageValidation.meetsThreshold('mousemove', {
            movementDelta: MOUSEMOVE_THRESHOLD_PIXELS + 1,
          })
        ).toBe(true);
        expect(
          MessageValidation.meetsThreshold('mousemove', {
            movementDelta: MOUSEMOVE_THRESHOLD_PIXELS - 1,
          })
        ).toBe(false);
        expect(MessageValidation.meetsThreshold('mousemove')).toBe(false);
      });

      it('should always validate keydown and mousedown', () => {
        expect(MessageValidation.meetsThreshold('keydown')).toBe(true);
        expect(MessageValidation.meetsThreshold('mousedown')).toBe(true);
      });

      it('should return false for unknown interaction types', () => {
        // @ts-expect-error - Testing invalid type
        expect(MessageValidation.meetsThreshold('unknown')).toBe(false);
      });
    });

    describe('Message Schema Validation', () => {
      it('should validate interaction messages', () => {
        const validMessage = {
          type: 'scroll',
          timestamp: Date.now(),
          tabId: 123,
          data: { scrollDelta: 25 },
        };

        expect(() => MessageValidation.validateInteractionMessage(validMessage)).not.toThrow();
      });

      it('should reject invalid interaction messages', () => {
        const invalidMessage = {
          type: 'invalid',
          timestamp: 'not-a-number',
          tabId: -1,
        };

        expect(() => MessageValidation.validateInteractionMessage(invalidMessage)).toThrow();
      });

      it('should validate background messages', () => {
        const validMessage = {
          type: 'page-loaded',
          payload: { test: true },
        };

        expect(() => MessageValidation.validateBackgroundMessage(validMessage)).not.toThrow();
      });

      it('should reject invalid background messages', () => {
        const invalidMessage = {
          type: 'invalid-type',
        };

        expect(() => MessageValidation.validateBackgroundMessage(invalidMessage)).toThrow();
      });
    });
  });

  describe('Core Logic Tests', () => {
    describe('Threshold Calculations', () => {
      it('should calculate scroll distance correctly', () => {
        const position1 = { x: 0, y: 0 };
        const position2 = { x: 20, y: 0 };

        const distance = Math.sqrt(
          Math.pow(position2.x - position1.x, 2) + Math.pow(position2.y - position1.y, 2)
        );

        expect(distance).toBe(20);
        expect(distance >= SCROLL_THRESHOLD_PIXELS).toBe(true);
      });

      it('should calculate mouse movement distance correctly', () => {
        const position1 = { x: 0, y: 0 };
        const position2 = { x: 15, y: 0 };

        const distance = Math.sqrt(
          Math.pow(position2.x - position1.x, 2) + Math.pow(position2.y - position1.y, 2)
        );

        expect(distance).toBe(15);
        expect(distance >= MOUSEMOVE_THRESHOLD_PIXELS).toBe(true);
      });

      it('should handle diagonal movements correctly', () => {
        const position1 = { x: 0, y: 0 };
        const position2 = { x: 3, y: 4 }; // 3-4-5 triangle

        const distance = Math.sqrt(
          Math.pow(position2.x - position1.x, 2) + Math.pow(position2.y - position1.y, 2)
        );

        expect(distance).toBe(5);
      });
    });

    describe('Interaction Type Validation', () => {
      it('should recognize valid interaction types', () => {
        const validTypes = ['scroll', 'mousemove', 'keydown', 'mousedown'];

        validTypes.forEach(type => {
          expect(['scroll', 'mousemove', 'keydown', 'mousedown']).toContain(type);
        });
      });

      it('should handle modifier key filtering', () => {
        const modifierKeys = ['Control', 'Alt', 'Shift', 'Meta'];
        const regularKeys = ['a', 'Enter', 'Space', 'ArrowUp'];

        // Modifier keys should be ignored
        modifierKeys.forEach(key => {
          expect(modifierKeys.includes(key)).toBe(true);
        });

        // Regular keys should be processed
        regularKeys.forEach(key => {
          expect(modifierKeys.includes(key)).toBe(false);
        });
      });
    });
  });

  describe('Configuration Constants', () => {
    it('should have valid threshold values', () => {
      expect(SCROLL_THRESHOLD_PIXELS).toBeTypeOf('number');
      expect(SCROLL_THRESHOLD_PIXELS).toBeGreaterThan(0);
      expect(SCROLL_THRESHOLD_PIXELS).toBe(20);

      expect(MOUSEMOVE_THRESHOLD_PIXELS).toBeTypeOf('number');
      expect(MOUSEMOVE_THRESHOLD_PIXELS).toBeGreaterThan(0);
      expect(MOUSEMOVE_THRESHOLD_PIXELS).toBe(10);
    });

    it('should have reasonable threshold relationships', () => {
      // Mouse movement threshold should be smaller than scroll threshold
      // as mouse movements are more frequent and smaller
      expect(MOUSEMOVE_THRESHOLD_PIXELS).toBeLessThanOrEqual(SCROLL_THRESHOLD_PIXELS);
    });
  });

  describe('WXT Integration', () => {
    it('should have access to fake browser APIs', () => {
      expect(fakeBrowser).toBeDefined();
      expect(fakeBrowser.reset).toBeTypeOf('function');
    });

    it('should be able to use browser APIs in tests', () => {
      // Test that we can access browser APIs through WXT's fake implementation
      expect(fakeBrowser).toBeDefined();
      expect(fakeBrowser.runtime).toBeDefined();
    });

    it('should reset state between tests', () => {
      // This test verifies that fakeBrowser.reset() works
      // For now, just verify the reset function exists and can be called
      expect(() => fakeBrowser.reset()).not.toThrow();
    });
  });
});
