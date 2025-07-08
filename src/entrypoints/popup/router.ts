import { createRouter, createWebHashHistory } from 'vue-router';
import type { RouteRecordRaw } from 'vue-router';

// Import view components
import FocusView from './views/FocusView.vue';
import TimelineView from './views/TimelineView.vue';
import DevInspectorView from './views/DevInspectorView.vue';

/**
 * Route definitions for the popup application
 */
const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: '/focus',
  },
  {
    path: '/focus',
    name: 'FocusView',
    component: FocusView,
    meta: {
      title: '当前域洞察',
      icon: '🎯',
      description: '查看当前网站的活动数据',
    },
  },
  {
    path: '/timeline',
    name: 'TimelineView',
    component: TimelineView,
    meta: {
      title: '历史活动总览',
      icon: '📊',
      description: '浏览所有记录的活动历史',
    },
  },
  {
    path: '/dev',
    name: 'DevInspectorView',
    component: DevInspectorView,
    meta: {
      title: '开发者视图',
      icon: '🔧',
      description: '查看原始事件日志数据',
    },
  },
];

/**
 * Create router instance
 * Using hash history for browser extension compatibility
 */
const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

export default router;
