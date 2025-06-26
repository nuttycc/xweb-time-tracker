/**
 * background script entry point
 * responsible for tab listening, time tracking coordination, and data aggregation
 */

import { browser, defineBackground } from '#imports';

export default defineBackground(() => {
  // Executed when background is loaded

  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    console.log('tabUpdated', tabId, changeInfo, tab, tab.audible);
  });

  browser.tabs.onActivated.addListener(activeInfo => {
    console.log('tabActivated', activeInfo);
  });

  browser.tabs.onRemoved.addListener((tabId, removeInfo) => {
    console.log('tabRemoved', tabId, removeInfo);
  });

  browser.windows.onFocusChanged.addListener(windowId => {
    console.log('windowFocusChanged', windowId);
  });
});
