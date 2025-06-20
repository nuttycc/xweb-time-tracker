/**
 * 内容脚本入口点
 * 在网页中注入，负责用户活动检测、URL变化监听、页面时间统计
 */

import { defineContentScript } from '#imports';

export default defineContentScript({
  matches: ['*://*.google.com/*'],
  main() {
    console.log('Hello content.');
  },
});
