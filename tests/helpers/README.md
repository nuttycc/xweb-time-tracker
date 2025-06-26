# Test Helpers Documentation

This directory contains type-safe test utilities that eliminate the need for manual string literals in test files.

## Quick Start

### Before (Manual String Literals)

```typescript
// ❌ Error-prone: manual typing, no autocomplete, typo risk
const testEvent = createTestEvent({
  eventType: 'open_time_start', // Manual string - risky!
  // ...
});
```

### After (Type-Safe Constants)

```typescript
// ✅ Type-safe: autocomplete, refactor-safe, no typos
import { createTestEvent, TEST_EVENT_TYPES } from '../helpers';

const testEvent = createTestEvent({
  eventType: TEST_EVENT_TYPES.OPEN_TIME_START, // Type-safe constant
  // ...
});
```

## Available Utilities

### Event Type Constants

```typescript
import { TEST_EVENT_TYPES } from '../helpers';

// All available event types with descriptive names
TEST_EVENT_TYPES.OPEN_TIME_START; // 'open_time_start'
TEST_EVENT_TYPES.OPEN_TIME_END; // 'open_time_end'
TEST_EVENT_TYPES.ACTIVE_TIME_START; // 'active_time_start'
TEST_EVENT_TYPES.ACTIVE_TIME_END; // 'active_time_end'
TEST_EVENT_TYPES.CHECKPOINT; // 'checkpoint'
```

### Factory Functions

```typescript
import {
  createTestEvent,
  createOpenTimeStartEvent,
  createOpenTimeEndEvent,
  createActiveTimeStartEvent,
  createActiveTimeEndEvent,
  createCheckpointEvent,
} from '../helpers';

// Generic event with overrides
const event = createTestEvent({
  timestamp: 1000,
  visitId: 'visit-1',
});

// Specific event types
const startEvent = createOpenTimeStartEvent({ timestamp: 1000 });
const endEvent = createOpenTimeEndEvent({ timestamp: 2000 });
```

### Event Pairs and Sequences

```typescript
import {
  createOpenTimePair,
  createActiveTimePair,
  createEventSequence,
  EVENT_SEQUENCES,
} from '../helpers';

// Create start/end pairs automatically
const [startEvent, endEvent] = createOpenTimePair(
  {
    visitId: 'visit-1',
    url: 'https://example.com',
  },
  1000
); // 1000ms time difference

// Create predefined sequences
const events = createEventSequence(
  EVENT_SEQUENCES.ACTIVE_TIME_WITH_CHECKPOINT,
  { visitId: 'visit-1' },
  500 // 500ms between events
);
```

### Event Type Pairs

```typescript
import { EVENT_TYPE_PAIRS } from '../helpers';

// Commonly used pairs
EVENT_TYPE_PAIRS.OPEN_TIME.START; // 'open_time_start'
EVENT_TYPE_PAIRS.OPEN_TIME.END; // 'open_time_end'
EVENT_TYPE_PAIRS.ACTIVE_TIME.START; // 'active_time_start'
EVENT_TYPE_PAIRS.ACTIVE_TIME.END; // 'active_time_end'
```

## Migration Examples

### Simple Event Creation

```typescript
// Before
const testEvents = [
  createTestEvent({
    eventType: 'open_time_start',
    timestamp: 1000,
  }),
  createTestEvent({
    eventType: 'open_time_end',
    timestamp: 2000,
  }),
];

// After
const testEvents = [
  createTestEvent({
    eventType: TEST_EVENT_TYPES.OPEN_TIME_START,
    timestamp: 1000,
  }),
  createTestEvent({
    eventType: TEST_EVENT_TYPES.OPEN_TIME_END,
    timestamp: 2000,
  }),
];

// Even better - use factory functions
const [startEvent, endEvent] = createOpenTimePair({}, 1000);
```

### Complex Event Sequences

```typescript
// Before
const complexEvents = [
  createTestEvent({ eventType: 'open_time_start', timestamp: 1000 }),
  createTestEvent({ eventType: 'active_time_start', timestamp: 1500 }),
  createTestEvent({ eventType: 'checkpoint', timestamp: 2000 }),
  createTestEvent({ eventType: 'active_time_end', timestamp: 2500 }),
  createTestEvent({ eventType: 'open_time_end', timestamp: 3000 }),
];

// After
const complexEvents = createEventSequence(
  EVENT_SEQUENCES.COMPLEX_TRACKING,
  { visitId: 'visit-1', url: 'https://example.com' },
  500 // 500ms between events
);
```

## Benefits

- ✅ **Type Safety**: Compile-time checking prevents typos
- ✅ **Autocomplete**: Full IDE support for event types
- ✅ **Refactor Safe**: Renaming propagates automatically
- ✅ **Readable**: Descriptive names improve test clarity
- ✅ **Maintainable**: Single source of truth for event types
- ✅ **Consistent**: Standardized test data creation

## Integration with Existing Code

The new helpers are designed to be **backward compatible**. You can:

1. **Gradually migrate**: Replace string literals one test at a time
2. **Mix approaches**: Use both old and new patterns during transition
3. **No breaking changes**: Existing tests continue to work unchanged
