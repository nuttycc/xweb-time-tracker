<script lang="ts" setup>
import { useRouter, useRoute } from 'vue-router';
import { createLogger } from '@/utils/logger';

const logger = createLogger('PopupApp');
const router = useRouter();
const route = useRoute();

/**
 * Navigation items for the header
 */
const navigationItems = [
  {
    path: '/focus',
    name: 'FocusView',
    title: '当前域洞察',
    icon: '🎯',
  },
  {
    path: '/timeline',
    name: 'TimelineView',
    title: '历史活动总览',
    icon: '📊',
  },
  {
    path: '/dev',
    name: 'DevInspectorView',
    title: '开发者视图',
    icon: '🔧',
  },
];

/**
 * Navigate to a specific route
 */
function navigateTo(path: string): void {
  if (route.path !== path) {
    router.push(path);
    logger.info('Navigated to', { path });
  }
}
</script>

<template>
  <div class="animate-zoom-in flex h-[600px] w-96 flex-col overflow-hidden bg-white">
    <!-- Header with Navigation -->
    <div class="flex-shrink-0 bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg">
      <!-- App Title -->
      <div class="flex items-center justify-center border-b border-blue-500/30 p-3">
        <div class="flex items-center space-x-2">
          <div class="flex h-6 w-6 items-center justify-center rounded-full bg-white/20">
            <span class="text-sm">⏱️</span>
          </div>
          <h1 class="text-base font-semibold">WebTime Tracker</h1>
        </div>
      </div>

      <!-- Navigation Tabs -->
      <div class="flex border-t border-blue-500/20">
        <button
          v-for="item in navigationItems"
          :key="item.path"
          @click="navigateTo(item.path)"
          :class="[
            'flex flex-1 items-center justify-center space-x-1 px-2 py-2 text-xs font-medium transition-all',
            route.path === item.path
              ? 'border-b-2 border-white bg-white/20 text-white shadow-sm'
              : 'border-b-2 border-transparent text-blue-100 hover:bg-white/10 hover:text-white',
          ]"
          :title="item.title"
        >
          <span class="text-sm">{{ item.icon }}</span>
          <span class="hidden text-xs sm:inline">{{
            item.title.split('').slice(0, 2).join('')
          }}</span>
        </button>
      </div>
    </div>

    <!-- Main Content Area -->
    <div class="flex-1 overflow-hidden">
      <router-view />
    </div>
  </div>
</template>
