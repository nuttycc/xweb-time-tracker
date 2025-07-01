/* eslint-disable @typescript-eslint/no-unused-vars */

import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';
import pkg from './package.json';

// https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  imports: false,
  modules: ['@wxt-dev/module-vue'],
  webExt: {
    disabled: true,
    chromiumProfile: resolve('.wxt/chrome-data'),
    keepProfileChanges: true,
  },
  manifest: ({ browser, manifestVersion, mode, command }) => {
    return {
      permissions: ['tabs', 'activeTab', 'scripting', 'alarms', 'storage', 'webNavigation'],
      host_permissions: ['<all_urls>'],
    };
  },
  vite: () => ({
    plugins: [tailwindcss()],
    define: {
      __APP_NAME__: JSON.stringify(pkg.name),
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
  }),

});
