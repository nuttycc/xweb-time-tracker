# 任务 03: 时间追踪核心 API 参考

本文档总结了在实现 `03-core-task-time-tracking` 任务时将使用的关键库及其核心 API。

## 1. WXT (Web Extension Framework)

WXT 简化了 Web 扩展的开发，提供了对浏览器 API 的封装和便捷的开发体验。

### 1.1 核心导入 (`#imports`)

推荐使用 WXT 的虚拟模块 `#imports` 来统一导入 WXT 提供的各种 API，这有助于简化代码和 Tree-shaking。

**参考文档**: [WXT Auto-imports](https://wxt.dev/guide/essentials/config/auto-imports.html)

```typescript
import { browser, storage, defineContentScript } from '#imports';
```

### 1.2 浏览器 API (`browser` 对象)

`browser` 对象是 WXT 对 `chrome` 和 `firefox` 等浏览器扩展 API 的统一封装，提供了跨浏览器兼容的 Promise 风格 API。

**参考文档**:
- [WXT Extension APIs](https://wxt.dev/guide/essentials/extension-apis.html)
- [chrome.tabs](https://developer.chrome.com/docs/extensions/reference/api/tabs)
- [chrome.windows](https://developer.chrome.com/docs/extensions/reference/api/windows)
- [chrome.webNavigation](https://developer.chrome.com/docs/extensions/reference/api/webNavigation)
- [chrome.runtime](https://developer.chrome.com/docs/extensions/reference/api/runtime)
- [chrome.alarms](https://developer.chrome.com/docs/extensions/reference/api/alarms)

### 1.3 WXT Storage API (`storage`)

WXT 的 `storage` API 提供了对浏览器存储（`local`, `session`, `sync`, `managed`）的简化和类型安全封装。它支持版本控制、元数据和批量操作。

**参考文档**: [WXT Storage API](https://wxt.dev/storage.html)

*   `storage.defineItem<TValue, TMetadata>(key: StorageItemKey, options?: WxtStorageItemOptions<TValue>)`: 定义一个类型安全的存储项，可设置默认值和回退值。
    *   `WxtStorageItemOptions<TValue>`:
      *   `fallback?: T` - Default value returned when getValue() would return null
      *   `defaultValue?: T` - Deprecated, renamed to fallback
      *   `init?: () => T | Promise<T>` - Function to initialize value in storage if it doesn't exist
      *   `version?: number` - Version number for migrations (must be ≥ 1)
      *   `migrations?: Record<number, (oldValue: any) => any>` - Migration functions by version
      *   `debug?: boolean` - Enable debug logging for migrations
      *   `onMigrationComplete?: (migratedValue: T, targetVersion: number) => void` - Callback after migration


**示例**:

    ```typescript
    import { storage } from '#imports';
    const showChangelogOnUpdate = storage.defineItem<boolean>('local:showChangelogOnUpdate', 
        {
          fallback: [],
          version: 1,
        },
    );

    // Single Item Operations
    await storage.getItem('local:installDate');
    await storage.setItem('local:installDate', new Date().toISOString());
    await storage.removeItem('local:installDate'); 

    // Bulk Operations
    await storage.setItems([
        { key: 'local:installDate', value: Date.now() },
        { item: userId, value: generateUserId() },
    ]);
    await storage.getItems(['local:installDate', 'local:userId']);
    await storage.removeItems(['local:installDate', 'local:userId']);


    // Removes all items from the specified storage area.
    await storage.clear(); 

    // Set and get metadata for the specified key.
    await storage.setMeta('local:preference', { lastModified: Date.now() });
    await storage.getMeta('local:installDate');

    // Watches for changes to the specified key.
    const unwatch = storage.watch<number>('local:counter', (newCount, oldCount) => {
      console.log('Count changed:', { newCount, oldCount });
    });

    // Some time later...
    unwatch();
    ```


### 1.4 错误处理 

当尝试写入的数据超出 `browser.storage.local` 的配额限制时，会触发错误。我们需要在 `set` 操作的回调中检查 `browser.runtime.lastError` 来处理此错误。
browser.storage.local 和 sync 等存储，我们预计只使用很少量的数据，因此一般不会触发配额限制。
只**简单**地预防处理，避免过度工程化。


### 1.5 Unit Testing

#### Vitest

WXT provides first class support for Vitest for unit testing:

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing';

export default defineConfig({
  plugins: [WxtVitest()],
});
```

This plugin does several things:

- Polyfills the extension API, `browser`, with an in-memory implementation using [`@webext-core/fake-browser`](https://webext-core.aklinker1.io/fake-browser/installation)
- Adds all vite config or plugins in `wxt.config.ts`
- Configures auto-imports (if enabled)
- Applies internal WXT vite plugins for things like [bundling remote code](https://wxt.dev/guide/essentials/remote-code.html)
- Sets up global variables provided by WXT (`import.meta.env.BROWSER`, `import.meta.env.MANIFEST_VERSION`, `import.meta.env.IS_CHROME`, etc)
- Configures aliases (`@/*`, `@@/*`, etc) so imports can be resolved

Here are real projects with unit testing setup. Look at the code and tests to see how they're written.

- [`aklinker1/github-better-line-counts`](https://github.com/aklinker1/github-better-line-counts)
- [`wxt-dev/examples` 's Vitest Example](https://github.com/wxt-dev/examples/tree/main/examples/vitest-unit-testing)

### Example Tests

```typescript

import { describe, it, expect } from 'vitest';
import { fakeBrowser } from 'wxt/testing';

const accountStorage = storage.defineItem<Account>('local:account');

async function isLoggedIn(): Promise<Account> {
  const value = await accountStorage.getValue();
  return value != null;
}

describe('isLoggedIn', () => {
  beforeEach(() => {
    // See https://webext-core.aklinker1.io/fake-browser/reseting-state
    fakeBrowser.reset();
  });

  it('should return true when the account exists in storage', async () => {
    const account: Account = {
      username: '...',
      preferences: {
        // ...
      },
    };
    await accountStorage.setValue(account);

    expect(await isLoggedIn()).toBe(true);
  });

  it('should return false when the account does not exist in storage', async () => {
    await accountStorage.deleteValue();

    expect(await isLoggedIn()).toBe(false);
  });
});
```

This example demonstrates that you don't have to mock `browser.storage` (used by `wxt/utils/storage`) in tests - [`@webext-core/fake-browser`](https://webext-core.aklinker1.io/fake-browser/installation) implements storage in-memory so it behaves like it would in a real extension!

### Mocking WXT APIs

First, you need to understand how the `#imports` module works. When WXT (and vitest) sees this import during a preprocessing step, the import is replaced with multiple imports pointing to their "real" import path.

For example, this is what your write in your source code:

```typescript
// What you write
import { injectScript, createShadowRootUi } from '#imports';
```

But Vitest sees this:

```typescript
import { injectScript } from 'wxt/utils/inject-script';
import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';
```

So in this case, if you wanted to mock `injectScript`, you need to pass in `"wxt/utils/inject-script"`, not `"#imports"`.

Refer to your project's `.wxt/types/imports-module.d.ts` file to lookup real import paths for `#imports`. If the file doesn't exist, run [`wxt prepare`](https://wxt.dev/guide/essentials/config/typescript.html).


## 2. es-toolkit (Modern JavaScript Utility Library)

A modern JavaScript utility library that's 2-3 times faster and up to 97% smaller—a major upgrade to `lodash`.

**参考文档**: [es-toolkit 官方文档](https://es-toolkit.dev/intro.html)


## 3. Zod v4 (TypeScript-first Schema Validation)

PARAMOUNT: use zod **v4** instead of v3.

Zod 是一个强大的 TypeScript 优先的 schema 声明和验证库，用于确保数据的类型安全和有效性。

**参考文档**: [Zod 官方文档](https://zod.dev/) [Zod v4 迁移指南](https://zod.dev/v4/changelog)

### 3.1 [PARAMOUNT] 导入方式: 使用 `zod/v4` 导入 Zod v4

对于 `zod@^3.25.67` 版本，需要从 `/v4` 子路径导入 Zod v4：

```typescript
import * as z from "zod/v4";
```


## 4. @webext-core/messaging (Type-safe Messaging)

`@webext-core/messaging` 提供了一个轻量级、类型安全的封装，用于浏览器扩展不同上下文之间的消息传递。

**参考文档**: [@webext-core/messaging 官方文档](https://webext-core.aklinker1.io/messaging/api)

```typescript
  import { defineExtensionMessaging } from '@webext-core/messaging';

  interface ProtocolMap {
    getStringLength(data: string): number;
  }

  export const { sendMessage, onMessage } = defineExtensionMessaging<ProtocolMap>();
```