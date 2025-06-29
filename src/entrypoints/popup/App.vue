<script lang="ts" setup>
// import HelloWorld from '@/components/HelloWorld.vue';
import { createLogger } from '@/utils/logger';

const logger = createLogger('PopupApp');

logger.info('Popup app initialized');
</script>

<template>
  <div class="animate-zoom-in h-80 w-80">Hello World</div>
</template>

<style scoped></style>
