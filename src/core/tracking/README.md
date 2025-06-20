# Tracking 时间追踪核心模块

## 模块职责
本模块负责实现 Chrome 扩展的核心时间追踪逻辑。其关键职责是准确记录用户在网页上的活动时间，并严格遵循“单一焦点”原则和其他既定业务规则。

## 核心功能与业务规则
-   **单一焦点追踪**：确保在任何时刻，系统只追踪用户当前唯一关注（active and focused）的标签页。来自非焦点标签页的事件将被忽略或特殊处理。
-   **双指标时间计算**：
    *   **打开时间 (Visit Time)**：指从用户打开一个页面到关闭或导航离开该页面的总时长。
    *   **活跃时间 (Active Time)**：指用户在页面上实际进行交互（如滚动、点击、键盘输入）或消费媒体内容（如观看视频）的时间。
-   **情景感知追踪**：智能识别不同用户场景，例如：
    *   主动交互（如阅读、填写表单）。
    *   被动媒体消费（如观看全屏视频、收听音频）。
    *   页面闲置或非焦点状态。
-   **会话管理**：负责创建和管理 `visitId`（访问会话）和 `activityId`（活动片段）的生命周期。
-   **URL 规范化**：在记录前对 URL 进行处理，如主机名规范化、移除不必要的追踪参数等，以确保数据一致性。
-   **长期会话保障 (Checkpointing)**：对于长时间打开或活跃的页面，会周期性地生成“检查点”事件，以保存当前追踪进度，防止因浏览器崩溃等意外情况导致数据丢失。

## 文件结构
```typescript
tracking/
├── README.md           // 本文档
├── tracking-engine.ts  // 追踪引擎主逻辑 (原 engine.ts)
├── tracking-policies.ts// 追踪策略定义 (原 policies.ts)
├── business-rules.ts   // 具体的业务规则实现 (原 rules.ts)
└── session-manager.ts  // 会话（visit/activity）管理逻辑 (原 session.ts)
```

## 关键逻辑与设计
-   **输入事件**：主要依赖由 `services/chrome-api/` 模块转发的浏览器原生事件，如标签页状态变更（激活、更新、关闭）、窗口焦点变化、用户交互事件（鼠标、键盘）等。
-   **输出事件**：处理浏览器事件后，生成标准化的领域事件（定义在 `models/events/`），如 `VisitSessionStarted`, `ActivitySegmentEnded`, `TrackingCheckpointCreated` 等。这些领域事件将供其他模块（主要是 `analytics` 模块）消费。
-   **焦点验证逻辑** (核心思想):
    ```typescript
    // 伪代码：检查给定tabId是否为当前用户关注的焦点
    async function isCurrentlyFocusedTab(tabId: number): Promise<boolean> {
      // const activeWindow = await chrome.windows.getLastFocused();
      // if (!activeWindow || !activeWindow.focused) return false;
      // const activeTabInWindow = await chrome.tabs.query({ active: true, windowId: activeWindow.id });
      // return activeTabInWindow && activeTabInWindow[0]?.id === tabId;
      return true; // 简化示例
    }
    ```

## 与其他模块的关系
-   **依赖（服务）**：
    -   `services/chrome-api/`: 获取浏览器标签页信息、窗口状态和用户交互事件。
-   **依赖（数据模型）**：
    -   `models/events/`: 使用或生成标准化的追踪相关领域事件。
    -   `shared/utils/`: 可能使用URL处理等通用工具。
-   **被依赖（输出）**：
    -   `core/analytics/`: 为数据分析模块提供原始的、经过处理和验证的时间追踪事件数据。
