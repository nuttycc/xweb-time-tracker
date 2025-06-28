I have created the following plan after thorough exploration and analysis of the codebase. Follow the below plan verbatim. Trust the files and references. Do not re-verify what's written in the plan. Explore only when absolutely necessary. First implement all the proposed file changes and then I'll review all the changes together at the end. Make sure you fix all the linting, compilation or validation issues after successful implementation of the plan.

重要声明：
- 每一阶段都要通过 “pnpm check” 检查语法问题，确保无错误
- 每一阶段都要及时编写单元测试验证
- 每一阶段完成后使用`寸止`报告

- 遇到难题及时网络搜索，或者调用 MCP server 工具，搜集信息
- 如果尝试 3 次仍然无法解决，及时`寸止`联系我

[importance="PRIMARY,CRITICAL,PARAMOUNT"] First, Read the following documents:
- docs\plan\core\03\03-core-task-time-tracking-apis.md
- docs\plan\core\03\03-core-task-time-tracking.md


### Observations

Based on my analysis of the codebase, I can see that:

1. **Database infrastructure is complete**: The project has a fully implemented database layer with Dexie, schemas, models, repositories, and services. The `EventsLogRecord` interface and `DatabaseService` are ready for use.

2. **URL normalization exists but needs extension**: There's already a sophisticated URL normalizer using a whitelist approach, but it needs to be extended to support the CSPEC blacklist requirements (`IGNORED_QUERY_PARAMS_DEFAULT` and `IGNORED_HOSTNAMES_DEFAULT`). Final should merge *user config + system config*.

3. **Project structure is well-organized**: The codebase follows a clean architecture with separate concerns for database, aggregation, and entry points. Testing infrastructure is comprehensive with unit, integration, and performance tests.

4. **WXT framework is properly configured**: The project uses WXT 0.20.7 with proper browser API access patterns and content script support.

5. **Missing core tracker module**: The time tracking engine itself doesn't exist yet - this is what we need to implement according to the 4-stage plan in the specification document.

### Approach

The implementation will follow the 4-stage approach defined in `03-core-task-time-tracking.md`:

**Stage 1**: Browser event listeners and core state management
**Stage 2**: Core event generation logic with URL processing
**Stage 3**: Long-term session and reliability mechanisms
**Stage 4**: Startup recovery and integration

Each stage will include unit tests and be completed before moving to the next. The implementation will leverage existing database infrastructure and extend the URL normalizer to meet CSPEC requirements. We'll use WXT's browser API wrappers, zod v4 for validation, and follow the established testing patterns.

### Reasoning

I analyzed the task requirements from the `03-core-task-time-tracking.md` document and explored the existing codebase structure. I examined the database layer implementation, URL normalization utilities, test patterns, and WXT configuration. I also researched WXT framework browser API usage and zod v4 import syntax to understand the technical constraints and requirements.

## Mermaid Diagram

sequenceDiagram
    participant CS as Content Script
    participant BG as Background Script
    participant FSM as FocusStateManager
    participant EG as EventGenerator
    participant EQ as EventQueue
    participant DB as DatabaseService
    participant CPS as CheckpointScheduler

    Note over CS,CPS: Stage 1: Browser Event Listening & State Management
    
    BG->>FSM: Initialize with current tabs
    BG->>+FSM: tabs.onActivated(tabId)
    FSM->>FSM: Update focus state
    FSM->>-EG: Generate open_time_start event
    
    CS->>BG: User interaction (scroll/click)
    BG->>+FSM: Update interaction timestamp
    FSM->>-EG: Generate active_time_start event
    
    Note over CS,CPS: Stage 2: Event Generation & URL Processing
    
    EG->>EG: Validate & normalize URL
    EG->>EQ: Enqueue domain event
    EQ->>EQ: Check batch threshold
    EQ->>DB: Batch write events
    
    Note over CS,CPS: Stage 3: Checkpoint & Reliability
    
    CPS->>CPS: Periodic alarm trigger
    CPS->>FSM: Check long-running sessions
    CPS->>EG: Generate checkpoint events
    EG->>EQ: Enqueue checkpoint
    
    BG->>EQ: runtime.onSuspend
    EQ->>DB: Flush all pending events
    
    Note over CS,CPS: Stage 4: Startup Recovery
    
    BG->>DB: Query orphan sessions
    BG->>EG: Generate crash_recovery events
    BG->>FSM: Initialize current tab states

## Proposed File Changes

### src\config\constants.ts(NEW)

References: 

- docs\specs\base\5-CSPEC.md

Create a centralized configuration file that exports all CSPEC constants as typed objects. This will include time tracking thresholds (`INACTIVE_TIMEOUT_DEFAULT`, `INACTIVE_TIMEOUT_MEDIA`, `SCROLL_THRESHOLD_PIXELS`, `MOUSEMOVE_THRESHOLD_PIXELS`), URL filtering rules (`IGNORED_HOSTNAMES_DEFAULT`, `IGNORED_QUERY_PARAMS_DEFAULT`), checkpoint parameters (`CHECKPOINT_ACTIVE_TIME_THRESHOLD`, `CHECKPOINT_OPEN_TIME_THRESHOLD`, `CHECKPOINT_INTERVAL`), and other configuration values from CSPEC. Use zod v4 schemas to validate configuration values and provide type safety.

### src\core\tracker(NEW)

Create the main tracker module directory that will contain all time tracking engine components.

### src\core\tracker\types\index.ts(NEW)

References: 

- src\core\db\schemas\eventslog.schema.ts

Define core TypeScript interfaces and types for the time tracking system using zod v4 schemas. Include `TabState` interface for tracking individual tab states, `InteractionMessage` for content script communication, `DomainEvent` union types for all event types, and `FocusContext` for managing the single-focus principle. All interfaces should be validated with zod schemas for runtime type safety.

### src\core\tracker\state\FocusStateManager.ts(NEW)

References: 

- docs\plan\core\03-core-task-time-tracking.md

Implement the core state management class that maintains the "single focus" principle. This class will track the state of all browser tabs using a Map<tabId, TabState> structure. It will provide methods like `isFocusTab(tabId)`, `updateTabState(tabId, updates)`, `getFocusedTab()`, and `clearTabState(tabId)`. The manager will handle tab lifecycle events and ensure only one tab can be considered "focused" at any time according to LLD specifications.

### src\core\tracker\events\EventGenerator.ts(NEW)

References: 

- src\core\db\schemas\eventslog.schema.ts
- src\core\db\utils\url-normalizer.util.ts

Create the event generation engine that converts browser events and state changes into domain events. This class will generate `open_time_start`, `open_time_end`, `active_time_start`, `active_time_end`, and `checkpoint` events based on user interactions and state transitions. It will integrate with the URL normalizer and apply business rules for event creation. Each generated event will be validated using zod schemas before being queued.

### src\core\tracker\queue\EventQueue.ts(NEW)

References: 

- src\core\db\services\database.service.ts

Implement a FIFO event queue with batch processing capabilities. The queue will collect generated events in memory and trigger batch writes to the database when size thresholds or time intervals are reached. It will provide methods for `enqueue(event)`, `flush()`, and `size()`. The queue will integrate with the `DatabaseService` for batch writing and handle back-pressure scenarios.

### src\core\tracker\scheduler\CheckpointScheduler.ts(NEW)

References: 

- src\config\constants.ts(NEW)

Create a checkpoint scheduling system using `chrome.alarms` API. This scheduler will periodically check all active sessions (both Open Time and Active Time) and generate checkpoint events when thresholds are exceeded. It will integrate with the `FocusStateManager` to identify long-running sessions and use the `EventGenerator` to create checkpoint events. The scheduler will handle alarm persistence across service worker restarts.

### src\core\tracker\recovery\StartupRecovery.ts(NEW)

References: 

- src\core\db\services\database.service.ts
- docs\plan\core\03-core-task-time-tracking.md

Implement the two-phase startup recovery system as defined in LLD. Phase 1 will identify orphan sessions (events without corresponding end events) and generate crash recovery end events. Phase 2 will clear old local storage state and initialize new sessions for currently open tabs. This class will query the database for incomplete sessions and work with the `EventGenerator` to create recovery events marked with `resolution: 'crash_recovery'`.

### src\core\tracker\url\URLProcessor.ts(NEW)

References: 

- src\core\db\utils\url-normalizer.util.ts
- src\config\constants.ts(NEW)

Extend the existing URL normalization functionality to support CSPEC requirements. This processor will integrate with the existing `url-normalizer.util.ts` and add support for hostname filtering (`IGNORED_HOSTNAMES_DEFAULT`) and additional query parameter filtering (`IGNORED_QUERY_PARAMS_DEFAULT`). It will provide methods like `shouldIgnoreHostname(url)`, `normalizeUrlForTracking(url)`, and `isValidTrackingUrl(url)`.

### src\core\tracker\messaging\InteractionDetector.ts(NEW)

References: 

- src\config\constants.ts(NEW)

Create a messaging interface for communication between content scripts and background script. This will define the message schema for user interactions (scroll, mousemove, keydown, mousedown) and provide type-safe messaging using `@webext-core/messaging`. The detector will validate interaction thresholds (`SCROLL_THRESHOLD_PIXELS`, `MOUSEMOVE_THRESHOLD_PIXELS`) before sending messages to the background script.

### src\core\tracker\index.ts(NEW)

Create the main tracker module export file that provides a clean API for the time tracking engine. Export the main `TimeTracker` class that orchestrates all components and provides methods like `initialize()`, `start()`, `stop()`, and `handleBrowserEvent()`. This will be the primary interface used by the background script.

### src\entrypoints\background\index.ts(MODIFY)

References: 

- src\core\tracker\index.ts(NEW)

Replace the current console-only event listeners with the full time tracking engine integration. Import and initialize the `TimeTracker` from `src/core/tracker/index.ts`. Set up proper event handling for `tabs.onActivated`, `tabs.onUpdated`, `tabs.onRemoved`, `windows.onFocusChanged`, and `webNavigation.onCommitted`. Add startup recovery logic and checkpoint scheduling. Implement graceful shutdown handling with `runtime.onSuspend` to flush pending events.

### src\entrypoints\content.ts(MODIFY)

References: 

- src\core\tracker\messaging\InteractionDetector.ts(NEW)

Expand the content script to detect user interactions and send them to the background script. Implement event listeners for `scroll`, `mousemove`, `mousedown`, and `keydown` events with proper throttling and threshold checking. Use the `InteractionDetector` messaging interface to communicate with the background script. Change the matches pattern from just Google to `['<all_urls>']` to track all websites.

### tests\unit\tracker(NEW)

Create the test directory structure for tracker unit tests.

### tests\unit\tracker\state\FocusStateManager.test.ts(NEW)

References: 

- src\core\tracker\state\FocusStateManager.ts(NEW)

Write comprehensive unit tests for the FocusStateManager class. Test the single-focus principle, tab state transitions, edge cases like rapid tab switching, and state cleanup. Use vitest mocking to simulate browser tab events and verify state management correctness. Include tests for concurrent event handling and state consistency.

### tests\unit\tracker\events\EventGenerator.test.ts(NEW)

References: 

- src\core\tracker\events\EventGenerator.ts(NEW)

Create unit tests for the EventGenerator class. Test event generation logic for all event types (`open_time_*`, `active_time_*`, `checkpoint`), URL processing integration, and edge cases like rapid navigation. Mock dependencies like URLProcessor and verify that generated events conform to the expected schema and business rules.

### tests\unit\tracker\queue\EventQueue.test.ts(NEW)

References: 

- src\core\tracker\queue\EventQueue.ts(NEW)

Write unit tests for the EventQueue class focusing on FIFO behavior, batch processing triggers, and database integration. Test scenarios like queue overflow, batch size thresholds, time-based flushing, and error handling during database writes. Mock the DatabaseService to verify correct batch writing behavior.

### tests\unit\tracker\scheduler\CheckpointScheduler.test.ts(NEW)

References: 

- src\core\tracker\scheduler\CheckpointScheduler.ts(NEW)

Create unit tests for the CheckpointScheduler class. Test alarm creation, periodic execution, session threshold detection, and checkpoint event generation. Mock `chrome.alarms` API and verify that checkpoints are generated correctly for long-running sessions. Test scheduler behavior across service worker restarts.

### tests\unit\tracker\recovery\StartupRecovery.test.ts(NEW)

References: 

- src\core\tracker\recovery\StartupRecovery.ts(NEW)

Write unit tests for the StartupRecovery class covering both recovery phases. Test orphan session detection, crash recovery event generation, state cleanup, and new session initialization. Mock database queries and browser tab APIs to simulate various startup scenarios including clean startup, crash recovery, and partial data corruption.

### tests\unit\tracker\url\URLProcessor.test.ts(NEW)

References: 

- src\core\tracker\url\URLProcessor.ts(NEW)
- tests\unit\db\utils\url-normalizer.util.test.ts

Create unit tests for the URLProcessor class extending the existing URL normalization tests. Test hostname filtering, additional query parameter filtering, and integration with the existing normalizer. Verify that CSPEC requirements are properly implemented and that the processor correctly identifies URLs that should be ignored.

### tests\unit\tracker\messaging\InteractionDetector.test.ts(NEW)

References: 

- src\core\tracker\messaging\InteractionDetector.ts(NEW)

Write unit tests for the InteractionDetector messaging system. Test message schema validation, threshold checking, throttling behavior, and communication with the background script. Mock the messaging APIs and verify that only valid interactions above thresholds are transmitted.

### tests\integration\tracker(NEW)

Create integration test directory for end-to-end tracker testing.

### tests\integration\tracker\time-tracking-flow.test.ts(NEW)

References: 

- tests\integration\db\database-operations.test.ts

Create comprehensive integration tests that verify the complete time tracking flow from browser events to database storage. Test scenarios like tab switching, user interactions, checkpoint generation, and startup recovery. Use the existing database test infrastructure and mock browser APIs to simulate real usage patterns.

### vitest.config.ts(MODIFY)

Update the vitest configuration to include the new tracker test directories in the test file patterns. Ensure that `tests/unit/tracker/**` and `tests/integration/tracker/**` are included in the test discovery. Add any necessary test environment setup for the tracker module testing.