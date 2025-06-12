# 网页时间追踪 Chrome 扩展核心方案（V12）

---

## 0. 本方案不涉及的模块

| 模块 | 说明 |
| --- | --- |
| UI 视觉 / 交互 | Popup、Options、图表呈现等界面设计 |
| 国际化（i18n） | 语言包、RTL 布局 |
| 云同步与帐号体系 | 任意形式的远端存储、登录、OAuth |
| 数据导出 / 清理 | 导出 CSV、自动归档、备份、软删除 |
| 自动更新流程 | CI/CD、自动上架商店 |

上述内容完全留空；本方案只聚焦「时间统计」与「数据存储」。

---

## 1. 目标与范围

| 目标 | 说明 |
| --- | --- |
| 时间统计 | 精确记录 *Active Time* 与 *Open Time* |
| 数据存储 | 在 Service Worker 可被回收的前提下安全持久化海量数据 |
| 查询维度 | 支持按日、按月、按域名检索，便于后续可视化 |

---

## 2. 关键术语

| 术语 | 定义 |
| --- | --- |
| Active Time | 用户产生真实输入后 30 s 内累积的时间 |
| Open Time | 标签页自创建至关闭的总持续时间 |
| System Idle | 浏览器判定的 `idle` / `locked` 状态（阈值 60 s） |
| Heartbeat | Service Worker 每 60 s 被 `chrome.alarms` 唤醒一次 |
| Normalized URL Key | `{month, domain, pathHash, canonicalParams}` |
| Offscreen Document | 隐藏页面，专职执行 IndexedDB 事务 |

---

## 3. 模块概览

| 模块 | 职责 | 运行环境 |
| --- | --- | --- |
| 时间统计 | 捕获所有与时长相关的事件并计算秒数 | Service Worker + 内容脚本 |
| 数据存储 | 建库、批量写入、索引、查询、配额监控 | Offscreen Document |
| 轻量配置 | 存储扩展参数、白名单等 | `chrome.storage.local` |
| 临时缓冲 | 防止 Service Worker 内存丢失 | `chrome.storage.session` |

---

## 4. 时间统计模块设计

### 4.1 事件矩阵

| 来源 | 条件 | 作用 |
| --- | --- | --- |
| 标签页激活 | `chrome.tabs.onActivated` | 结束旧会话，开始新会话 |
| 标签页更新 | `chrome.tabs.onUpdated` 且地址变动 | 切换 URL 主键 |
| 标签页关闭 | `chrome.tabs.onRemoved` | 归档 Open / Active |
| 窗口焦点 | `chrome.windows.onFocusChanged` | 判断前台 / 后台 |
| 系统空闲 | `chrome.idle.onStateChanged` | 暂停或恢复 Active 计时 |
| 内容脚本输入 | 鼠标、滚轮、键盘、可见性 | 100 ms 节流后上报 |
| SPA 导航 | `pushState`、`replaceState`、`popstate` | 侦测单页应用 URL 变化 |

注：内容脚本通过 `` + `all_frames` 注入，受限域失败时静默忽略。

### 4.2 状态机

```
           ┌────────────┐
           │ SystemIdle │
           └─────▲──────┘
                 │
Idle ──用户交互──› Active
 ^               │30 s 无交互
 └─────失焦或空闲───

```

- SystemIdle 不累积 Active。
- 多标签同域：各自计算 Open，Active 仅记录前景标签。

### 4.3 Heartbeat 与容错

流程要点

1. 60 s 触发一次。
2. 若与上次心跳间隔超过 90 s，则把缺口全计入 Open，不计 Active。
3. 将内存与 session 缓冲合并后切片，每块 ≤ 1000 条，通过消息流式发送给 Offscreen；成功后清除对应缓冲，失败保留待重试。

---

## 5. 数据存储模块

### 5.1 Offscreen 生命周期

- Service Worker 启动时检查当前 Profile 是否已有 Offscreen；若无，则以 `IFRAME_SCRIPTING` 理由创建。
- 扩展始终保证「一个 Profile 一份 Offscreen」。
- Offscreen 与 Service Worker 采用“拉取式”流：
    1. Service Worker 通知有批次可读并提供 `batchId`。
    2. Offscreen 主动拉取真实数据。
    3. 持久化完成后回送 `ACK`；失败时携带错误堆栈。

### 5.2 IndexedDB 结构

| 项 | 设计 |
| --- | --- |
| 数据库名 | `web-time-tracker` |
| 版本号 | 1（初始，无旧数据） |
| Object Store | `metrics`（主表，复合键见下）；`index`（全局索引，键名 `singleton`） |
| 主键 | `[month, domain, pathHash, canonicalParams]`；`pathHash` 为 `SHA-256` 前 16 字节 |
| 必要索引 | `by_month`、`by_domain`、`by_day` |
| 事务策略 | 一次事务处理最多 1000 条聚合后记录，自动排队串行执行 |

### 5.3 数据模型（TypeScript 定义）

```tsx
export interface NormalizedUrl {
  month: string;          // YYYY-MM
  domain: string;
  pathHash: string;       // 16 hex chars
  canonicalParams: string; // '-' 或排序后查询串
  originalUrl: string;
}

export interface PendingEntry extends NormalizedUrl {
  activeSeconds: number;
  openSeconds: number;
  timestamp: number;      // epoch ms
}

export interface TimeMetric {
  activeSeconds: number;
  openSeconds: number;
  firstVisit: number;     // epoch ms
  lastVisit: number;      // epoch ms
  visitCount: number;
}

export interface DataIndex {
  domains: string[];
  dayRange: { earliest: string; latest: string }; // YYYY-MM-DD
  summary: { totalActive: number; totalOpen: number; visitCount: number };
}

```

### 5.4 批量写入协议

| 步骤 | 描述 |
| --- | --- |
| 合并 | Offscreen 按主键聚合所有增量 |
| 事务 | 开启 `readwrite` 事务同时操作 `metrics` 与 `index` |
| 更新 | 读取旧 `TimeMetric` → 合并 → 写回 |
| 索引维护 | 依据变更更新域名集合、日期范围、汇总 |
| 回执 | 成功返回 `affected` 数量；若配额不足返回 `quota` 错误类型 |

### 5.5 配额与异常

| 场景 | 处理 |
| --- | --- |
| `quota` | Service Worker 弹出提示，引导导出或删除旧数据 |
| 事务异常 | Offscreen 返回堆栈；Service Worker 指数退避重试 |
| Offscreen 丢失 | 下次 Heartbeat 检测后自动重建 |

---

## 6. 权限与 WXT 配置

| 权限 | 目的 |
| --- | --- |
| tabs | 订阅标签页生命周期 |
| activeTab | 获取当前页面 URL |
| alarms | 心跳定时 |
| storage | 轻量配置与 session 缓冲 |
| offscreen | 创建 Offscreen Document |
| idle | 监控系统空闲 |
| unlimitedStorage | 防止配额过小导致写入失败 |

WXT 构建脚本需在 `manifest.permissions` 与 `host_permissions` 中写明上述权限与 ``。

---

## 7. 实施里程碑

| 阶段 | 主要交付 | 状态 |
| --- | --- | --- |
| 1 | TypeScript 类型、默认配置、事件常量 |  |
| 2 | Offscreen 创建逻辑、IndexedDB 初始化 |  |
| 3 | 内容脚本注入、事件监听骨架 |  |
| 4 | 状态机、系统空闲校正、Heartbeat |  |
| 5 | 批量写入流式协议、队列与错误回退 |  |
| 6 | 单元测试与压力测试（10 万 URL × 90 天） |  |
| 7 | 简易 Options / Popup 读取接口 |  |
| 8 | Alpha 内测，收集性能与稳定性数据 |  |

---

## 8. 性能基线

- 单次心跳：事务耗时预期 < 50 ms；一次消息块体积 < 100 kB。
- 90 天、日均 2000 URL：数据库体积≈15 MB，远低于扩展上下文 100 MB 配额。

---

## 9. 安全与隐私

| 要点 | 说明 |
| --- | --- |
| 数据存储 | 全量数据仅保留在本地 IndexedDB |
| 最小权限 | 未请求任何与远程通信相关的可疑权限 |
| 后续功能 | 若未来引入云同步，将另行进行安全审计 |