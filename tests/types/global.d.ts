/**
 * 测试环境全局类型声明
 * 扩展全局对象类型，支持测试环境中的模拟对象
 */

/* eslint-disable no-var, @typescript-eslint/no-explicit-any */
import type { MockedFunction } from 'vitest';

// Chrome 扩展 API 基础类型定义
declare namespace chrome {
  namespace tabs {
    interface Tab {
      id?: number;
      url?: string;
      title?: string;
      active?: boolean;
      windowId?: number;
    }

    interface QueryInfo {
      active?: boolean;
      currentWindow?: boolean;
      url?: string;
    }

    interface TabActiveInfo {
      tabId: number;
      windowId: number;
    }

    interface TabChangeInfo {
      status?: string;
      url?: string;
      title?: string;
    }
  }

  namespace runtime {
    interface MessageSender {
      tab?: chrome.tabs.Tab;
      id?: string;
      url?: string;
    }
  }

  namespace events {
    interface Event<T extends (...args: any[]) => any> {
      addListener(callback: T): void;
      removeListener(callback: T): void;
    }
  }
}

declare global {
  /**
   * 扩展全局命名空间，添加测试环境需要的类型
   */
  namespace globalThis {
    /**
     * Chrome 扩展 API 模拟对象
     */
    var chrome: {
      storage: {
        sync: {
          get: MockedFunction<
            (keys?: string | string[] | Record<string, any>) => Promise<Record<string, any>>
          >;
          set: MockedFunction<(items: Record<string, any>) => Promise<void>>;
          remove: MockedFunction<(keys: string | string[]) => Promise<void>>;
          clear: MockedFunction<() => Promise<void>>;
        };
        local: {
          get: MockedFunction<
            (keys?: string | string[] | Record<string, any>) => Promise<Record<string, any>>
          >;
          set: MockedFunction<(items: Record<string, any>) => Promise<void>>;
          remove: MockedFunction<(keys: string | string[]) => Promise<void>>;
          clear: MockedFunction<() => Promise<void>>;
        };
      };
      tabs: {
        query: MockedFunction<(queryInfo: chrome.tabs.QueryInfo) => Promise<chrome.tabs.Tab[]>>;
        get: MockedFunction<(tabId: number) => Promise<chrome.tabs.Tab>>;
        onActivated: {
          addListener: MockedFunction<
            (callback: (activeInfo: chrome.tabs.TabActiveInfo) => void) => void
          >;
          removeListener: MockedFunction<
            (callback: (activeInfo: chrome.tabs.TabActiveInfo) => void) => void
          >;
        };
        onUpdated: {
          addListener: MockedFunction<
            (
              callback: (
                tabId: number,
                changeInfo: chrome.tabs.TabChangeInfo,
                tab: chrome.tabs.Tab
              ) => void
            ) => void
          >;
          removeListener: MockedFunction<
            (
              callback: (
                tabId: number,
                changeInfo: chrome.tabs.TabChangeInfo,
                tab: chrome.tabs.Tab
              ) => void
            ) => void
          >;
        };
      };
      runtime: {
        onMessage: {
          addListener: MockedFunction<
            (
              callback: (
                message: any,
                sender: chrome.runtime.MessageSender,
                sendResponse: (response?: any) => void
              ) => void
            ) => void
          >;
          removeListener: MockedFunction<
            (
              callback: (
                message: any,
                sender: chrome.runtime.MessageSender,
                sendResponse: (response?: any) => void
              ) => void
            ) => void
          >;
        };
        sendMessage: MockedFunction<(message: any) => Promise<any>>;
      };
    };
  }

  /**
   * Chrome 扩展 API 类型定义
   * 提供更精确的类型定义，避免使用 any
   */
  interface ChromeStorageAPI {
    get(keys?: string | string[] | Record<string, any>): Promise<Record<string, any>>;
    set(items: Record<string, any>): Promise<void>;
    remove(keys: string | string[]): Promise<void>;
    clear(): Promise<void>;
  }

  interface ChromeTabsAPI {
    query(queryInfo: chrome.tabs.QueryInfo): Promise<chrome.tabs.Tab[]>;
    get(tabId: number): Promise<chrome.tabs.Tab>;
    onActivated: chrome.events.Event<(activeInfo: chrome.tabs.TabActiveInfo) => void>;
    onUpdated: chrome.events.Event<
      (tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => void
    >;
  }

  interface ChromeRuntimeAPI {
    onMessage: chrome.events.Event<
      (
        message: any,
        sender: chrome.runtime.MessageSender,
        sendResponse: (response?: any) => void
      ) => void
    >;
    sendMessage(message: any): Promise<any>;
  }

  /**
   * 测试环境的 Chrome API 模拟类型
   */
  interface MockChromeAPI {
    storage: {
      sync: ChromeStorageAPI;
      local: ChromeStorageAPI;
    };
    tabs: ChromeTabsAPI;
    runtime: ChromeRuntimeAPI;
  }
}
