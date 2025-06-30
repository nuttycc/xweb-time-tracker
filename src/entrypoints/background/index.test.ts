/**
 * Background Script Unit Tests
 *
 * Comprehensive test suite covering background script functionality including
 * extension lifecycle, message handling, tab management, storage operations,
 * and error handling scenarios.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { type Browser } from 'wxt/browser';

// Mock the background script module
let mockBackgroundScript: any;

describe('Background Script', () => {
  let mockBrowser: Browser;

  beforeEach(async () => {
    // Create fresh browser mock for each test
    mockBrowser = fakeBrowser();
    global.browser = mockBrowser;
    
    // Reset all mocks
    vi.clearAllMocks();
    
    // Clear any existing listeners
    if (mockBrowser.runtime?.onInstalled) {
      mockBrowser.runtime.onInstalled.removeListener;
    }
  });

  afterEach(() => {
    // Clean up after each test
    vi.restoreAllMocks();
    delete global.browser;
  });

  describe('Extension Lifecycle Events', () => {
    it('should handle extension installation correctly', async () => {
      // Mock storage operations
      const mockStorageSet = vi.fn().mockResolvedValue(undefined);
      mockBrowser.storage = {
        local: { set: mockStorageSet, get: vi.fn(), clear: vi.fn() },
        sync: { set: vi.fn(), get: vi.fn(), clear: vi.fn() }
      } as any;

      // Import and initialize background script
      mockBackgroundScript = await import('./index');

      // Simulate extension installation
      const installDetails = { reason: 'install' as const };
      await mockBrowser.runtime.onInstalled.addListener.mock.calls[0][0](installDetails);

      // Verify initialization occurred
      expect(mockStorageSet).toHaveBeenCalledWith(
        expect.objectContaining({
          isInstalled: true,
          installDate: expect.any(Number)
        })
      );
    });

    it('should handle extension updates', async () => {
      const mockStorageGet = vi.fn().mockResolvedValue({ version: '1.0.0' });
      const mockStorageSet = vi.fn().mockResolvedValue(undefined);
      
      mockBrowser.storage = {
        local: { 
          set: mockStorageSet, 
          get: mockStorageGet, 
          clear: vi.fn() 
        },
        sync: { set: vi.fn(), get: vi.fn(), clear: vi.fn() }
      } as any;

      mockBackgroundScript = await import('./index');

      const updateDetails = { 
        reason: 'update' as const, 
        previousVersion: '1.0.0' 
      };
      
      await mockBrowser.runtime.onInstalled.addListener.mock.calls[0][0](updateDetails);

      expect(mockStorageGet).toHaveBeenCalled();
      expect(mockStorageSet).toHaveBeenCalledWith(
        expect.objectContaining({
          previousVersion: '1.0.0',
          updateDate: expect.any(Number)
        })
      );
    });

    it('should handle browser startup', async () => {
      const mockStorageGet = vi.fn().mockResolvedValue({ initialized: true });
      
      mockBrowser.storage = {
        local: { get: mockStorageGet, set: vi.fn(), clear: vi.fn() },
        sync: { set: vi.fn(), get: vi.fn(), clear: vi.fn() }
      } as any;

      mockBackgroundScript = await import('./index');

      // Simulate browser startup
      if (mockBrowser.runtime.onStartup?.addListener) {
        await mockBrowser.runtime.onStartup.addListener.mock.calls[0][0]();
      }

      expect(mockStorageGet).toHaveBeenCalled();
    });
  });

  describe('Action Button Handling', () => {
    it('should handle action button clicks on valid tabs', async () => {
      const mockSendMessage = vi.fn().mockResolvedValue({ success: true });
      mockBrowser.tabs = {
        sendMessage: mockSendMessage,
        query: vi.fn(),
        get: vi.fn()
      } as any;

      mockBackgroundScript = await import('./index');

      const mockTab = {
        id: 1,
        url: 'https://example.com',
        title: 'Test Page'
      };

      // Simulate action button click
      if (mockBrowser.action?.onClicked?.addListener) {
        await mockBrowser.action.onClicked.addListener.mock.calls[0][0](mockTab);
      }

      expect(mockSendMessage).toHaveBeenCalledWith(
        mockTab.id,
        expect.objectContaining({
          type: 'TOGGLE_TRACKER'
        })
      );
    });

    it('should ignore action clicks on invalid tabs', async () => {
      const mockSendMessage = vi.fn();
      mockBrowser.tabs = { sendMessage: mockSendMessage } as any;

      mockBackgroundScript = await import('./index');

      const invalidTabs = [
        { id: undefined, url: 'chrome://newtab' },
        { id: 1, url: 'chrome-extension://abc123' },
        { id: 2, url: 'moz-extension://def456' },
        { id: 3, url: 'about:blank' }
      ];

      for (const tab of invalidTabs) {
        if (mockBrowser.action?.onClicked?.addListener) {
          await mockBrowser.action.onClicked.addListener.mock.calls[0][0](tab);
        }
      }

      expect(mockSendMessage).not.toHaveBeenCalled();
    });
  });

  describe('Tab Management', () => {
    it('should handle tab updates correctly', async () => {
      const mockSetIcon = vi.fn().mockResolvedValue(undefined);
      const mockSetBadgeText = vi.fn().mockResolvedValue(undefined);
      
      mockBrowser.action = {
        setIcon: mockSetIcon,
        setBadgeText: mockSetBadgeText,
        disable: vi.fn(),
        enable: vi.fn()
      } as any;

      mockBackgroundScript = await import('./index');

      const tabId = 1;
      const changeInfo = { status: 'complete' };
      const tab = { 
        id: tabId, 
        url: 'https://example.com',
        title: 'Example Site' 
      };

      // Simulate tab update
      if (mockBrowser.tabs?.onUpdated?.addListener) {
        await mockBrowser.tabs.onUpdated.addListener.mock.calls[0][0](
          tabId, 
          changeInfo, 
          tab
        );
      }

      expect(mockSetIcon).toHaveBeenCalledWith({
        tabId,
        path: expect.any(Object)
      });
    });

    it('should handle tab activation', async () => {
      const mockTabsGet = vi.fn().mockResolvedValue({
        id: 1,
        url: 'https://example.com'
      });
      
      mockBrowser.tabs = { get: mockTabsGet } as any;

      mockBackgroundScript = await import('./index');

      const activeInfo = { tabId: 1, windowId: 1 };

      // Simulate tab activation
      if (mockBrowser.tabs?.onActivated?.addListener) {
        await mockBrowser.tabs.onActivated.addListener.mock.calls[0][0](activeInfo);
      }

      expect(mockTabsGet).toHaveBeenCalledWith(activeInfo.tabId);
    });

    it('should disable action for restricted URLs', async () => {
      const mockDisable = vi.fn().mockResolvedValue(undefined);
      mockBrowser.action = { disable: mockDisable } as any;

      mockBackgroundScript = await import('./index');

      const restrictedUrls = [
        'chrome://settings',
        'chrome://extensions',
        'moz-extension://internal',
        'about:config'
      ];

      for (const url of restrictedUrls) {
        const tabId = Math.floor(Math.random() * 1000);
        const tab = { id: tabId, url };

        if (mockBrowser.tabs?.onUpdated?.addListener) {
          await mockBrowser.tabs.onUpdated.addListener.mock.calls[0][0](
            tabId,
            { status: 'complete' },
            tab
          );
        }
      }

      expect(mockDisable).toHaveBeenCalledTimes(restrictedUrls.length);
    });
  });

  describe('Message Handling', () => {
    it('should handle runtime messages correctly', async () => {
      const mockStorageGet = vi.fn().mockResolvedValue({ trackingEnabled: true });
      mockBrowser.storage = {
        local: { get: mockStorageGet, set: vi.fn() },
        sync: { get: vi.fn(), set: vi.fn() }
      } as any;

      mockBackgroundScript = await import('./index');

      const message = { type: 'GET_TRACKING_STATUS' };
      const sender = { tab: { id: 1 } };
      const sendResponse = vi.fn();

      // Simulate runtime message
      if (mockBrowser.runtime?.onMessage?.addListener) {
        await mockBrowser.runtime.onMessage.addListener.mock.calls[0][0](
          message,
          sender,
          sendResponse
        );
      }

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          trackingEnabled: true
        })
      );
    });

    it('should handle unknown message types gracefully', async () => {
      mockBackgroundScript = await import('./index');

      const message = { type: 'UNKNOWN_MESSAGE_TYPE' };
      const sender = { tab: { id: 1 } };
      const sendResponse = vi.fn();

      if (mockBrowser.runtime?.onMessage?.addListener) {
        await mockBrowser.runtime.onMessage.addListener.mock.calls[0][0](
          message,
          sender,
          sendResponse
        );
      }

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Unknown message type')
        })
      );
    });

    it('should handle external messages', async () => {
      mockBackgroundScript = await import('./index');

      const message = { type: 'EXTERNAL_REQUEST', data: 'test' };
      const sender = { id: 'external-extension-id' };
      const sendResponse = vi.fn();

      // Simulate external message
      if (mockBrowser.runtime?.onMessageExternal?.addListener) {
        await mockBrowser.runtime.onMessageExternal.addListener.mock.calls[0][0](
          message,
          sender,
          sendResponse
        );
      }

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          received: true
        })
      );
    });
  });

  describe('Storage Operations', () => {
    it('should handle storage changes', async () => {
      const mockSetBadgeText = vi.fn().mockResolvedValue(undefined);
      mockBrowser.action = { setBadgeText: mockSetBadgeText } as any;

      mockBackgroundScript = await import('./index');

      const changes = {
        trackingEnabled: {
          oldValue: false,
          newValue: true
        }
      };
      const areaName = 'local';

      // Simulate storage change
      if (mockBrowser.storage?.onChanged?.addListener) {
        await mockBrowser.storage.onChanged.addListener.mock.calls[0][0](
          changes,
          areaName
        );
      }

      expect(mockSetBadgeText).toHaveBeenCalled();
    });

    it('should handle storage errors gracefully', async () => {
      const mockStorageGet = vi.fn().mockRejectedValue(new Error('Storage unavailable'));
      const mockStorageSet = vi.fn().mockResolvedValue(undefined);
      
      mockBrowser.storage = {
        local: { get: mockStorageGet, set: mockStorageSet },
        sync: { get: vi.fn(), set: vi.fn() }
      } as any;

      // Mock console.error to verify error logging
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      mockBackgroundScript = await import('./index');

      // Simulate installation which triggers storage access
      const installDetails = { reason: 'install' as const };
      if (mockBrowser.runtime?.onInstalled?.addListener) {
        await mockBrowser.runtime.onInstalled.addListener.mock.calls[0][0](installDetails);
      }

      // Verify error was handled
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Storage error'),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Badge and Icon Management', () => {
    it('should update badge text correctly', async () => {
      const mockSetBadgeText = vi.fn().mockResolvedValue(undefined);
      const mockSetBadgeBackgroundColor = vi.fn().mockResolvedValue(undefined);
      
      mockBrowser.action = {
        setBadgeText: mockSetBadgeText,
        setBadgeBackgroundColor: mockSetBadgeBackgroundColor
      } as any;

      mockBackgroundScript = await import('./index');

      const message = { 
        type: 'UPDATE_BADGE', 
        count: 5,
        tabId: 1 
      };
      const sender = { tab: { id: 1 } };
      const sendResponse = vi.fn();

      if (mockBrowser.runtime?.onMessage?.addListener) {
        await mockBrowser.runtime.onMessage.addListener.mock.calls[0][0](
          message,
          sender,
          sendResponse
        );
      }

      expect(mockSetBadgeText).toHaveBeenCalledWith({
        tabId: 1,
        text: '5'
      });
    });

    it('should clear badge when count is zero', async () => {
      const mockSetBadgeText = vi.fn().mockResolvedValue(undefined);
      mockBrowser.action = { setBadgeText: mockSetBadgeText } as any;

      mockBackgroundScript = await import('./index');

      const message = { 
        type: 'UPDATE_BADGE', 
        count: 0,
        tabId: 1 
      };
      const sender = { tab: { id: 1 } };
      const sendResponse = vi.fn();

      if (mockBrowser.runtime?.onMessage?.addListener) {
        await mockBrowser.runtime.onMessage.addListener.mock.calls[0][0](
          message,
          sender,
          sendResponse
        );
      }

      expect(mockSetBadgeText).toHaveBeenCalledWith({
        tabId: 1,
        text: ''
      });
    });

    it('should update icon based on tracking state', async () => {
      const mockSetIcon = vi.fn().mockResolvedValue(undefined);
      mockBrowser.action = { setIcon: mockSetIcon } as any;

      mockBackgroundScript = await import('./index');

      const message = { 
        type: 'UPDATE_ICON', 
        state: 'active',
        tabId: 1 
      };
      const sender = { tab: { id: 1 } };
      const sendResponse = vi.fn();

      if (mockBrowser.runtime?.onMessage?.addListener) {
        await mockBrowser.runtime.onMessage.addListener.mock.calls[0][0](
          message,
          sender,
          sendResponse
        );
      }

      expect(mockSetIcon).toHaveBeenCalledWith({
        tabId: 1,
        path: expect.objectContaining({
          '16': expect.stringContaining('active'),
          '32': expect.stringContaining('active'),
          '48': expect.stringContaining('active'),
          '128': expect.stringContaining('active')
        })
      });
    });
  });

  describe('Context Menu Management', () => {
    it('should create context menus on installation', async () => {
      const mockContextMenusCreate = vi.fn().mockResolvedValue('menu-id');
      mockBrowser.contextMenus = {
        create: mockContextMenusCreate,
        onClicked: { addListener: vi.fn() }
      } as any;

      mockBackgroundScript = await import('./index');

      const installDetails = { reason: 'install' as const };
      if (mockBrowser.runtime?.onInstalled?.addListener) {
        await mockBrowser.runtime.onInstalled.addListener.mock.calls[0][0](installDetails);
      }

      expect(mockContextMenusCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          id: expect.any(String),
          title: expect.any(String),
          contexts: expect.arrayContaining(['page', 'selection'])
        })
      );
    });

    it('should handle context menu clicks', async () => {
      const mockSendMessage = vi.fn().mockResolvedValue({ success: true });
      mockBrowser.tabs = { sendMessage: mockSendMessage } as any;
      mockBrowser.contextMenus = {
        create: vi.fn(),
        onClicked: { addListener: vi.fn() }
      } as any;

      mockBackgroundScript = await import('./index');

      const info = {
        menuItemId: 'start-tracking',
        pageUrl: 'https://example.com',
        selectionText: 'selected text'
      };
      const tab = { id: 1, url: 'https://example.com' };

      if (mockBrowser.contextMenus?.onClicked?.addListener) {
        await mockBrowser.contextMenus.onClicked.addListener.mock.calls[0][0](info, tab);
      }

      expect(mockSendMessage).toHaveBeenCalledWith(
        tab.id,
        expect.objectContaining({
          type: 'CONTEXT_MENU_ACTION',
          menuItemId: 'start-tracking'
        })
      );
    });
  });

  describe('Alarm Management', () => {
    it('should create periodic alarms', async () => {
      const mockAlarmsCreate = vi.fn().mockResolvedValue(undefined);
      mockBrowser.alarms = {
        create: mockAlarmsCreate,
        clear: vi.fn(),
        onAlarm: { addListener: vi.fn() }
      } as any;

      mockBackgroundScript = await import('./index');

      const installDetails = { reason: 'install' as const };
      if (mockBrowser.runtime?.onInstalled?.addListener) {
        await mockBrowser.runtime.onInstalled.addListener.mock.calls[0][0](installDetails);
      }

      expect(mockAlarmsCreate).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          delayInMinutes: expect.any(Number),
          periodInMinutes: expect.any(Number)
        })
      );
    });

    it('should handle alarm triggers', async () => {
      const mockStorageGet = vi.fn().mockResolvedValue({ lastSync: Date.now() - 3600000 });
      mockBrowser.storage = {
        local: { get: mockStorageGet, set: vi.fn() },
        sync: { get: vi.fn(), set: vi.fn() }
      } as any;
      mockBrowser.alarms = {
        create: vi.fn(),
        onAlarm: { addListener: vi.fn() }
      } as any;

      mockBackgroundScript = await import('./index');

      const alarm = { name: 'periodic-sync' };

      if (mockBrowser.alarms?.onAlarm?.addListener) {
        await mockBrowser.alarms.onAlarm.addListener.mock.calls[0][0](alarm);
      }

      expect(mockStorageGet).toHaveBeenCalled();
    });
  });

  describe('Permission Management', () => {
    it('should handle permission requests', async () => {
      const mockPermissionsRequest = vi.fn().mockResolvedValue(true);
      mockBrowser.permissions = {
        request: mockPermissionsRequest,
        remove: vi.fn(),
        contains: vi.fn()
      } as any;

      mockBackgroundScript = await import('./index');

      const message = {
        type: 'REQUEST_PERMISSION',
        permissions: { origins: ['https://example.com/*'] }
      };
      const sender = { tab: { id: 1 } };
      const sendResponse = vi.fn();

      if (mockBrowser.runtime?.onMessage?.addListener) {
        await mockBrowser.runtime.onMessage.addListener.mock.calls[0][0](
          message,
          sender,
          sendResponse
        );
      }

      expect(mockPermissionsRequest).toHaveBeenCalledWith({
        origins: ['https://example.com/*']
      });
      expect(sendResponse).toHaveBeenCalledWith({ granted: true });
    });

    it('should handle permission removal', async () => {
      const mockPermissionsRemove = vi.fn().mockResolvedValue(true);
      mockBrowser.permissions = {
        request: vi.fn(),
        remove: mockPermissionsRemove,
        contains: vi.fn()
      } as any;

      mockBackgroundScript = await import('./index');

      const message = {
        type: 'REMOVE_PERMISSION',
        permissions: { origins: ['https://example.com/*'] }
      };
      const sender = { tab: { id: 1 } };
      const sendResponse = vi.fn();

      if (mockBrowser.runtime?.onMessage?.addListener) {
        await mockBrowser.runtime.onMessage.addListener.mock.calls[0][0](
          message,
          sender,
          sendResponse
        );
      }

      expect(mockPermissionsRemove).toHaveBeenCalledWith({
        origins: ['https://example.com/*']
      });
      expect(sendResponse).toHaveBeenCalledWith({ removed: true });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle undefined tab information gracefully', async () => {
      const mockSendMessage = vi.fn();
      mockBrowser.tabs = { sendMessage: mockSendMessage } as any;

      mockBackgroundScript = await import('./index');

      // Simulate action click with undefined tab
      if (mockBrowser.action?.onClicked?.addListener) {
        await mockBrowser.action.onClicked.addListener.mock.calls[0][0](undefined);
      }

      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it('should handle API errors gracefully', async () => {
      const mockTabsQuery = vi.fn().mockRejectedValue(new Error('Tabs API error'));
      mockBrowser.tabs = { query: mockTabsQuery } as any;

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      mockBackgroundScript = await import('./index');

      const message = { type: 'GET_ALL_TABS' };
      const sender = { tab: { id: 1 } };
      const sendResponse = vi.fn();

      if (mockBrowser.runtime?.onMessage?.addListener) {
        await mockBrowser.runtime.onMessage.addListener.mock.calls[0][0](
          message,
          sender,
          sendResponse
        );
      }

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('error'),
        expect.any(Error)
      );
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.any(String)
        })
      );

      consoleSpy.mockRestore();
    });

    it('should handle rapid successive events', async () => {
      const mockSetIcon = vi.fn().mockResolvedValue(undefined);
      mockBrowser.action = { setIcon: mockSetIcon } as any;

      mockBackgroundScript = await import('./index');

      // Simulate rapid tab updates
      const tabId = 1;
      const tab = { id: tabId, url: 'https://example.com' };

      for (let i = 0; i < 5; i++) {
        if (mockBrowser.tabs?.onUpdated?.addListener) {
          await mockBrowser.tabs.onUpdated.addListener.mock.calls[0][0](
            tabId,
            { status: 'loading' },
            tab
          );
          await mockBrowser.tabs.onUpdated.addListener.mock.calls[0][0](
            tabId,
            { status: 'complete' },
            tab
          );
        }
      }

      // Verify all events were handled
      expect(mockSetIcon).toHaveBeenCalledTimes(10);
    });

    it('should handle malformed messages', async () => {
      mockBackgroundScript = await import('./index');

      const malformedMessages = [
        null,
        undefined,
        {},
        { type: null },
        { type: '' },
        'not-an-object'
      ];

      for (const message of malformedMessages) {
        const sendResponse = vi.fn();
        
        if (mockBrowser.runtime?.onMessage?.addListener) {
          await mockBrowser.runtime.onMessage.addListener.mock.calls[0][0](
            message,
            { tab: { id: 1 } },
            sendResponse
          );
        }

        expect(sendResponse).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.any(String)
          })
        );
      }
    });

    it('should handle concurrent operations correctly', async () => {
      const mockStorageSet = vi.fn().mockResolvedValue(undefined);
      const mockStorageGet = vi.fn().mockResolvedValue({ counter: 0 });
      
      mockBrowser.storage = {
        local: { set: mockStorageSet, get: mockStorageGet },
        sync: { get: vi.fn(), set: vi.fn() }
      } as any;

      mockBackgroundScript = await import('./index');

      // Simulate concurrent storage operations
      const promises = [];
      for (let i = 0; i < 10; i++) {
        const message = { 
          type: 'INCREMENT_COUNTER',
          value: i 
        };
        const sender = { tab: { id: 1 } };
        const sendResponse = vi.fn();

        if (mockBrowser.runtime?.onMessage?.addListener) {
          promises.push(
            mockBrowser.runtime.onMessage.addListener.mock.calls[0][0](
              message,
              sender,
              sendResponse
            )
          );
        }
      }

      await Promise.all(promises);

      // Verify all operations completed
      expect(mockStorageGet).toHaveBeenCalledTimes(10);
      expect(mockStorageSet).toHaveBeenCalledTimes(10);
    });
  });

  describe('Performance and Resource Management', () => {
    it('should debounce frequent tab updates', async () => {
      const mockSetIcon = vi.fn().mockResolvedValue(undefined);
      mockBrowser.action = { setIcon: mockSetIcon } as any;

      mockBackgroundScript = await import('./index');

      const tabId = 1;
      const tab = { id: tabId, url: 'https://example.com' };

      // Simulate rapid tab updates in quick succession
      for (let i = 0; i < 20; i++) {
        if (mockBrowser.tabs?.onUpdated?.addListener) {
          mockBrowser.tabs.onUpdated.addListener.mock.calls[0][0](
            tabId,
            { status: 'loading' },
            tab
          );
        }
      }

      // Wait for debouncing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify debouncing limited the number of calls
      expect(mockSetIcon.mock.calls.length).toBeLessThan(20);
    });

    it('should clean up resources on extension suspend', async () => {
      const mockAlarmsGetAll = vi.fn().mockResolvedValue([
        { name: 'test-alarm' }
      ]);
      const mockAlarmsClear = vi.fn().mockResolvedValue(true);
      
      mockBrowser.alarms = {
        create: vi.fn(),
        getAll: mockAlarmsGetAll,
        clear: mockAlarmsClear,
        onAlarm: { addListener: vi.fn() }
      } as any;

      mockBackgroundScript = await import('./index');

      // Simulate extension suspend event
      if (mockBrowser.runtime?.onSuspend?.addListener) {
        await mockBrowser.runtime.onSuspend.addListener.mock.calls[0][0]();
      }

      expect(mockAlarmsGetAll).toHaveBeenCalled();
      expect(mockAlarmsClear).toHaveBeenCalledWith('test-alarm');
    });
  });
});