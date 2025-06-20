# Value Objects 值对象目录

## 目录职责
定义应用中的值对象，这些对象没有唯一标识符，通过其属性值来定义相等性，通常是不可变的。

## 值对象特征
- **无标识符**：通过属性值而非ID来识别
- **不可变性**：一旦创建，内部状态不可改变
- **值相等性**：两个值对象相等当且仅当所有属性值相等
- **自包含验证**：包含自身的验证逻辑

## 文件结构
```
value-objects/
├── README.md           # 本文档
├── TimeSpan.ts         # 时间跨度值对象
├── URL.ts             # URL值对象
├── RetentionPolicy.ts  # 保留策略值对象
├── UITheme.ts         # 界面主题值对象
├── FilterRule.ts      # 过滤规则值对象
└── index.ts           # 统一导出
```

## 核心值对象定义

### TimeSpan - 时间跨度值对象
表示一段时间的长度，提供时间计算和格式化功能。

```typescript
class TimeSpan {
  private readonly _totalSeconds: number;
  
  constructor(seconds: number) {
    if (seconds < 0) {
      throw new Error('Time span cannot be negative');
    }
    this._totalSeconds = Math.floor(seconds);
  }
  
  // 静态工厂方法
  static fromMinutes(minutes: number): TimeSpan {
    return new TimeSpan(minutes * 60);
  }
  
  static fromHours(hours: number): TimeSpan {
    return new TimeSpan(hours * 3600);
  }
  
  static fromDays(days: number): TimeSpan {
    return new TimeSpan(days * 86400);
  }
  
  // 访问器
  get totalSeconds(): number { return this._totalSeconds; }
  get totalMinutes(): number { return this._totalSeconds / 60; }
  get totalHours(): number { return this._totalSeconds / 3600; }
  get totalDays(): number { return this._totalSeconds / 86400; }
  
  // 格式化方法
  toHumanReadable(): string {
    const hours = Math.floor(this._totalSeconds / 3600);
    const minutes = Math.floor((this._totalSeconds % 3600) / 60);
    const seconds = this._totalSeconds % 60;
    
    if (hours > 0) {
      return `${hours}小时${minutes}分钟`;
    } else if (minutes > 0) {
      return `${minutes}分钟${seconds}秒`;
    } else {
      return `${seconds}秒`;
    }
  }
  
  // 运算方法
  add(other: TimeSpan): TimeSpan {
    return new TimeSpan(this._totalSeconds + other._totalSeconds);
  }
  
  subtract(other: TimeSpan): TimeSpan {
    return new TimeSpan(Math.max(0, this._totalSeconds - other._totalSeconds));
  }
  
  // 比较方法
  equals(other: TimeSpan): boolean {
    return this._totalSeconds === other._totalSeconds;
  }
  
  isGreaterThan(other: TimeSpan): boolean {
    return this._totalSeconds > other._totalSeconds;
  }
}
```

### URL - URL值对象
封装URL的解析、验证和规范化功能。

```typescript
class URLValue {
  private readonly _original: string;
  private readonly _parsed: URL;
  private readonly _normalized: string;
  
  constructor(url: string) {
    this._original = url;
    
    try {
      this._parsed = new URL(url);
    } catch (error) {
      throw new Error(`Invalid URL: ${url}`);
    }
    
    this._normalized = this.normalize();
  }
  
  private normalize(): string {
    // 移除跟踪参数
    const cleanParams = new URLSearchParams();
    for (const [key, value] of this._parsed.searchParams) {
      if (!this.isTrackingParameter(key)) {
        cleanParams.append(key, value);
      }
    }
    
    // 重建URL
    const normalized = new URL(this._parsed.origin + this._parsed.pathname);
    normalized.search = cleanParams.toString();
    
    return normalized.toString();
  }
  
  private isTrackingParameter(param: string): boolean {
    const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'fbclid', 'gclid'];
    return trackingParams.includes(param.toLowerCase());
  }
  
  // 访问器
  get original(): string { return this._original; }
  get normalized(): string { return this._normalized; }
  get hostname(): string { return this._parsed.hostname; }
  get pathname(): string { return this._parsed.pathname; }
  get protocol(): string { return this._parsed.protocol; }
  
  // 域名提取
  getParentDomain(): string {
    // 使用PSL库提取父域名
    return extractParentDomain(this.hostname);
  }
  
  // 比较方法
  equals(other: URLValue): boolean {
    return this._normalized === other._normalized;
  }
  
  isSameDomain(other: URLValue): boolean {
    return this.getParentDomain() === other.getParentDomain();
  }
  
  isSameHostname(other: URLValue): boolean {
    return this.hostname === other.hostname;
  }
}
```

### RetentionPolicy - 保留策略值对象
定义数据保留策略的业务规则和行为。

```typescript
enum RetentionPolicyType {
  IMMEDIATE = 'immediate',      // 聚合后立即删除
  SHORT = 'short',             // 短期保留
  LONG = 'long',               // 长期保留
  PERMANENT = 'permanent'       // 永久保留
}

class RetentionPolicy {
  private readonly _type: RetentionPolicyType;
  private readonly _retentionDays: number;
  
  constructor(type: RetentionPolicyType) {
    this._type = type;
    this._retentionDays = this.calculateRetentionDays(type);
  }
  
  private calculateRetentionDays(type: RetentionPolicyType): number {
    switch (type) {
      case RetentionPolicyType.IMMEDIATE:
        return 0;
      case RetentionPolicyType.SHORT:
        return 7;   // 7天
      case RetentionPolicyType.LONG:
        return 90;  // 90天
      case RetentionPolicyType.PERMANENT:
        return -1;  // 永久保留
      default:
        throw new Error(`Unknown retention policy type: ${type}`);
    }
  }
  
  // 访问器
  get type(): RetentionPolicyType { return this._type; }
  get retentionDays(): number { return this._retentionDays; }
  get isPermanent(): boolean { return this._retentionDays === -1; }
  get isImmediate(): boolean { return this._retentionDays === 0; }
  
  // 业务方法
  shouldRetain(dataAge: TimeSpan): boolean {
    if (this.isPermanent) return true;
    if (this.isImmediate) return false;
    
    return dataAge.totalDays <= this._retentionDays;
  }
  
  getExpirationDate(fromDate: Date = new Date()): Date | null {
    if (this.isPermanent) return null;
    if (this.isImmediate) return fromDate;
    
    const expiration = new Date(fromDate);
    expiration.setDate(expiration.getDate() + this._retentionDays);
    return expiration;
  }
  
  // 描述方法
  getDescription(): string {
    switch (this._type) {
      case RetentionPolicyType.IMMEDIATE:
        return '聚合后立即删除原始数据';
      case RetentionPolicyType.SHORT:
        return `保留原始数据${this._retentionDays}天`;
      case RetentionPolicyType.LONG:
        return `保留原始数据${this._retentionDays}天`;
      case RetentionPolicyType.PERMANENT:
        return '永久保留所有原始数据';
    }
  }
  
  // 比较方法
  equals(other: RetentionPolicy): boolean {
    return this._type === other._type;
  }
  
  isMoreRestrictive(other: RetentionPolicy): boolean {
    if (this.isPermanent) return false;
    if (other.isPermanent) return true;
    return this._retentionDays < other._retentionDays;
  }
}
```

### UITheme - 界面主题值对象
定义用户界面主题的配置和行为。

```typescript
enum UIThemeType {
  LIGHT = 'light',
  DARK = 'dark',
  AUTO = 'auto'
}

class UITheme {
  private readonly _type: UIThemeType;
  
  constructor(type: UIThemeType) {
    this._type = type;
  }
  
  get type(): UIThemeType { return this._type; }
  
  // 主题解析
  resolveTheme(systemPreference: 'light' | 'dark' = 'light'): 'light' | 'dark' {
    switch (this._type) {
      case UIThemeType.LIGHT:
        return 'light';
      case UIThemeType.DARK:
        return 'dark';
      case UIThemeType.AUTO:
        return systemPreference;
    }
  }
  
  // CSS类名生成
  getCSSClass(): string {
    return `theme-${this._type}`;
  }
  
  // 描述方法
  getDisplayName(): string {
    switch (this._type) {
      case UIThemeType.LIGHT:
        return '浅色主题';
      case UIThemeType.DARK:
        return '深色主题';
      case UIThemeType.AUTO:
        return '跟随系统';
    }
  }
  
  equals(other: UITheme): boolean {
    return this._type === other._type;
  }
}
```

## 值对象设计原则

### 1. 不可变性
所有属性都应该是只读的，状态变更通过创建新实例实现。

### 2. 自验证
在构造函数中进行完整的验证，确保对象始终处于有效状态。

### 3. 丰富的行为
提供与该值对象相关的所有业务行为和计算方法。

### 4. 相等性比较
实现基于值的相等性比较，而不是引用比较。

## 与其他模块的关系
- **使用者**：models/entities/（实体模型）、core/（业务逻辑）
- **依赖**：shared/utils/（工具函数）、shared/constants/（常量定义）
