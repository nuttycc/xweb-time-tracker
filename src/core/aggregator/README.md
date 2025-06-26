# Data Aggregation Module v1

This module is responsible for processing raw event logs into meaningful, aggregated statistics. It operates in the background, ensuring that data is periodically and efficiently summarized.

## Key Components

- **`AggregationEngine`**: The core of the module. It fetches unprocessed events from the database, groups them by visit sessions, calculates `Open Time` and `Active Time`, and handles `checkpoint` events for long-running sessions. It uses `psl` for accurate parent domain parsing.

- **`AggregationScheduler`**: Manages when the aggregation process runs. It uses `chrome.alarms` to periodically trigger the engine. It includes a locking mechanism (`AGGREGATION_LOCK_KEY`) to prevent multiple aggregation tasks from running concurrently.

- **`DataPruner`**: Responsible for data lifecycle management. After a successful aggregation run, it cleans up old, already-processed events from the database based on a configurable retention period (`PRUNER_RETENTION_DAYS_KEY`).

- **`AggregationService`**: The main entry point and coordinator for the module. It initializes and manages the lifecycle (start/stop) of the `AggregationScheduler`.

## Data Flow

1.  `AggregationScheduler` triggers a task based on its schedule.
2.  The scheduler invokes the `AggregationEngine` to run.
3.  The `AggregationEngine` fetches unprocessed events, calculates time statistics, and saves the results to the `aggregated_stats` table.
4.  After the engine successfully completes, the `DataPruner` is invoked to delete old events from the `events_log` table.
5.  The scheduler releases its lock, ready for the next run.

## Current Status

- The `AggregationEngine` is fully implemented and handles core time calculation logic, including support for `checkpoint` events.
- The `AggregationScheduler` provides reliable, periodic execution with concurrency control.
- The `DataPruner` ensures that the event log database does not grow indefinitely.
- The `AggregationService` properly orchestrates the components.

The module is stable and functional, forming a critical part of the extension's data processing pipeline.