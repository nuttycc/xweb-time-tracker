import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';

// See https://wxt.dev/api/config.html
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
      permissions: ['tabs', 'activeTab', 'scripting'],
      host_permissions: ['<all_urls>'],
    };
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
