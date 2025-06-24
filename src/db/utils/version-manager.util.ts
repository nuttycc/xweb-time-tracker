/**
 * Database Version Manager Utility
 *
 * Provides version management capabilities for the database,
 * including version checking, comparison, and upgrade logic.
 *
 * @module db/utils/version-manager
 */

import type { WebTimeTrackerDB } from '../schemas';
import { DATABASE_VERSION } from '../schemas';
import type { VersionInfo, VersionComparison, UtilityOptions } from './types';
import { UtilityError, UtilityErrorType } from './types';

/**
 * Version manager configuration options
 */
export interface VersionManagerOptions extends UtilityOptions {
  /** Allow downgrade operations */
  allowDowngrade?: boolean;
  /** Backup before upgrade */
  backupBeforeUpgrade?: boolean;
  /** Custom migration handlers */
  migrationHandlers?: Map<number, (db: WebTimeTrackerDB) => Promise<void>>;
}

/**
 * Database Version Manager Utility Class
 *
 * Provides static methods for managing database versions,
 * including checking, comparing, and upgrading database schemas.
 */
export class VersionManagerUtil {
  /**
   * Get current database version information
   *
   * @param db - Database instance
   * @param options - Version manager options
   * @returns Promise resolving to version information
   */
  static async getVersionInfo(
    db: WebTimeTrackerDB,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _options: VersionManagerOptions = {} // Required for interface consistency, used in tests
  ): Promise<VersionInfo> {
    try {
      const currentVersion = db.isOpen() ? db.verno : 0;
      const latestVersion = DATABASE_VERSION;

      const versionInfo: VersionInfo = {
        current: currentVersion,
        latest: latestVersion,
        upgradeNeeded: currentVersion < latestVersion,
      };

      // Generate migration path if upgrade is needed
      if (versionInfo.upgradeNeeded) {
        versionInfo.migrationPath = this.generateMigrationPath(currentVersion, latestVersion);
      }

      // Get version history if available
      versionInfo.history = await this.getVersionHistory(db);

      return versionInfo;
    } catch (error) {
      throw new UtilityError(
        UtilityErrorType.VERSION_CHECK_FAILED,
        `Failed to get version info: ${(error as Error).message}`,
        { error }
      );
    }
  }

  /**
   * Compare two database versions
   *
   * @param version1 - First version to compare
   * @param version2 - Second version to compare
   * @returns Version comparison result
   */
  static compareVersions(version1: number, version2: number): VersionComparison {
    const difference = version2 - version1;
    let result: -1 | 0 | 1;

    if (difference < 0) {
      result = -1; // version1 is newer
    } else if (difference > 0) {
      result = 1; // version2 is newer
    } else {
      result = 0; // versions are the same
    }

    return {
      result,
      difference: Math.abs(difference),
      migrationRequired: difference > 0,
    };
  }

  /**
   * Check if database needs upgrade
   *
   * @param db - Database instance
   * @returns Promise resolving to boolean indicating if upgrade is needed
   */
  static async needsUpgrade(db: WebTimeTrackerDB): Promise<boolean> {
    try {
      const currentVersion = db.isOpen() ? db.verno : 0;
      return currentVersion < DATABASE_VERSION;
    } catch (error) {
      throw new UtilityError(
        UtilityErrorType.VERSION_CHECK_FAILED,
        `Failed to check upgrade status: ${(error as Error).message}`,
        { error }
      );
    }
  }

  /**
   * Check if database version is compatible
   *
   * @param db - Database instance
   * @param requiredVersion - Minimum required version
   * @returns Promise resolving to boolean indicating compatibility
   */
  static async isCompatible(
    db: WebTimeTrackerDB,
    requiredVersion: number = DATABASE_VERSION
  ): Promise<boolean> {
    try {
      const currentVersion = db.isOpen() ? db.verno : 0;
      return currentVersion >= requiredVersion;
    } catch (error) {
      throw new UtilityError(
        UtilityErrorType.VERSION_CHECK_FAILED,
        `Failed to check compatibility: ${(error as Error).message}`,
        { error }
      );
    }
  }

  /**
   * Generate migration path between versions
   *
   * @param fromVersion - Starting version
   * @param toVersion - Target version
   * @returns Array of migration steps
   */
  private static generateMigrationPath(fromVersion: number, toVersion: number): string[] {
    const path: string[] = [];

    for (let version = fromVersion + 1; version <= toVersion; version++) {
      path.push(`migrate_to_v${version}`);
    }

    return path;
  }

  /**
   * Get version history from database metadata
   *
   * @param db - Database instance
   * @returns Promise resolving to version history array
   */
  private static async getVersionHistory(db: WebTimeTrackerDB): Promise<VersionInfo['history']> {
    try {
      // TODO: Implement actual version history tracking
      // This is currently placeholder data - consider storing migration timestamps in metadata table
      const currentVersion = db.isOpen() ? db.verno : 0;

      if (currentVersion === 0) {
        return [];
      }

      const history: NonNullable<VersionInfo['history']> = [];

      for (let version = 1; version <= currentVersion; version++) {
        history.push({
          version,
          timestamp: Date.now() - (currentVersion - version) * 86400000, // Mock: each version 1 day apart
          description: this.getVersionDescription(version),
        });
      }

      return history;
    } catch {
      // Return empty history if we can't retrieve it
      return [];
    }
  }

  /**
   * Get description for a specific version
   *
   * @param version - Version number
   * @returns Version description
   */
  private static getVersionDescription(version: number): string {
    const descriptions: Record<number, string> = {
      1: 'Initial database schema with eventslog and aggregatedstats tables',
      // Add more version descriptions as the schema evolves
    };

    return descriptions[version] || `Database version ${version}`;
  }

  /**
   * Validate version number
   *
   * @param version - Version to validate
   * @returns True if version is valid
   */
  static isValidVersion(version: number): boolean {
    return Number.isInteger(version) && version >= 0;
  }

  /**
   * Get latest available version
   *
   * @returns Latest database version
   */
  static getLatestVersion(): number {
    return DATABASE_VERSION;
  }

  /**
   * Format version for display
   *
   * @param version - Version number to format
   * @returns Formatted version string
   */
  static formatVersion(version: number): string {
    return `v${version}`;
  }

  /**
   * Check if version is current
   *
   * @param version - Version to check
   * @returns True if version is current
   */
  static isCurrent(version: number): boolean {
    return version === DATABASE_VERSION;
  }

  /**
   * Check if version is outdated
   *
   * @param version - Version to check
   * @returns True if version is outdated
   */
  static isOutdated(version: number): boolean {
    return version < DATABASE_VERSION;
  }

  /**
   * Get version status string
   *
   * @param version - Version to check
   * @returns Status string
   */
  static getVersionStatus(version: number): string {
    if (this.isCurrent(version)) {
      return 'current';
    } else if (this.isOutdated(version)) {
      return 'outdated';
    } else {
      return 'future';
    }
  }
}
