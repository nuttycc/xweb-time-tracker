/**
 * VersionManagerUtil Unit Tests
 *
 * Tests for database version management functionality including version checking,
 * comparison, upgrade detection, and compatibility verification.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { type MockProxy } from 'vitest-mock-extended';
import {
  VersionManagerUtil,
  type VersionInfo,
  type VersionComparison,
  type WebTimeTrackerDB,
  UtilityError,
} from '@/db';
import { UtilityErrorType } from '@/db/utils/types';
import { DATABASE_VERSION } from '@/db/schemas';
import {
  createMockDatabase,
  createTestVersionManagerOptions,
  validateVersionInfo,
  setMockDatabaseVersion,
} from './test-utils';

describe('VersionManagerUtil', () => {
  let mockDb: MockProxy<WebTimeTrackerDB>;

  beforeEach(() => {
    mockDb = createMockDatabase();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getVersionInfo', () => {
    it('should get version info for current database', async () => {
      // Arrange
      setMockDatabaseVersion(mockDb, 1);

      // Act
      const versionInfo = await VersionManagerUtil.getVersionInfo(mockDb);

      // Assert
      expect(versionInfo.current).toBe(1);
      expect(versionInfo.latest).toBe(DATABASE_VERSION);
      expect(versionInfo.upgradeNeeded).toBe(versionInfo.current < versionInfo.latest);
      expect(validateVersionInfo(versionInfo)).toBe(true);
      expect(mockDb.isOpen).toHaveBeenCalled();
    });

    it('should handle closed database', async () => {
      // Arrange
      mockDb.isOpen.mockReturnValue(false);
      setMockDatabaseVersion(mockDb, 0);

      // Act
      const versionInfo = await VersionManagerUtil.getVersionInfo(mockDb);

      // Assert
      expect(versionInfo.current).toBe(0);
      expect(versionInfo.latest).toBe(DATABASE_VERSION);
      expect(versionInfo.upgradeNeeded).toBe(true);
    });

    it('should include migration path when upgrade needed', async () => {
      // Arrange
      setMockDatabaseVersion(mockDb, 1);
      // Assume DATABASE_VERSION is higher than 1

      // Act
      const versionInfo = await VersionManagerUtil.getVersionInfo(mockDb);

      // Assert
      if (versionInfo.upgradeNeeded) {
        expect(versionInfo.migrationPath).toBeDefined();
        expect(Array.isArray(versionInfo.migrationPath)).toBe(true);
        expect(versionInfo.migrationPath?.length).toBeGreaterThan(0);
      }
    });

    it('should include version history', async () => {
      // Arrange
      setMockDatabaseVersion(mockDb, 1);

      // Act
      const versionInfo = await VersionManagerUtil.getVersionInfo(mockDb);

      // Assert
      expect(versionInfo.history).toBeDefined();
      expect(Array.isArray(versionInfo.history)).toBe(true);
      if (versionInfo.history && versionInfo.history.length > 0) {
        expect(versionInfo.history[0]).toHaveProperty('version');
        expect(versionInfo.history[0]).toHaveProperty('timestamp');
        expect(versionInfo.history[0]).toHaveProperty('description');
      }
    });

    it('should handle version info error', async () => {
      // Arrange
      mockDb.isOpen.mockImplementation(() => {
        throw new Error('Database access failed');
      });

      // Act & Assert
      await expect(VersionManagerUtil.getVersionInfo(mockDb)).rejects.toThrow(UtilityError);

      try {
        await VersionManagerUtil.getVersionInfo(mockDb);
      } catch (error) {
        expect(error).toBeInstanceOf(UtilityError);
        expect((error as UtilityError).type).toBe(UtilityErrorType.VERSION_CHECK_FAILED);
        expect((error as UtilityError).message).toContain('Failed to get version info');
      }
    });

    it('should work with custom options', async () => {
      // Arrange
      setMockDatabaseVersion(mockDb, 1);
      const options = createTestVersionManagerOptions({
        allowDowngrade: true,
        backupBeforeUpgrade: false,
        verbose: true,
      });

      // Act
      const versionInfo = await VersionManagerUtil.getVersionInfo(mockDb, options);

      // Assert
      expect(validateVersionInfo(versionInfo)).toBe(true);
      expect(versionInfo.current).toBe(1);
    });
  });

  describe('compareVersions', () => {
    it('should compare versions correctly - newer', () => {
      // Act
      const comparison = VersionManagerUtil.compareVersions(2, 1);

      // Assert
      expect(comparison.result).toBe(-1); // version1 (2) is newer than version2 (1)
      expect(comparison.difference).toBe(1); // Math.abs(1 - 2) = 1
      expect(comparison.migrationRequired).toBe(false); // no migration needed for newer
    });

    it('should compare versions correctly - older', () => {
      // Act
      const comparison = VersionManagerUtil.compareVersions(1, 2);

      // Assert
      expect(comparison.result).toBe(1); // version2 (2) is newer than version1 (1)
      expect(comparison.difference).toBe(1); // Math.abs(2 - 1) = 1
      expect(comparison.migrationRequired).toBe(true);
    });

    it('should compare versions correctly - same', () => {
      // Act
      const comparison = VersionManagerUtil.compareVersions(1, 1);

      // Assert
      expect(comparison.result).toBe(0); // same
      expect(comparison.difference).toBe(0);
      expect(comparison.migrationRequired).toBe(false);
    });
  });

  describe('needsUpgrade', () => {
    it('should return true when upgrade needed', async () => {
      // Arrange
      setMockDatabaseVersion(mockDb, 1);
      // Assume DATABASE_VERSION > 1

      // Act
      const needsUpgrade = await VersionManagerUtil.needsUpgrade(mockDb);

      // Assert
      expect(needsUpgrade).toBe(mockDb.verno < DATABASE_VERSION);
    });

    it('should return false when no upgrade needed', async () => {
      // Arrange
      setMockDatabaseVersion(mockDb, DATABASE_VERSION);

      // Act
      const needsUpgrade = await VersionManagerUtil.needsUpgrade(mockDb);

      // Assert
      expect(needsUpgrade).toBe(false);
    });

    it('should handle closed database', async () => {
      // Arrange
      mockDb.isOpen.mockReturnValue(false);
      setMockDatabaseVersion(mockDb, 0);

      // Act
      const needsUpgrade = await VersionManagerUtil.needsUpgrade(mockDb);

      // Assert
      expect(needsUpgrade).toBe(true); // 0 < DATABASE_VERSION
    });

    it('should handle upgrade check error', async () => {
      // Arrange
      mockDb.isOpen.mockImplementation(() => {
        throw new Error('Database access failed');
      });

      // Act & Assert
      await expect(VersionManagerUtil.needsUpgrade(mockDb)).rejects.toThrow(UtilityError);
    });
  });

  describe('isCompatible', () => {
    it('should return true when compatible with default version', async () => {
      // Arrange
      setMockDatabaseVersion(mockDb, DATABASE_VERSION);

      // Act
      const isCompatible = await VersionManagerUtil.isCompatible(mockDb);

      // Assert
      expect(isCompatible).toBe(true);
    });

    it('should return false when incompatible with default version', async () => {
      // Arrange
      setMockDatabaseVersion(mockDb, DATABASE_VERSION - 1);

      // Act
      const isCompatible = await VersionManagerUtil.isCompatible(mockDb);

      // Assert
      expect(isCompatible).toBe(false);
    });

    it('should return true when compatible with specified version', async () => {
      // Arrange
      setMockDatabaseVersion(mockDb, 2);

      // Act
      const isCompatible = await VersionManagerUtil.isCompatible(mockDb, 1);

      // Assert
      expect(isCompatible).toBe(true); // 2 >= 1
    });

    it('should return false when incompatible with specified version', async () => {
      // Arrange
      setMockDatabaseVersion(mockDb, 1);

      // Act
      const isCompatible = await VersionManagerUtil.isCompatible(mockDb, 2);

      // Assert
      expect(isCompatible).toBe(false); // 1 < 2
    });

    it('should handle closed database', async () => {
      // Arrange
      mockDb.isOpen.mockReturnValue(false);
      setMockDatabaseVersion(mockDb, 0);

      // Act
      const isCompatible = await VersionManagerUtil.isCompatible(mockDb, 1);

      // Assert
      expect(isCompatible).toBe(false); // 0 < 1
    });

    it('should handle compatibility check error', async () => {
      // Arrange
      mockDb.isOpen.mockImplementation(() => {
        throw new Error('Database access failed');
      });

      // Act & Assert
      await expect(VersionManagerUtil.isCompatible(mockDb)).rejects.toThrow(UtilityError);
    });
  });

  describe('isValidVersion', () => {
    it('should validate positive integers', () => {
      expect(VersionManagerUtil.isValidVersion(1)).toBe(true);
      expect(VersionManagerUtil.isValidVersion(10)).toBe(true);
      expect(VersionManagerUtil.isValidVersion(100)).toBe(true);
    });

    it('should validate zero', () => {
      expect(VersionManagerUtil.isValidVersion(0)).toBe(true);
    });

    it('should reject negative numbers', () => {
      expect(VersionManagerUtil.isValidVersion(-1)).toBe(false);
      expect(VersionManagerUtil.isValidVersion(-10)).toBe(false);
    });

    it('should reject non-integers', () => {
      expect(VersionManagerUtil.isValidVersion(1.5)).toBe(false);
      expect(VersionManagerUtil.isValidVersion(3.14)).toBe(false);
    });

    it('should reject non-numbers', () => {
      // @ts-expect-error Testing invalid input
      expect(VersionManagerUtil.isValidVersion('1')).toBe(false);
      // @ts-expect-error Testing invalid input
      expect(VersionManagerUtil.isValidVersion(null)).toBe(false);
      // @ts-expect-error Testing invalid input
      expect(VersionManagerUtil.isValidVersion(undefined)).toBe(false);
    });
  });

  describe('Type Safety', () => {
    it('should maintain type safety for VersionInfo', async () => {
      // Act
      const versionInfo: VersionInfo = await VersionManagerUtil.getVersionInfo(mockDb);

      // Assert - Type checking at compile time
      expect(typeof versionInfo.current).toBe('number');
      expect(typeof versionInfo.latest).toBe('number');
      expect(typeof versionInfo.upgradeNeeded).toBe('boolean');
      if (versionInfo.migrationPath) {
        expect(Array.isArray(versionInfo.migrationPath)).toBe(true);
      }
      if (versionInfo.history) {
        expect(Array.isArray(versionInfo.history)).toBe(true);
      }
    });

    it('should maintain type safety for VersionComparison', () => {
      // Act
      const comparison: VersionComparison = VersionManagerUtil.compareVersions(1, 2);

      // Assert - Type checking at compile time
      expect([-1, 0, 1]).toContain(comparison.result);
      expect(typeof comparison.difference).toBe('number');
      expect(typeof comparison.migrationRequired).toBe('boolean');
    });

    it('should maintain type safety for VersionManagerOptions', async () => {
      // Arrange
      const options = createTestVersionManagerOptions({
        allowDowngrade: true,
        backupBeforeUpgrade: false,
        migrationHandlers: new Map(),
        verbose: true,
        timeout: 10000,
        retries: 3,
      });

      // Act
      const versionInfo = await VersionManagerUtil.getVersionInfo(mockDb, options);

      // Assert - Type checking ensures options are properly typed
      expect(validateVersionInfo(versionInfo)).toBe(true);
      expect(options.allowDowngrade).toBe(true);
      expect(options.backupBeforeUpgrade).toBe(false);
      expect(options.migrationHandlers).toBeInstanceOf(Map);
    });
  });
});
