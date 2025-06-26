# 核心逻辑任务计划: 时间追踪事件生成 - v2.0

状态: 📝 计划中

## 范围 (Scope)

**仅包含 (ONLY INCLUDE)**:

- **事件生成核心逻辑**: 基于用户活动（标签页/窗口焦点、URL变化、用户交互）生成 `open_time_*`, `active_time_*`, `checkpoint` 等领域事件。
- **活动状态管理**: 遵循“单一焦点”原则，精确追踪当前激活的标签页和窗口，管理用户“专注”状态。
- **URL处理与过滤**: 实现URL规范化、查询参数过滤和忽略主机名等规则。
- **长期会话保障**: 通过`checkpoint`机制确保长时间任务的数据能够被周期性保存。
- **可靠性机制**: 实现事件队列、批量写入和启动时恢复等机制，确保数据不丢失。

**明确排除 (Explicitly EXCLUDE)**:

- **数据库实现**: 假设数据库模块 (`01-core-task-db.md`) 已提供稳定的事件写入接口。
- **数据聚合与清理**: 不包含对已生成事件的任何处理、聚合或删除逻辑。
- **用户界面 (UI/UX)**: 不涉及任何用户界面组件的开发。

## 参考 (Reference)

- `docs/specs/base/1-PRD.md`
- `docs/specs/base/2-SRS.md`
- `docs/specs/base/3-HLD.md`
- `docs/specs/base/4-LLD.md`
- `docs/specs/base/5-CSPEC.md`

## 关键技术栈 (Key Tech Stack)

- WXT: Next-gen Web Extension Framework
  - GitHub: https://github.com/wxt-dev/wxt
  - Docs: https://wxt.dev/guide/essentials/extension-apis.html
  - Important MCP tools: deepwiki(ask_question), contxt7(resolve-library-id,get-library-docs)
- es-toolkit: A modern JavaScript utility library that's 2-3 times faster and up to 97% smaller—a major upgrade to lodash.
  - GitHub: https://github.com/toss/es-toolkit
  - Docs: https://es-toolkit.dev/usage.html
- @webext-core/messaging: A light-weight, type-safe wrapper around the browser.runtime messaging APIs. Supports all browsers (Chrome, Firefox, Safari).
  - GitHub: https://github.com/aklinker1/webext-core
  - Docs: https://webext-core.aklinker1.io/messaging/api
- **zod v4**: A TypeScript-first schema validation library.
  - GitHub: https://github.com/colinhacks/zod
  - Docs: https://zod.dev/

### Important patterns

1. 使用 WXT 的包裹 browser API

```ts
import { browser } from 'wxt/browser';

browser.action.onClicked.addListener(() => {});
```

2. 使用 WXT 的包裹 storage API

Docs: https://wxt.dev/storage.html

```ts
import { storage } from '#imports';

storage.set('key', 'value');

// utils/storage.ts
const showChangelogOnUpdate = storage.defineItem<boolean>('local:showChangelogOnUpdate', {
  fallback: true,
});
```

## 任务总览 (Task Overview)

时间追踪引擎是整个系统的数据源头，负责将用户的浏览器行为转化为结构化的领域事件流。它的准确性和可靠性直接决定了最终统计数据的质量。本计划将严格按照LLD中定义的`Time Tracking Engine`和`启动恢复流程`进行任务分解。

---

## 任务 (Tasks)

### 阶段1：浏览器事件监听与核心状态管理

此阶段的目标是建立一个能够精确反映用户“单一焦点”的实时状态机。

- [ ] **1. 建立浏览器事件监听器**

  - **描述**: 监听所有必要的浏览器API，以捕获与用户焦点和导航相关的行为。
  - **关联需求**: `SRS-SYS-FR-1.1`, `SRS-SYS-FR-1.5`, `DEP-1`
  - **验收标准**:
    - [ ] 监听 `chrome.tabs.onActivated`, `onUpdated`, `onRemoved` 以追踪标签页生命周期。
    - [ ] 监听 `chrome.windows.onFocusChanged` 以识别用户在不同窗口间的切换。
    - [ ] 监听 `chrome.webNavigation.onCommitted` 以捕获SPA（单页应用）中的客户端路由变化。
    - [ ] 监听内容脚本发送的用户交互事件（如`scroll`, `mousemove`, `mousedown`, `keydown`）。

- [ ] **2. 实现核心状态管理器**
  - **描述**: 创建一个内存中的状态管理器，用于实时追踪每个标签页的计时状态。
  - **关联需求**: `HLD-4.1`, `LLD-4.1`
  - **验收标准**:
    - [ ] 维护一个以 `tabId` 为键的Map，存储每个标签页的状态对象，包含 `url`, `visitId`, `activityId`, `isAudible`, `lastInteractionTimestamp` 等。
    - [ ] 实现 `isFocusTab(tabId)` 方法，严格遵循LLD中定义的“单一焦点”检查逻辑。
    - [ ] 能够根据浏览器事件，准确更新状态管理器中的数据。

### 阶段2：核心事件生成逻辑

此阶段专注于将原始的用户行为，根据业务规则，转化为具体的领域事件。

- [ ] **1. 实现URL处理与过滤**

  - **描述**: 在事件生成前，对URL进行规范化和过滤，确保数据统计口径一致。
  - **关联需求**: `SRS-SYS-FR-1.3`, `SRS-SYS-FR-1.4`, `CSPEC-4.2`
  - **验收标准**:
    - [ ] 集成URL处理工具，能够移除`CSPEC`中定义的`IGNORED_QUERY_PARAMS_DEFAULT`。
    - [ ] 能够过滤掉`CSPEC`中定义的`IGNORED_HOSTNAMES_DEFAULT`。
    - [ ] 能够正确处理`www`前缀和基于PSL的主域名提取。

- [ ] **2. 实现 `Open Time` 事件生成**

  - **描述**: 根据标签页的生命周期，生成`open_time_start`和`open_time_end`事件。
  - **关联需求**: `LLD-3.2`
  - **验收标准**:
    - [ ] 当用户导航到一个新的、合法的URL时，生成唯一的`visitId`并创建`open_time_start`事件。
    - [ ] 当标签页关闭或导航到其他URL时，使用对应的`visitId`创建`open_time_end`事件。

- [ ] **3. 实现 `Active Time` 事件与情景感知超时**
  - **描述**: 实现“专注”时长的计算，并能智能区分不同场景下的非活跃状态。
  - **关联需求**: `PRD-FR1`, `SRS-SYS-FR-1.2`, `CSPEC-4.1`
  - **验收标准**:
    - [ ] 当焦点标签页上发生有效用户交互时，生成唯一的`activityId`并创建`active_time_start`事件。
    - [ ] 当标签页失去焦点、关闭，或达到非活跃超时阈值时，创建`active_time_end`事件。
    - [ ] 能够检测标签页的音频播放状态 (`isAudible`)。
    - [ ] 当`isAudible`为`true`时，应用`INACTIVE_TIMEOUT_MEDIA`超时阈值。
    - [ ] 当`isAudible`为`false`时，应用`INACTIVE_TIMEOUT_DEFAULT`超时阈值。
    - [ ] 交互检测必须遵循`SCROLL_THRESHOLD_PIXELS`和`MOUSEMOVE_THRESHOLD_PIXELS`的阈值。

### 阶段3：长期会话与可靠性保障

此阶段的目标是确保长时间运行的任务数据不丢失，并优化系统性能。

- [ ] **1. 实现 `Checkpoint` 调度与生成**

  - **描述**: 为长时间持续打开或保持活跃的会话，周期性地生成进度保存事件。
  - **关联需求**: `PRD-FR1`, `SRS-SYS-FR-1.6`, `SRS-SYS-FR-1.7`, `CSPEC-4.4`
  - **验收标准**:
    - [ ] 使用 `chrome.alarms` 创建一个周期性任务，执行间隔为`CHECKPOINT_INTERVAL`。
    - [ ] 任务触发时，检查所有进行中的会话。
    - [ ] 当`Open Time`累计时长超过`CHECKPOINT_OPEN_TIME_THRESHOLD`时，生成`checkpoint`事件。
    - [ ] 当`Active Time`累计时长超过`CHECKPOINT_ACTIVE_TIME_THRESHOLD`时，生成`checkpoint`事件。
    - [ ] `checkpoint`事件必须能触发即时增量聚合 (`SRS-SYS-FR-1.8`)。

- [ ] **2. 实现事件批处理与队列**

  - **描述**: 建立内存事件队列，通过批量写入数据库来降低I/O开销，提升性能。
  - **关联需求**: `NFR-1.2` (后台处理性能)
  - **验收标准**:
    - [ ] 所有生成的领域事件先进入一个内存队列。
    - [ ] 实现一个批处理机制，当队列大小达到阈值或固定时间间隔到达时，批量写入数据库。
    - [ ] 队列必须是先进先出（FIFO）。

- [ ] **3. 实现优雅关闭时的数据持久化**
  - **描述**: 确保在Service Worker被终止前，将内存中的所有待处理事件写入数据库。
  - **关联需求**: `SRS-SYS-FR-2.3` (抗中断能力)
  - **验收标准**:
    - [ ] 监听 `chrome.runtime.onSuspend` 事件。
    - [ ] 在事件回调中，同步地将内存事件队列中的所有事件刷入（flush）数据库。

### 阶段4：启动恢复与集成

此阶段的目标是处理异常情况并完成模块的最终集成。

- [ ] **1. 实现启动恢复逻辑**

  - **描述**: 严格按照LLD中定义的两阶段流程，在扩展启动时恢复因浏览器崩溃等意外中断而产生的“孤儿会话”。
  - **关联需求**: `SRS-SYS-FR-2.4`, `LLD-4.4`
  - **验收标准**:
    - [ ] **恢复阶段**:
      - [ ] 能够正确识别所有没有`_end`事件的“孤儿会话”。
      - [ ] 能够为每个孤儿会话，以其最后已知时间戳为基准，生成对应的`_end`事件，并标记`resolution: 'crash_recovery'`。
    - [ ] **交互驱动初始化阶段**:
      - [ ] 能够清空旧的本地会话状态 (`chrome.storage.local`)。
      - [ ] 能够为所有当前打开的标签页生成新的`visitId`和`open_time_start`事件。
      - [ ] 遵循“交互驱动”原则，不在启动时预设任何`Active Time`状态。

- [ ] **2. 集成数据库与错误处理**
  - **描述**: 将事件生成逻辑与数据库服务完全对接，并添加健壮的错误处理。
  - **关联需求**: `LLD-4.5`, `NFR-2.2`
  - **验收标准**:
    - [ ] 所有数据库写入操作均通过统一的`DatabaseService`进行。
    - [ ] 所有待写入的事件对象，必须先通过Zod Schema验证。
    - [ ] 实现`QuotaExceededError`的分级响应策略：首先尝试自动清理，若仍然失败则暂停记录并向用户发出持久化通知。
