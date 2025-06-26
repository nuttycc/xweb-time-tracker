# Data Aggregation Module

This module provides comprehensive data aggregation functionality for the WebTime tracker, including event processing, scheduling, data pruning, and service management.

## Architecture

```
src/core/aggregator/
├── index.ts              # Main module entry point
├── engine/               # Core aggregation logic
│   ├── AggregationEngine.ts
│   └── index.ts
├── scheduler/            # Task scheduling
│   ├── AggregationScheduler.ts
│   └── index.ts
├── pruner/              # Data cleanup
│   ├── DataPruner.ts
│   └── index.ts
├── services/            # Service coordination
│   ├── AggregationService.ts
│   └── index.ts
└── utils/               # Shared utilities
    ├── constants.ts
    └── types.ts
```

## Usage

### Importing Components

```typescript
// Import main components
import {
  AggregationEngine,
  AggregationScheduler,
  DataPruner,
  AggregationService,
} from '@/core/aggregator';

// Import types
import type {
  AggregationResult,
  VisitGroup,
  AggregatedData,
  Logger,
  SchedulerOptions,
} from '@/core/aggregator';

// Import constants
import {
  DEFAULT_PRUNER_RETENTION_DAYS,
  AGGREGATION_ALARM_NAME,
  AGGREGATION_LOCK_KEY,
} from '@/core/aggregator';

// Import namespaced types (alternative)
import { AggregatorTypes } from '@/core/aggregator';
type Result = AggregatorTypes.AggregationResult;
```

### Legacy Imports (Still Supported)

```typescript
// Sub-module imports still work for backward compatibility
import { AggregationEngine } from '@/core/aggregator/engine';
import { AggregationScheduler } from '@/core/aggregator/scheduler';
```

## Components

### AggregationEngine

Core component for processing raw event logs and converting them into aggregated statistical data.

### AggregationScheduler

Manages the scheduling of aggregation tasks using the browser.alarms API with concurrency control and monitoring.

### DataPruner

Cleans up old, processed event logs from the database based on configurable retention policies.

### AggregationService

Main service for coordinating all aggregation components and managing their lifecycle.

## Configuration

The module uses several configuration constants that can be customized:

- `DEFAULT_PRUNER_RETENTION_DAYS`: Default retention period for event logs (30 days)
- `AGGREGATION_LOCK_TTL_MS`: Lock timeout for preventing concurrent aggregation (5 minutes)
- `SCHEDULER_PERIOD_MINUTES_KEY`: Storage key for scheduler period configuration

## Internal Structure

- **engine/**: Contains the core aggregation logic and algorithms
- **scheduler/**: Handles task scheduling and Chrome alarms integration
- **pruner/**: Manages data cleanup and retention policies
- **services/**: Provides high-level service coordination
- **utils/**: Shared types, constants, and utilities

Each sub-module maintains its own `index.ts` for backward compatibility and internal organization.
