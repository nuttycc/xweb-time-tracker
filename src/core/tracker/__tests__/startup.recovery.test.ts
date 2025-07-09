import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';
import { fakeBrowser } from 'wxt/testing';
import { v4 as uuidv4 } from 'uuid';
import { browser, type Browser } from '#imports';

import { StartupRecovery } from '../StartupRecovery';
import type { EventGenerator } from '../utils/EventGenerator';
import type { DatabaseService } from '@/core/db/services/database.service';
import type { TrackingEvent } from '@/core/tracker/types';
import type { EventsLogRecord } from '@/core/db/models/eventslog.model';
import type { TabState } from '@/core/tracker/types';

/**
 * Helper: Build a minimal TrackingEvent for test use.
 */
function buildTrackingEvent(partial: Partial<TrackingEvent>): TrackingEvent {
  return {
    timestamp: partial.timestamp ?? Date.now(),
    eventType: partial.eventType as TrackingEvent['eventType'],
    tabId: partial.tabId ?? 1,
    url: partial.url ?? 'https://example.com',
    visitId: partial.visitId ?? uuidv4(),
    activityId: partial.activityId ?? null,
    isProcessed: 0,
    ...(partial as Omit<TrackingEvent, keyof TrackingEvent>),
  } as TrackingEvent;
}

/**
 * Helper: Build a minimal EventsLogRecord for test use.
 */
function buildEventsLogRecord(partial: Partial<EventsLogRecord>): EventsLogRecord {
  return {
    id: partial.id ?? 1,
    timestamp: partial.timestamp ?? Date.now(),
    eventType: partial.eventType as EventsLogRecord['eventType'],
    tabId: partial.tabId ?? 1,
    url: partial.url ?? 'https://example.com',
    visitId: partial.visitId ?? uuidv4(),
    activityId: partial.activityId ?? null,
    isProcessed: 0,
  } as EventsLogRecord;
}

/**
 * Helper: Build a mock Tab object for test use.
 * This function creates a complete Tab object with sensible defaults,
 * allowing tests to override only the necessary properties.
 */
function buildMockTab(partial: Partial<Browser.tabs.Tab>): Browser.tabs.Tab {
  return {
    id: partial.id ?? 1,
    url: partial.url ?? 'https://example.com',
    windowId: partial.windowId ?? 1,
    audible: partial.audible ?? false,
    active: partial.active ?? true,
    autoDiscardable: partial.autoDiscardable ?? true,
    discarded: partial.discarded ?? false,
    favIconUrl: partial.favIconUrl,
    groupId: partial.groupId ?? -1,
    height: partial.height ?? 768,
    highlighted: partial.highlighted ?? true,
    incognito: partial.incognito ?? false,
    index: partial.index ?? 0,
    mutedInfo: partial.mutedInfo,
    pinned: partial.pinned ?? false,
    selected: partial.selected ?? true,
    status: partial.status ?? 'complete',
    title: partial.title,
    width: partial.width ?? 1024,
    frozen: false,
    ...partial,
  };
}

/**
 * Helper: Build a minimal TabState object.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function buildTabState(partial: Partial<TabState>): TabState {
  return {
    url: partial.url ?? 'https://example.com',
    visitId: partial.visitId ?? uuidv4(),
    activityId: partial.activityId ?? null,
    isAudible: partial.isAudible ?? false,
    lastInteractionTimestamp: partial.lastInteractionTimestamp ?? Date.now() - 1000,
    openTimeStart: partial.openTimeStart ?? Date.now() - 10_000,
    activeTimeStart: partial.activeTimeStart ?? null,
    isFocused: partial.isFocused ?? false,
    tabId: partial.tabId ?? 1,
    windowId: partial.windowId ?? 1,
    sessionEnded: partial.sessionEnded ?? false,
  } as TabState;
}

describe('StartupRecovery', () => {
  let eventGenMock: MockProxy<EventGenerator>;
  let dbServiceMock: MockProxy<DatabaseService>;

  // Runs before each test to reset mocks and environment
  beforeEach(() => {
    fakeBrowser.reset(); // Reset browser state

    // Create fresh mocks for each test
    eventGenMock = mock<EventGenerator>();
    dbServiceMock = mock<DatabaseService>();

    // Default: no orphan events in DB
    dbServiceMock.getUnprocessedEventsForRecovery.mockResolvedValue([]);

    // Mock browser.storage.local.remove (not critical for test logic)
    vi.spyOn(browser.storage.local, 'remove').mockResolvedValue();

    // Mock browser.tabs.query to return one open tab
    const fakeTab = buildMockTab({ id: 1, url: 'https://example.com' });
    vi.spyOn(browser.tabs, 'query').mockResolvedValue([fakeTab]);

    // Mock event generator to always succeed for open_time_start
    const openStartEvent = buildTrackingEvent({ eventType: 'open_time_start' });
    eventGenMock.generateOpenTimeStart.mockReturnValue({ success: true, event: openStartEvent });
  });

  // Test: Normal recovery with no orphan sessions
  it('should execute recovery with no orphan sessions', async () => {
    const recovery = new StartupRecovery(eventGenMock, dbServiceMock);

    // Run the recovery process
    const { stats, tabStates, events } = await recovery.executeRecovery();

    // Assert statistics and results
    expect(stats.orphanSessionsFound).toBe(0); // No orphans
    expect(stats.recoveryEventsGenerated).toBe(0); // No recovery events
    expect(stats.currentTabsInitialized).toBe(1); // One tab initialized

    expect(tabStates).toHaveLength(1); // One tab state returned
    expect(tabStates[0].tabId).toBe(1);

    expect(events).toHaveLength(1); // One open_time_start event generated
    expect(eventGenMock.generateOpenTimeStart).toHaveBeenCalledTimes(1);
    expect(dbServiceMock.addEvent).not.toHaveBeenCalled(); // No DB write
  });

  // Test: Recovery when there is an orphan open_time_start event
  it('should recover orphan open_time_start session and generate end event', async () => {
    const orphanVisitId = uuidv4();
    // Simulate DB returning an orphan open_time_start event
    const orphanStart = buildEventsLogRecord({
      id: 99,
      eventType: 'open_time_start',
      visitId: orphanVisitId,
      timestamp: Date.now() - 10_000,
    });

    // Return orphan event via new recovery query method
    dbServiceMock.getUnprocessedEventsForRecovery.mockResolvedValue([orphanStart]);

    // Mock event generator to succeed for open_time_end
    const openEndEvent = buildTrackingEvent({ eventType: 'open_time_end', visitId: orphanVisitId });
    eventGenMock.generateOpenTimeEnd.mockReturnValue({ success: true, event: openEndEvent });
    dbServiceMock.addEvent.mockResolvedValue(1); // Simulate DB write

    const recovery = new StartupRecovery(eventGenMock, dbServiceMock);

    // Run the recovery process
    const { stats } = await recovery.executeRecovery();

    // Assert that orphan was found and recovery event generated
    expect(stats.orphanSessionsFound).toBe(1);
    expect(stats.recoveryEventsGenerated).toBe(1);

    // Assert that end event was generated and written to DB
    expect(eventGenMock.generateOpenTimeEnd).toHaveBeenCalledTimes(1);
    expect(dbServiceMock.addEvent).toHaveBeenCalledTimes(1);
  });

  /**
   * Test: initializeCurrentState should create new sessions for all open tabs
   * (No more persistent storage - pure memory approach)
   */
  it('should create new sessions for all currently open tabs', async () => {
    // ---------------- Setup current browser tabs ----------------
    const currentTabs: Browser.tabs.Tab[] = [
      buildMockTab({ id: 1, url: 'https://example.com/page1' }),
      buildMockTab({ id: 2, url: 'https://example.com/page2' }),
    ];
    vi.spyOn(browser.tabs, 'query').mockResolvedValue(currentTabs);

    // Mock event generator for both tabs
    const openStartForTab1 = buildTrackingEvent({ eventType: 'open_time_start', tabId: 1 });
    const openStartForTab2 = buildTrackingEvent({ eventType: 'open_time_start', tabId: 2 });

    eventGenMock.generateOpenTimeStart
      .mockReturnValueOnce({ success: true, event: openStartForTab1 })
      .mockReturnValueOnce({ success: true, event: openStartForTab2 });

    const recovery = new StartupRecovery(eventGenMock, dbServiceMock);

    const { stats, tabStates, events } = await recovery.executeRecovery();

    // ---------------- Assertions ----------------
    // Stats: 2 tabs processed (all new sessions)
    expect(stats.currentTabsInitialized).toBe(2);

    // Two new open_time_start events for both tabs
    expect(events).toHaveLength(2);
    expect(events.map(e => e.tabId).sort()).toEqual([1, 2]);
    expect(eventGenMock.generateOpenTimeStart).toHaveBeenCalledTimes(2);

    // Tab states array should include new state for both tabs
    const stateIds = tabStates.map(ts => ts.tabId).sort();
    expect(stateIds).toEqual([1, 2]);

    // All tab states should be newly created (no restoration)
    expect(tabStates[0].tabState.visitId).toBeDefined();
    expect(tabStates[1].tabState.visitId).toBeDefined();
  });
});
