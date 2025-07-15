import { storage } from '#imports';
import { createLogger } from '@/utils/logger';
import { configManager } from './manager';

const logger = createLogger('ConfigMigration');

/**
 * Migrates old configuration format to new RetentionPolicy-based format.
 * This ensures existing users' settings are preserved when upgrading.
 */
export class ConfigMigration {
  private static readonly OLD_RETENTION_DAYS_KEY = 'sync:pruner_retention_days';
  private static readonly MIGRATION_COMPLETED_KEY = 'local:retention_policy_migration_completed';

  /**
   * Runs the migration process if it hasn't been completed yet.
   */
  public static async runMigration(): Promise<void> {
    try {
      // Check if migration has already been completed
      const migrationCompleted = await storage.getItem<boolean>(
        ConfigMigration.MIGRATION_COMPLETED_KEY,
      );

      if (migrationCompleted) {
        logger.debug('Retention policy migration already completed, skipping');
        return;
      }

      logger.info('Starting retention policy configuration migration');

      // Check if old retention days configuration exists
      const oldRetentionDays = await storage.getItem<number>(
        ConfigMigration.OLD_RETENTION_DAYS_KEY,
      );

      if (oldRetentionDays !== null && oldRetentionDays !== undefined) {
        logger.info('Found old retention days configuration', { oldRetentionDays });

        // Migrate to new retention policy format
        await ConfigMigration.migrateRetentionDays(oldRetentionDays);

        // Clean up old configuration
        await storage.removeItem(ConfigMigration.OLD_RETENTION_DAYS_KEY);
        logger.info('Removed old retention days configuration');
      } else {
        logger.info('No old retention days configuration found, using defaults');
      }

      // Mark migration as completed
      await storage.setItem(ConfigMigration.MIGRATION_COMPLETED_KEY, true);
      logger.info('Retention policy migration completed successfully');
    } catch (error) {
      logger.error('Failed to run retention policy migration', { error });
      // Don't throw - allow the application to continue with defaults
    }
  }

  /**
   * Migrates old retentionDays value to new RetentionPolicy format.
   */
  private static async migrateRetentionDays(oldRetentionDays: number): Promise<void> {
    await configManager.initialize();

    // Determine the appropriate policy based on the old retention days value
    let policy: 'immediate' | 'short' | 'long' | 'permanent';
    let longDays = 30; // default

    if (oldRetentionDays <= 1) {
      policy = 'immediate';
    } else if (oldRetentionDays <= 7) {
      policy = 'short';
    } else if (oldRetentionDays >= 365 * 10) {
      // Very large values indicate user wanted permanent retention
      policy = 'permanent';
    } else {
      policy = 'long';
      longDays = oldRetentionDays;
    }

    logger.info('Migrating retention configuration', {
      oldRetentionDays,
      newPolicy: policy,
      newLongDays: longDays,
    });

    // Update the retention policy configuration
    await configManager.updateConfig({
      retentionPolicy: {
        policy,
        shortDays: 7, // keep default
        longDays,
      },
    });

    logger.info('Successfully migrated retention configuration');
  }
}
