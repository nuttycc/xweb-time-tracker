# Value Objects 值对象

## 模块职责
本目录定义了应用中的值对象 (Value Objects)。值对象是没有唯一身份标识的领域对象，它们的相等性由其属性值决定，并且通常被设计为不可变的。它们封装了业务上有意义的、细粒度的概念或属性。

## 值对象特征
-   **无唯一标识 (No Identity)**：通过其包含的属性值来识别和比较，而非特定的 ID。
-   **不可变性 (Immutability)**：一旦创建，其内部状态不应再改变。任何修改操作都应返回一个新的值对象实例。
-   **值相等性 (Value Equality)**：如果两个值对象的所有属性值都相等，则这两个值对象相等。
-   **自包含验证 (Self-Contained Validation)**：值对象在构造时应确保其内部状态的有效性，不满足业务规则则不允许创建。
-   **封装行为 (Encapsulated Behavior)**：可以包含与其所代表的值相关的行为和计算逻辑。

## 文件结构
```typescript
value-objects/
├── README.md             // 本文档
├── TimeSpan.ts           // 表示时间跨度的值对象
├── NormalizedURL.ts      // 表示经过验证和规范化的URL (原 URL.ts)
├── RetentionPolicyType.ts// 表示数据保留策略类型的值对象 (原 RetentionPolicy.ts)
├── UIThemeChoice.ts      // 表示界面主题选项的值对象 (原 UITheme.ts)
├── FilterRuleDefinition.ts// 表示过滤规则定义的值对象 (原 FilterRule.ts)
└── index.ts              // 统一导出模块内容
```

## 核心值对象示例 (概念性)

-   **`TimeSpan`**:
    *   **用途**: 表示一个时间长度（例如，以秒、分钟或小时为单位）。
    *   **核心概念**: 封装时间数值，提供方便的单位转换（如 `totalSeconds`, `totalMinutes`）、格式化（如 `toHumanReadableString`）、以及与其他 `TimeSpan` 对象的比较和算术运算（如 `add`, `subtract`, `equals`）。

-   **`NormalizedURL`**:
    *   **用途**: 表示一个经过验证、解析和规范化的 URL。
    *   **核心概念**: 构造时接收一个原始 URL 字符串，内部进行解析和规范化处理（如移除不必要的追踪参数、统一协议大小写等）。提供访问 URL 各组成部分（如 `hostname`, `pathname`, `protocol`, `parentDomain`）的便捷方法，并支持与其他 `NormalizedURL` 对象进行比较。

-   **`RetentionPolicyType`**:
    *   **用途**: 表示一个具体的数据保留策略选项（例如“保留7天”、“永久保留”）。
    *   **核心概念**: 封装策略的类型（如 `IMMEDIATE`, `SHORT_TERM`, `PERMANENT`）及其对应的具体含义（如保留天数）。提供判断数据是否应被保留、计算过期日期等业务方法。

-   **`UIThemeChoice`**:
    *   **用途**: 表示用户选择的界面主题（如“浅色”、“深色”、“跟随系统”）。
    *   **核心概念**: 封装主题类型，并可能提供解析实际应用主题（例如，当选择“跟随系统”时，根据系统偏好决定具体主题）或生成相应 CSS 类名的方法。

-   **`FilterRuleDefinition`**:
    *   **用途**: 表示一条用户定义的过滤规则（例如，排除某个域名或 URL 模式的追踪）。
    *   **核心概念**: 封装规则的类型（如 `DOMAIN_EXCLUDE`, `URL_MATCH_EXCLUDE`）和规则的具体值（如域名字符串、URL 模式）。可能包含验证规则有效性或匹配特定 URL 的逻辑。

*详细的类实现、构造函数、方法和属性请参考各自的 `.ts` 文件。*

## 值对象设计原则
1.  **不可变性 (Immutability)**：所有属性应为只读 (`readonly`)，任何修改操作都应返回新的实例。
2.  **创建时验证 (Validation at Creation)**：在构造函数或工厂方法中进行完整的参数验证，确保对象始终处于有效状态。
3.  **封装相关行为 (Rich Behavior)**：值对象应包含与其所代表的值相关的所有业务逻辑和计算方法。
4.  **基于值的相等性 (Value-Based Equality)**：必须实现一个 `equals()` 方法（或其他比较方法），该方法基于对象的所有相关属性值进行比较，而非基于引用。

## 与其他模块的关系
-   **被使用于**:
    -   `models/entities/`: 实体经常将值对象作为其属性，以封装和验证部分状态。
    -   `core/`: 核心业务逻辑层会创建和使用值对象来执行计算和决策。
    -   `services/`: 服务层可能在与外部系统交互或处理数据时使用值对象。
-   **可能依赖**:
    -   `shared/utils/`: 可能使用通用的工具函数（如字符串处理、日期处理）。
    -   `shared/constants/`: 可能使用共享的常量定义。
