/**
 * 后台脚本入口点
 * 负责标签页监听、时间追踪协调、数据聚合等后台任务
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
