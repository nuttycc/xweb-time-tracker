I have created the following plan after thorough exploration and analysis of the codebase. Follow the below plan verbatim. Trust the files and references. Do not re-verify what's written in the plan. Explore only when absolutely necessary. First implement all the proposed file changes and then I'll review all the changes together at the end. Make sure you fix all the linting, compilation or validation issues after successful implementation of the plan.

### Observations

The codebase has a solid foundation with a complete database layer, URL processing utilities, and established patterns for background services. The aggregator module provides excellent examples of how to implement scheduled tasks, storage management, and service architecture. The existing URL normalizer utility already handles the filtering requirements specified in CSPEC. The WXT framework is properly configured with necessary permissions, and the project structure follows clean architecture principles with clear separation between core logic, utilities, and entry points.

### Approach

This implementation follows the 4-phase approach outlined in `03-core-task-time-tracking.md` to build a comprehensive time tracking engine. The plan leverages existing database infrastructure and URL processing utilities while implementing new core functionality for browser event monitoring, state management, event generation, and crash recovery. The architecture follows established patterns from the aggregator module, using WXT framework conventions and maintaining separation of concerns through dedicated services and utilities.

### Reasoning

I analyzed the task requirements from `docs/plan/core/03-core-task-time-tracking.md` and explored the existing codebase structure. I examined the database layer implementation in `src/core/db/`, reviewed the URL normalization utilities, studied the aggregator module patterns for scheduling and storage usage, and understood the WXT framework setup. I also reviewed the detailed specifications in LLD and CSPEC documents to understand the technical requirements and configuration parameters.

## Mermaid Diagram

sequenceDiagram
    participant CS as Content Script
    participant BG as Background Script
    participant TTE as TimeTrackingEngine
    participant SM as StateManager
    participant EG as EventGenerator
    participant EQ as EventQueue
    participant DB as DatabaseService

    Note over BG: Extension Startup
    BG->>BG: RecoveryService.resolveOrphans()
    BG->>TTE: Initialize with services
    BG->>TTE: Setup browser event listeners

    Note over CS: User Interaction
    CS->>CS: Detect scroll/mouse/key events
    CS->>CS: Apply threshold validation
    CS->>BG: Send interaction message
    BG->>TTE: Handle interaction
    TTE->>SM: Check isFocusTab()
    SM-->>TTE: Focus validation result
    
    alt Tab is focused
        TTE->>EG: Generate active_time_start
        EG->>EG: Apply URL normalization
        EG->>EQ: Queue domain event
        EQ->>EQ: Batch events
        EQ->>DB: Flush to database
    else Tab not focused
        TTE->>TTE: Ignore interaction
    end

    Note over BG: Checkpoint Cycle
    BG->>BG: Chrome alarm triggers
    BG->>SM: Get active sessions
    SM-->>BG: Sessions exceeding thresholds
    BG->>EG: Generate checkpoint events
    EG->>EQ: Queue checkpoint events
    EQ->>DB: Immediate flush

## Proposed File Changes

### src\core\time-tracker\index.ts(NEW)

References: 

- src\core\db\index.ts

Create the main entry point for the time tracking module, exporting all public interfaces, services, and utilities. Follow the same pattern as `src/core/db/index.ts` to provide a clean API surface for consumers. Export TimeTrackingEngine, StateManager, EventQueue, CheckpointScheduler, RecoveryService, ConfigService, and all related types and constants.

### src\core\time-tracker\types\index.ts(NEW)

References: 

- docs\specs\base\5-CSPEC.md
- docs\specs\base\4-LLD.md

Define core TypeScript interfaces and types for the time tracking system. Include TabState interface with properties like `url`, `visitId`, `activityId`, `isAudible`, `lastInteractionTimestamp`. Define UserInteraction type for content script messages with `type`, `scrollDelta`, `mouseDelta` properties. Create DomainEventInput type for event generation. Define configuration interfaces matching CSPEC parameters. Include enums for interaction types and timeout scenarios.

### src\core\time-tracker\constants\index.ts(NEW)

References: 

- docs\specs\base\5-CSPEC.md
- src\core\aggregator\utils\constants.ts

Define all configuration constants from CSPEC document. Include timeout values (`INACTIVE_TIMEOUT_DEFAULT`, `INACTIVE_TIMEOUT_MEDIA`), interaction thresholds (`SCROLL_THRESHOLD_PIXELS`, `MOUSEMOVE_THRESHOLD_PIXELS`), checkpoint parameters (`CHECKPOINT_ACTIVE_TIME_THRESHOLD`, `CHECKPOINT_OPEN_TIME_THRESHOLD`, `CHECKPOINT_INTERVAL`), and ignored hostnames list. Use the same pattern as aggregator constants with proper TypeScript typing and JSDoc comments.

### src\core\time-tracker\config\ConfigService.ts(NEW)

References: 

- src\core\aggregator\scheduler\AggregationScheduler.ts
- docs\specs\base\5-CSPEC.md

Implement configuration management service using WXT storage API. Provide reactive getters for all CSPEC parameters with fallback to default values. Implement `chrome.storage.onChanged` listener to detect external configuration updates and emit internal events. Include methods like `getInactiveTimeout(isAudible: boolean)`, `getCheckpointThresholds()`, `getIgnoredHostnames()`. Follow the same error handling patterns as `DatabaseService` and include proper validation using Zod schemas.

### src\core\time-tracker\state\StateManager.ts(NEW)

References: 

- docs\specs\base\4-LLD.md
- src\core\time-tracker\types\index.ts(NEW)

Implement in-memory state management for active tabs using Map<tabId, TabState>. Include `isFocusTab(tabId)` method that strictly follows LLD single-focus principle by querying `chrome.tabs.query({ active: true, lastFocusedWindow: true })`. Provide methods for updating tab state on navigation, activation, and interaction events. Include getters for active sessions that need checkpoint evaluation. Implement cleanup methods for closed tabs and session state persistence for crash recovery.

### src\core\time-tracker\events\EventQueue.ts(NEW)

References: 

- src\core\db\models\eventslog.model.ts
- src\core\db\services\database.service.ts
- docs\specs\base\4-LLD.md

Implement FIFO event queue with batch processing capabilities. Use in-memory array to store events before database writes. Include configurable flush triggers based on queue size and time intervals. Implement `flush()` method that validates events using Zod schemas from `eventslog.model.ts` and writes to database via `DatabaseService`. Handle `QuotaExceededError` with the three-tier response strategy from LLD. Include metrics tracking for queue performance and error rates.

### src\core\time-tracker\events\EventGenerator.ts(NEW)

References: 

- src\core\db\utils\url-normalizer.util.ts
- src\core\db\models\eventslog.model.ts

Implement core event generation logic for all domain event types. Include methods like `generateOpenTimeStart()`, `generateOpenTimeEnd()`, `generateActiveTimeStart()`, `generateActiveTimeEnd()`, `generateCheckpoint()`. Each method should generate proper UUIDs for visitId/activityId, apply URL normalization using existing `url-normalizer.util.ts`, and validate against ignored hostnames. Include proper timestamp handling and event validation before queuing.

### src\core\time-tracker\scheduler\CheckpointScheduler.ts(NEW)

References: 

- src\core\aggregator\scheduler\AggregationScheduler.ts
- docs\specs\base\5-CSPEC.md

Implement checkpoint scheduling using `chrome.alarms` API following the same pattern as `AggregationScheduler.ts`. Create periodic alarm with `CHECKPOINT_INTERVAL` that evaluates all active sessions in StateManager. Generate checkpoint events when sessions exceed `CHECKPOINT_ACTIVE_TIME_THRESHOLD` or `CHECKPOINT_OPEN_TIME_THRESHOLD`. Include proper error handling and logging. Ensure checkpoint events trigger immediate incremental aggregation as specified in SRS requirements.

### src\core\time-tracker\recovery\RecoveryService.ts(NEW)

References: 

- src\core\db\repositories\eventslog.repository.ts
- docs\specs\base\4-LLD.md

Implement two-phase startup recovery logic as specified in LLD section 4.4. Phase 1: Query `EventsLogRepository` to find orphan sessions (events with `_start` but no corresponding `_end`), generate synthetic `_end` events with `resolution: 'crash_recovery'` using last known timestamps. Phase 2: Clear old session state from storage, query current open tabs, generate new `visitId` for each tab and create `open_time_start` events. Follow interaction-driven principle by not pre-setting any active states.

### src\core\time-tracker\engine\TimeTrackingEngine.ts(NEW)

References: 

- src\core\time-tracker\state\StateManager.ts(NEW)
- src\core\time-tracker\events\EventQueue.ts(NEW)
- src\core\time-tracker\config\ConfigService.ts(NEW)

Implement the main orchestration class that coordinates all time tracking functionality. Include dependency injection for ConfigService, StateManager, EventQueue, EventGenerator. Implement browser event handlers for tabs.onActivated, tabs.onUpdated, tabs.onRemoved, windows.onFocusChanged, webNavigation.onCommitted. Each handler must enforce single-focus principle before processing. Include interaction timeout management with different thresholds for media vs default content. Provide public methods for handling content script interactions and managing engine lifecycle.

### src\core\time-tracker\messaging\types.ts(NEW)

Define TypeScript interfaces for content script to background messaging using @webext-core/messaging patterns. Include message types for user interactions (`USER_INTERACTION`, `PAGE_VISIBILITY_CHANGE`), with payloads containing interaction details like scroll delta, mouse movement delta, and interaction type. Define response types and error handling interfaces. Include proper type guards and validation schemas.

### src\core\time-tracker\messaging\handlers.ts(NEW)

References: 

- src\core\time-tracker\messaging\types.ts(NEW)
- src\core\time-tracker\engine\TimeTrackingEngine.ts(NEW)

Implement message handlers for content script communication using @webext-core/messaging. Create handlers for user interaction messages that validate thresholds (scroll/mouse movement), check single-focus principle, and delegate to TimeTrackingEngine for event generation. Include proper error handling and response formatting. Follow async/await patterns and include timeout handling for message processing.

### src\core\time-tracker\utils\interaction-detector.ts(NEW)

References: 

- src\core\time-tracker\constants\index.ts(NEW)
- docs\specs\base\5-CSPEC.md

Implement utility functions for detecting valid user interactions based on CSPEC thresholds. Include functions like `isValidScrollInteraction(delta)`, `isValidMouseMovement(delta)`, `shouldTriggerActiveTime(interactionType, delta)`. Apply threshold constants and provide debouncing logic to prevent excessive event generation. Include TypeScript types for interaction validation results.

### src\core\time-tracker\utils\session-helpers.ts(NEW)

Implement utility functions for session management including UUID generation for visitId/activityId, session duration calculations, and timeout evaluation. Include functions like `generateVisitId()`, `generateActivityId()`, `calculateSessionDuration()`, `isSessionExpired()`. Use crypto.randomUUID() for ID generation and provide proper TypeScript typing for all helper functions.

### src\entrypoints\background\index.ts(MODIFY)

References: 

- src\core\time-tracker\index.ts(NEW)
- src\core\time-tracker\engine\TimeTrackingEngine.ts(NEW)
- src\core\time-tracker\recovery\RecoveryService.ts(NEW)

Replace the existing console.log implementations with proper TimeTrackingEngine integration. Import and initialize TimeTrackingEngine, RecoveryService, and CheckpointScheduler. Implement startup sequence: first run RecoveryService.resolveOrphans(), then initialize TimeTrackingEngine with proper event listeners. Add runtime.onSuspend handler for graceful shutdown that flushes EventQueue. Include proper error handling and logging throughout the initialization process.

### src\entrypoints\content.ts(MODIFY)

References: 

- src\core\time-tracker\messaging\types.ts(NEW)
- src\core\time-tracker\utils\interaction-detector.ts(NEW)

Replace the minimal implementation with comprehensive user interaction detection. Change matches to `['<all_urls>']` to track all websites. Implement event listeners for scroll, mousemove, mousedown, keydown events with proper debouncing and threshold checking using `interaction-detector.ts` utilities. Send interaction messages to background script using @webext-core/messaging. Include page visibility API integration and proper cleanup on page unload.

### wxt.config.ts(MODIFY)

References: 

- docs\plan\core\03-core-task-time-tracking.md

Add required permissions for time tracking functionality. Include 'alarms' permission for checkpoint scheduling, 'storage' permission for configuration management, 'webNavigation' permission for SPA route detection. Update host_permissions to ensure content script can run on all URLs. Add 'runtime' permission for onSuspend handling if not already included.

### tests\unit\time-tracker\engine\TimeTrackingEngine.test.ts(NEW)

References: 

- tests\unit\aggregator\engine\AggregationEngine.test.ts

Create comprehensive unit tests for TimeTrackingEngine covering single-focus principle enforcement, event generation for different scenarios (tab activation, navigation, interaction), timeout handling for media vs default content, and error handling. Use vitest-chrome for mocking browser APIs and vitest-mock-extended for service mocking. Follow the same testing patterns as existing aggregator tests.

### tests\unit\time-tracker\state\StateManager.test.ts(NEW)

References: 

- tests\unit\db\connection-manager.test.ts

Create unit tests for StateManager covering tab state management, single-focus validation, session tracking, and cleanup operations. Mock chrome.tabs.query for focus detection testing. Test edge cases like rapid tab switching, window focus changes, and tab closure scenarios. Include tests for state persistence and recovery scenarios.

### tests\unit\time-tracker\events\EventQueue.test.ts(NEW)

References: 

- tests\unit\db\services\database.service.test.ts

Create unit tests for EventQueue covering batch processing, flush triggers, database integration, and error handling including QuotaExceededError scenarios. Mock DatabaseService and test queue performance under various load conditions. Include tests for event validation and proper FIFO ordering.

### tests\unit\time-tracker\recovery\RecoveryService.test.ts(NEW)

References: 

- tests\unit\db\repositories\eventslog.repository.test.ts

Create unit tests for RecoveryService covering orphan session detection, synthetic event generation with crash_recovery resolution, and two-phase initialization. Mock EventsLogRepository and chrome.tabs.query. Test various crash scenarios and ensure proper recovery event generation with correct timestamps and metadata.

### tests\integration\time-tracker\full-lifecycle.test.ts(NEW)

References: 

- tests\integration\db\database-operations.test.ts

Create integration tests covering complete time tracking lifecycle from user interaction to database storage. Test scenarios like opening tabs, user interactions, timeout handling, checkpoint generation, and graceful shutdown. Use fake-indexeddb for database testing and comprehensive browser API mocking. Include performance testing for event processing throughput.

### tests\unit\time-tracker\config\ConfigService.test.ts(NEW)

References: 

- tests\unit\aggregator\scheduler\AggregationScheduler.test.ts

Create unit tests for ConfigService covering configuration loading, default value fallbacks, storage change detection, and reactive updates. Mock chrome.storage APIs and test configuration validation. Include tests for CSPEC parameter handling and configuration synchronization scenarios.