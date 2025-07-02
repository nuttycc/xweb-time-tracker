# 核心逻辑任务计划: 第四阶段 - 后台端到端集成测试 - v1.0

状态: 🔁 inprogress

## 范围 (Scope)

**仅包含 (ONLY INCLUDE)**:

- **后台逻辑验证**: 对从事件生成、数据库写入、到数据聚合的完整后台数据流进行端到端（E2E）的逻辑验证。
- **模拟环境测试**: 使用 WXT 内置的测试工具 (`Vitest` + `@webext-core/fake-browser`) 在 Node.js 环境中模拟浏览器行为和 `chrome.*` API 调用。
- **核心场景覆盖**: 编写并执行一系列集成测试用例，覆盖典型的用户使用场景，如简单浏览、专注时间计算、标签页切换、Checkpoint机制和启动恢复等。

**明确排除 (Explicitly EXCLUDE)**:

- **用户界面 (UI/UX) 测试**: 不涉及任何 Popup、Options 页面或其他 UI 组件的渲染与交互测试。
- **真实浏览器环境测试**: 不使用 Playwright、Selenium 等工具启动真实浏览器。此项工作将保留给后续的 UI E2E 测试阶段。
- **性能测试**: 本阶段不关注性能基准，只关注逻辑的正确性。

    
## 核心策略与技术选型

在投入 UI 开发之前，必须确保后台数据处理的基石是稳定和正确的。本阶段的核心目标是在一个可控、高效的环境中，对整个后台逻辑建立起强大的信心。

### 技术选型决策

我们选择 **WXT 的内置测试方案 (Vitest + `fake-browser`)** 作为本阶段的核心工具，原因如下：

1.  **高效与快速**: 该方案在 Node.js 环境中运行，通过内存模拟 `browser.*` API，免去了启动和操作真实浏览器的巨大开销。测试执行速度极快，支持快速迭代和调试。
2.  **稳定与可靠**: 消除了真实环境中的网络延迟、UI渲染、动画等不确定因素，使得测试结果高度稳定，能精确地反映逻辑本身的问题。
3.  **完美匹配当前目标**: 我们的目标是验证后台逻辑，而非 UI 交互。`fake-browser` 提供了对 `chrome.tabs`, `chrome.windows`, `chrome.storage` 等核心 API 的高保真度模拟，完全满足我们的需求。
4.  **低成本与零配置**: WXT 项目已原生集成此测试方案，我们无需引入或配置如 Playwright 等更重的外部依赖，可以直接上手编写测试用例。

### 与其他工具的比较

-   **Playwright**: 一个强大的真实 E2E 测试框架。它将在后续的 **UI 测试阶段** 发挥关键作用，用于验证包括 UI 在内的完整用户体验。但在当前纯后台逻辑验证阶段，它过于笨重和缓慢。
-   **Vitest (Browser Mode)**: 主要用于在真实浏览器中测试需要 DOM API 的前端组件或库，不适合用于测试扩展的后台脚本和 `chrome.*` API。

---

## 任务总览 (Task Overview)

本阶段将通过编写一套全面的集成测试，模拟真实的用户行为流，并验证每一步的数据处理结果是否符合预期。

---

## 任务 (Tasks)

### 阶段1：测试环境搭建与辅助工具

- [ ] **1. 创建集成测试文件**
    - **描述**: 在 `tests/integration/` 目录下创建测试入口文件。
    - **验收标准**:
        - [ ] 创建 `tests/integration/full-flow.test.ts` 文件。
        - [ ] 设置好 `describe` 和 `beforeEach` 结构，使用 `fakeBrowser.reset()` 确保测试用例间的隔离性。

- [ ] **2. 配置模拟数据库环境**
    - **描述**: 在 `tests/setup.ts` 中配置 Dexie.js 模拟数据库，确保每个测试用例都在一个干净、隔离的数据库环境中运行。
    - **验收标准**:
        - [ ] 在 `tests/setup.ts` 中导入 `connectionManager`, `MockDatabaseFactory`, `WebTimeTrackerDB`。
        - [ ] 创建一个全局的 `mockDb` 实例。
        - [ ] 在 `beforeEach` 钩子中，重置 `mockDb` 的状态（删除并重新打开），并确保 `connectionManager` 使用 `mockDb`。
        - [ ] 在 `afterEach` 钩子中，关闭 `mockDb` 连接。

- [ ] **3. 编写测试辅助函数 (Test Helpers)**
    - **描述**: 创建一系列可复用的辅助函数，用于模拟用户行为和简化测试断言。
    - **验收标准**:
        - [ ] 实现 `simulateUserNavigation(tabId, url)`: 模拟指定标签页导航到新 URL。
        - [ ] 实现 `simulateUserInteraction(tabId)`: 模拟在指定标签页上的有效交互。
        - [ ] 实现 `simulateTabSwitch(fromTabId, toTabId)`: 模拟用户切换焦点标签页。
        - [ ] 实现 `simulateWindowFocusChange(windowId)`: 模拟窗口焦点的得失。
        - [ ] 实现 `forceAggregation()`: 手动触发一次聚合服务。
        - [ ] 实现 `getAggregatedData(key)`: 方便地从 `aggregatedstats` 表中查询验证数据。
        - [ ] 实现 `getEventsLog()`: 方便地从 `eventslog` 表中查询验证数据.

### 阶段2：核心场景测试用例实现

- [ ] **1. 场景：单次简单浏览**
    - **模拟**: 用户访问 `google.com`，停留5秒，中间无任何交互，然后关闭标签页。
    - **验证**: `eventslog` 中记录了正确的 `open_time_start` 和 `open_time_end` 事件对；聚合后 `aggregatedstats` 中 `totalopentime` 约等于5秒。

- [ ] **2. 场景：带专注时间的浏览**
    - **模拟**: 用户访问 `github.com`，期间有多次交互，然后因超时而结束活跃状态。
    - **验证**: `eventslog` 中记录了 `active_time_start/end` 事件；聚合后 `totalactivetime` 符合预期。

- [ ] **3. 场景：多标签页切换**
    - **模拟**: 用户在 `a.com` 和 `b.com` 之间来回切换焦点。
    - **验证**: 当焦点离开某个标签页时，其活动计时会话（active session）应结束，并生成一条 `active_time_end` 事件计入 Event Log DB。当焦点返回 AND 发生新的有效交互时，应开启一个全新的计时会话。聚合后的总时长应正确反映所有离散的活动时间段之和。

- [ ] **4. 场景：Checkpoint 机制**
    - **模拟**: 用户长时间停留在 `youtube.com` 观看视频。
    - **验证**: `eventslog` 中周期性地生成了 `checkpoint` 事件。独立的聚合服务（Aggregation Service）会周期性处理这些事件，从而实现在完整会话结束前，即可通过查询验证已累计的时间。

- [ ] **5. 场景：启动恢复 (Crash Recovery)**
    - **模拟**: 在数据库中手动制造一个只有 `start` 事件没有 `end` 事件的"孤儿会话"，然后模拟扩展重启。
    - **验证**: 启动恢复流程被触发，孤儿会话被正确关闭并标记 `resolution: 'crash_recovery'`；新的会话被正确开启。

### 阶段3：执行与验证

- [ ] **1. 运行测试**
    - **描述**: 执行该文档中的所有集成测试。
    - **验收标准**:
        - [ ] 所有测试用例均能成功通过。

- [ ] **2. 分析与调试**
    - **描述**: 在测试代码中添加详细的 `console.log` 输出，模拟在 background 控制台进行调试，清晰地展示数据流转过程。
    - **验收标准**: 日志输出清晰，能够有效帮助定位和解决问题。

## 预期成果 (Expected Outcome)

- 一个健壮的后台集成测试套件，为项目的核心逻辑质量提供保障。
- 对整个数据处理流程建立起高度信心，为下一阶段的 UI 开发扫清障碍。


## Code Guide

### Title: Next-gen Web Extension Framework – WXT

URL Source: https://wxt.dev/guide/essentials/unit-testing.html

Markdown Content:
Unit Testing [​](https://wxt.dev/guide/essentials/unit-testing.html#unit-testing)
---------------------------------------------------------------------------------

*   [Vitest](https://wxt.dev/guide/essentials/unit-testing.html#vitest)
    *   [Example Tests](https://wxt.dev/guide/essentials/unit-testing.html#example-tests)
    *   [Mocking WXT APIs](https://wxt.dev/guide/essentials/unit-testing.html#mocking-wxt-apis)

*   [Other Testing Frameworks](https://wxt.dev/guide/essentials/unit-testing.html#other-testing-frameworks)

Vitest [​](https://wxt.dev/guide/essentials/unit-testing.html#vitest)
---------------------------------------------------------------------

WXT provides first class support for Vitest for unit testing:

ts

```
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing';

export default defineConfig({
  plugins: [WxtVitest()],
});
```

This plugin does several things:

*   Polyfills the extension API, `browser`, with an in-memory implementation using [`@webext-core/fake-browser`](https://webext-core.aklinker1.io/fake-browser/installation)
*   Adds all vite config or plugins in `wxt.config.ts`
*   Configures auto-imports (if enabled)
*   Applies internal WXT vite plugins for things like [bundling remote code](https://wxt.dev/guide/essentials/remote-code)
*   Sets up global variables provided by WXT (`import.meta.env.BROWSER`, `import.meta.env.MANIFEST_VERSION`, `import.meta.env.IS_CHROME`, etc)
*   Configures aliases (`@/*`, `@@/*`, etc) so imports can be resolved

Here are real projects with unit testing setup. Look at the code and tests to see how they're written.

*   [`aklinker1/github-better-line-counts`](https://github.com/aklinker1/github-better-line-counts)
*   [`wxt-dev/examples`'s Vitest Example](https://github.com/wxt-dev/examples/tree/main/examples/vitest-unit-testing)

### Example Tests [​](https://wxt.dev/guide/essentials/unit-testing.html#example-tests)

This example demonstrates that you don't have to mock `browser.storage` (used by `wxt/utils/storage`) in tests - [`@webext-core/fake-browser`](https://webext-core.aklinker1.io/fake-browser/installation) implements storage in-memory so it behaves like it would in a real extension!

ts

```
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

### Mocking WXT APIs [​](https://wxt.dev/guide/essentials/unit-testing.html#mocking-wxt-apis)

First, you need to understand how the `#imports` module works. When WXT (and vitest) sees this import during a preprocessing step, the import is replaced with multiple imports pointing to their "real" import path.

For example, this is what your write in your source code:

ts

```
// What you write
import { injectScript, createShadowRootUi } from '#imports';
```

But Vitest sees this:

ts

```
import { injectScript } from 'wxt/utils/inject-script';
import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';
```

So in this case, if you wanted to mock `injectScript`, you need to pass in `"wxt/utils/inject-script"`, not `"#imports"`.

ts

```
vi.mock("wxt/utils/inject-script", () => ({
  injectScript: ...
}))
```

Refer to your project's `.wxt/types/imports-module.d.ts` file to lookup real import paths for `#imports`. If the file doesn't exist, run [`wxt prepare`](https://wxt.dev/guide/essentials/config/typescript).

Other Testing Frameworks [​](https://wxt.dev/guide/essentials/unit-testing.html#other-testing-frameworks)
---------------------------------------------------------------------------------------------------------

To use a different framework, you will likely have to disable auto-imports, setup import aliases, manually mock the extension APIs, and setup the test environment to support all of WXT's features that you use.

It is possible to do, but will require a bit more setup. Refer to Vitest's setup for an example of how to setup a test environment:

[https://github.com/wxt-dev/wxt/blob/main/packages/wxt/src/testing/wxt-vitest-plugin.ts](https://github.com/wxt-dev/wxt/blob/main/packages/wxt/src/testing/wxt-vitest-plugin.ts)

---

### fakeBrowser: Implemented APIs

URL Source: https://webext-core.aklinker1.io/fake-browser/implemented-apis

Markdown Content:
This file lists all the implemented APIs, their caveots, limitations, and example tests. Example tests are writen with vitest.

Not all APIs are implemented!

[`alarms`](https://webext-core.aklinker1.io/fake-browser/implemented-apis#alarms)
---------------------------------------------------------------------------------

*   All alarms APIs are implemented as in production, except for `onAlarm`.
*   You have to manually call `onAlarm.trigger()` for your event listeners to be executed.

[`notifications`](https://webext-core.aklinker1.io/fake-browser/implemented-apis#notifications)
-----------------------------------------------------------------------------------------------

*   `create`, `clear`, and `getAll` are fully implemented
*   You have to manually trigger all the events (`onClosed`, `onClicked`, `onButtonClicked`, `onShown`)

### [Example Tests](https://webext-core.aklinker1.io/fake-browser/implemented-apis#example-tests)

ensureNotificationExists.test.ts

```
import { describe, it, beforeEach, vi, expect } from 'vitest';
import browser, { Notifications } from 'webextension-polyfill';
import { fakeBrowser } from '@webext-core/fake-browser';

async function ensureNotificationExists(
  id: string,
  notification: Notifications.CreateNotificationOptions,
): Promise<void> {
  const notifications = await browser.notifications.getAll();
  if (!notifications[id]) await browser.notifications.create(id, notification);
}

describe('ensureNotificationExists', () => {
  const id = 'some-id';
  const notification: Notifications.CreateNotificationOptions = {
    type: 'basic',
    title: 'Some Title',
    message: 'Some message...',
  };

  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('should create a notification if it does not exist', async () => {
    const createSpy = vi.spyOn(browser.notifications, 'create');

    await ensureNotificationExists(id, notification);

    expect(createSpy).toBeCalledTimes(1);
    expect(createSpy).toBeCalledWith(id, notification);
  });

  it('should not create the notification if it already exists', async () => {
    await fakeBrowser.notifications.create(id, notification);
    const createSpy = vi.spyOn(browser.notifications, 'create');

    await ensureNotificationExists(id, notification);

    expect(createSpy).not.toBeCalled();
  });
});
```

[`runtime`](https://webext-core.aklinker1.io/fake-browser/implemented-apis#runtime)
-----------------------------------------------------------------------------------

*   All events have been implemented, but all of them other than `onMessage` must be triggered manually.
*   `rutime.id` is a hardcoded string. You can set this to whatever you want, but it is reset to the hardcoded value when calling `reset()`.
*   Unlike in a real production, `sendMessage` will trigger `onMessage` listeners setup in the same JS context. This allows you to add a listener when setting up your test, then call `sendMessage` to trigger it.

[`storage`](https://webext-core.aklinker1.io/fake-browser/implemented-apis#storage)
-----------------------------------------------------------------------------------

*   The `local`, `sync`, `session`, and `managed` storages are all stored separately in memory.
*   `storage.onChanged`, `storage.{area}.onChanged` events are all triggered when updating values.
*   Each storage area can be reset individually.

[`tabs` and `windows`](https://webext-core.aklinker1.io/fake-browser/implemented-apis#tabs-and-windows)
-------------------------------------------------------------------------------------------------------

*   Fully implemented.
*   All methods trigger corresponding `tabs` events AND `windows` events depending on what happened (ie: closing the last tab of a window would trigger both `tabs.onRemoved` and `windows.onRemoved`).

[`webNavigation`](https://webext-core.aklinker1.io/fake-browser/implemented-apis#webnavigation)
-----------------------------------------------------------------------------------------------

*   The two functions, `getFrame` and `getAllFrames` are not implemented. You will have to mock their return values yourself.
*   All the event listeners are implemented, but none are triggered automatically. They can be triggered manually by calling `browser.webNavigation.{event}.trigger(...)`

Table of Contents

*   [alarms](https://webext-core.aklinker1.io/fake-browser/implemented-apis#alarms)
*   [notifications](https://webext-core.aklinker1.io/fake-browser/implemented-apis#notifications)
    *   [Example Tests](https://webext-core.aklinker1.io/fake-browser/implemented-apis#example-tests)

*   [runtime](https://webext-core.aklinker1.io/fake-browser/implemented-apis#runtime)
*   [storage](https://webext-core.aklinker1.io/fake-browser/implemented-apis#storage)
*   [tabs and windows](https://webext-core.aklinker1.io/fake-browser/implemented-apis#tabs-and-windows)
*   [webNavigation](https://webext-core.aklinker1.io/fake-browser/implemented-apis#webnavigation)