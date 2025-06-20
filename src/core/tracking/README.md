# Tracking 时间追踪核心模块

## 模块职责
实现Chrome网页时间追踪扩展的核心追踪逻辑，严格遵循PRD中定义的"单一焦点"原则和业务规则。

## 功能范围

### 核心功能
- **单一焦点追踪**：确保任何时刻只追踪用户唯一关注的页面
- **双指标计算**：区分并计算"打开时间"和"活跃时间"
- **情景感知**：智能识别"主动交互"和"被动媒体消费"场景
- **长期会话保障**：周期性保存长时间任务的进度

### 业务规则实现
1. **单一焦点原则**：验证事件来源是否为当前焦点标签页
2. **URL规范化**：处理主机名规范化和参数过滤
3. **会话管理**：管理visitId和activityId的生命周期
4. **检查点机制**：为长期会话创建进度保存点

## 文件结构
```
tracking/
├── README.md           # 本文档
├── engine.ts          # 追踪引擎主逻辑
├── policies.ts        # 追踪策略定义
├── rules.ts           # 业务规则实现
└── session.ts         # 会话管理逻辑
```

## 接口设计
- **输入**：浏览器事件（标签页切换、用户交互等）
- **输出**：领域事件（时间追踪事件）
- **依赖**：models/events/（事件模型）、services/chrome-api/（浏览器API）

## 关键业务逻辑

### 焦点验证
```typescript
// 伪代码示例
async function isFocusTab(tabId: number): Promise<boolean> {
  const activeTab = await getActiveTab();
  return activeTab?.id === tabId;
}
```

### 时间计算
- **打开时间**：从页面加载到关闭的总时长
- **活跃时间**：用户实际交互和专注的时长

## 与其他模块的关系
- **调用**：services/chrome-api/（获取标签页信息）
- **产生**：models/events/（追踪事件）
- **配合**：analytics/（为数据分析提供原始事件）
