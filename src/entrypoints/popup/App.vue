<script lang="ts" setup>
// import HelloWorld from '@/components/HelloWorld.vue';
import { createLogger } from '@/utils/logger';

const logger = createLogger('PopupApp');

logger.info('Popup app initialized');
logger.debug('Debug message 1');
logger.debug('Debug message 2');
logger.debug('Debug message 3');
logger.info('Info message 1');
logger.info('Info message 2');
logger.warn('Warning message');
logger.debug('Debug message 4');
logger.debug('Debug message 5');
logger.debug('Debug message 6');
logger.info('Popup app setup complete');
</script>

<template>
  <div class="animate-zoom-in h-80 w-80">Hello World</div>
</template>

<style scoped></style>
