# 核心逻辑任务计划: 第四阶段 - 前三阶段集成验证测试 - v2.0

状态: 📋 正式方案

## 范围 (Scope)

**仅包含 (ONLY INCLUDE)**:

- **前三阶段完整验证**: 对Stage 1-3 (数据库模块、聚合模块、时间追踪模块) 进行端到端集成验证
- **真实浏览器环境测试**: 使用Playwright在真实Chrome浏览器中加载扩展进行测试
- **模块协作验证**: 验证三个核心模块间的数据流和协作正确性
- **异常恢复验证**: 测试系统在各种异常情况下的恢复能力

**明确排除 (Explicitly EXCLUDE)**:

- **用户界面 (UI/UX) 测试**: 不涉及Popup、Options页面等UI组件测试
- **性能基准测试**: 专注功能正确性验证，不进行性能优化
- **跨浏览器兼容性**: 仅针对Chrome浏览器环境

## 技术策略

### 核心决策: Playwright + 真实浏览器环境

选择Playwright作为测试框架的关键原因:
- **真实环境**: 在真实Chrome浏览器中运行，完整支持扩展API
- **API完整性**: 支持所有chrome.*扩展API和浏览器行为
- **可靠性**: 消除fake-browser环境的局限性和假阳性问题
- **调试友好**: 可视化调试和详细错误报告

## 任务 (Tasks)

### 阶段1：测试环境搭建与基础设施 ✅ **已完成**

- [x] **1. Playwright环境配置** ✅
  - [x] 安装Playwright测试框架和Chrome浏览器支持
  - [x] 配置扩展加载机制，支持在测试中动态加载构建的扩展
  - [x] 设置测试配置文件，包括超时、重试、并发控制等参数

- [x] **2. 测试辅助工具开发** ✅
  - [x] 创建扩展数据库访问工具，能够直接读取IndexedDB中的事件和统计数据
  - [x] 开发浏览器状态管理工具，用于模拟标签页操作和窗口焦点变化
  - [x] 实现用户交互模拟工具，支持鼠标、键盘、滚动等交互事件
  - [x] 建立测试数据验证工具，提供数据一致性和完整性检查

- [x] **3. 测试目录结构建立** ✅
  - [x] 创建专用的集成测试目录结构
  - [x] 建立测试用例分类和命名规范
  - [x] 设置测试数据和配置文件管理
  - [x] 配置测试报告和日志输出格式

**阶段1实施完成说明**：
- **实施日期**: 2025-06-30
- **实施文件**: 完整的 `tests/e2e/` 目录结构已建立
- **核心组件**:
  - 4个测试辅助工具 (`helpers/`)
  - 测试数据工厂和配置管理 (`fixtures/`)
  - 基础测试类和扩展加载器 (`utils/`)
  - 全局设置和清理机制 (`global-setup.ts`, `global-teardown.ts`)
- **验证状态**: 通过TypeScript编译检查和基础功能验证
- **详细报告**: 参见 `tests/e2e/IMPLEMENTATION_REPORT.md`

### 阶段2：核心集成测试用例实现

- [ ] **1. 完整数据流验证测试**

  - [ ] **1.1 open_time 时间追踪测试**
    - Step 1: 创建新 tab 1 并访问一个 URL 1，如 `https://www.github.com` 
      -> 验证 eventslog 表中生成 `open_time_start` 事件
    - Step 2: 保持 tab 1 不变，访问新的 URL 2，如 `https://developer.mozilla.org` 
      -> 验证 eventslog 表中生成 URL 1 的 `open_time_end` 事件
      -> 验证 eventlog 表中生成 URL 2 的 `open_time_start` 事件

  - [ ] **1.2 active_time 时间追踪测试**
    - Step 1: 创建新 tab 1 并访问一个 URL 1，如 `https://www.github.com`，触发任意用户交互事件（如鼠标移动、键盘输入等）
      -> 验证 eventslog 表中生成 `active_time_start` 事件
    - Step 2: 保持 tab 1 不变，访问新的 URL 2，如 `https://developer.mozilla.org`，无交互
      -> 验证 eventslog 表中生成 URL 1 的 `active_time_end` 事件
      -> 验证 eventlog 表中 NO 生成 URL 2 的 `active_time_start` 事件
    - Step 3: step2 验证后，在 URL 2 页面上触发任意交互事件（如鼠标移动、键盘输入等）
      -> 验证 eventlog 表中生成 URL 2 的 `active_time_start` 事件

  - [ ] **1.3 checkpoint 测试**
    - 准备工作: 在测试配置中将 `checkpointScheduler` 的 `intervalMinutes`, `activeTimeThresholdHours`, `openTimeThresholdHours` 设置为极小值（如 `intervalMinutes: 0.1`, `thresholds: 0.001` 小时）以快速触发。
    - Step 1 (open_time): 创建新 tab 1, 访问 URL 1 并保持打开状态超过 `openTimeThresholdHours` 阈值。
      -> 验证 eventslog 表中为该会话生成一个 `eventType: 'checkpoint'` 的事件，其 `activityId` 为 null。
    - Step 2 (active_time): 创建新 tab 2, 访问 URL 2, 触发用户交互，并保持活动状态超过 `activeTimeThresholdHours` 阈值。
      -> 验证 eventslog 表中为该会话生成一个 `eventType: 'checkpoint'` 的事件，其 `activityId` 不为 null 且与 `active_time_start` 事件的 `activityId` 匹配。

  - [ ] **1.4 数据聚合测试**
    - Step 1: 在 `eventslog` 表中手动插入或通过模拟用户行为生成一组针对特定 URL（如 `https://www.google.com`）的完整事件记录，时间戳分布在一日之内。
      - 记录1: `open_time_start` (T+0s)
      - 记录2: `active_time_start` (T+10s)
      - 记录3： open_time 的 `checkpoint` 事件 (T+20s)
      - 记录4： active_time 的 `checkpoint` 事件 (T+30s)
      - 记录5： open_time 的 `checkpoint` 事件 (T+40s)
      - 记录6： active_time 的 `checkpoint` 事件 (T+50s)
      - 记录7： open_time 的 `checkpoint` 事件 (T+60s)
      - 记录8: `active_time_end` (T+70s)
      - 记录9: `open_time_end` (T+80s)
    - Step 2: 手动触发 `AggregationService` 的聚合流程。
    - Step 3: 聚合完成后，查询 `aggregatedstats` 表中对应日期和 URL 的记录。
      -> 验证:
        - `totalActiveTime` 字段值是否为 70s。
        - `totalOpenTime` 字段值是否为 80s。
        - `visitCount` 字段值是否为 1。




## References（参考）
- [Playwright 官方文档 - 测试 Chrome 扩展](https://playwright.dev/docs/chrome-extensions)
- [WXT 官方文档 - 端到端测试](https://wxt.dev/guide/essentials/e2e-testing.html)