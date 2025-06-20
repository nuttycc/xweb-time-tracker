# Validators 验证服务模块

## 模块职责
提供统一的数据验证服务，确保数据完整性和格式正确性，支持配置验证、数据验证和业务规则验证。

## 功能范围

### 核心功能
- **配置验证**：用户配置数据的格式和有效性验证
- **数据验证**：数据库数据的完整性和约束验证
- **输入验证**：用户输入和API参数的验证
- **业务规则验证**：业务逻辑相关的验证规则

### 验证类型
1. **类型验证**：基础数据类型检查
2. **格式验证**：字符串格式、正则表达式匹配
3. **范围验证**：数值范围、长度限制
4. **业务验证**：业务规则相关的复杂验证

## 文件结构
```
validators/
├── README.md           # 本文档
├── config.ts          # 配置验证器
├── data.ts            # 数据验证器
├── input.ts           # 输入验证器
├── business.ts        # 业务规则验证器
└── schemas.ts         # 验证模式定义
```

## 验证器设计

### 基础验证接口
```typescript
interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

interface ValidationError {
  field: string;
  code: string;
  message: string;
  value?: any;
}

interface Validator<T> {
  validate(data: T): ValidationResult;
  validateAsync(data: T): Promise<ValidationResult>;
}
```

### 配置验证器
```typescript
interface ConfigValidator {
  // 验证用户配置对象
  validateUserConfig(config: UserConfiguration): ValidationResult;
  
  // 验证保留策略
  validateRetentionPolicy(policy: string): ValidationResult;
  
  // 验证主题设置
  validateTheme(theme: string): ValidationResult;
  
  // 验证过滤规则
  validateFilterRules(rules: string[]): ValidationResult;
}
```

### 数据验证器
```typescript
interface DataValidator {
  // 验证事件日志记录
  validateEventLog(event: EventLogRecord): ValidationResult;
  
  // 验证聚合统计记录
  validateAggregatedStats(stats: AggregatedStatsRecord): ValidationResult;
  
  // 验证URL格式
  validateURL(url: string): ValidationResult;
  
  // 验证时间戳
  validateTimestamp(timestamp: number): ValidationResult;
}
```

## 验证规则定义

### 配置验证规则
```typescript
const UserConfigSchema = {
  version: {
    type: 'string',
    required: true,
    pattern: /^\d+\.\d+\.\d+$/
  },
  lastModified: {
    type: 'number',
    required: true,
    min: 0
  },
  deviceId: {
    type: 'string',
    required: true,
    minLength: 1,
    maxLength: 100
  },
  retentionPolicy: {
    type: 'string',
    required: true,
    enum: ['immediate', 'short', 'long', 'permanent']
  },
  uiTheme: {
    type: 'string',
    required: true,
    enum: ['light', 'dark', 'auto']
  }
};
```

### 数据验证规则
```typescript
const EventLogSchema = {
  timestamp: {
    type: 'number',
    required: true,
    min: 0,
    max: Date.now() + 86400000 // 不能超过当前时间+1天
  },
  eventType: {
    type: 'string',
    required: true,
    enum: ['open_time_start', 'open_time_end', 'active_time_start', 'active_time_end', 'checkpoint']
  },
  tabId: {
    type: 'number',
    required: true,
    min: 0
  },
  url: {
    type: 'string',
    required: true,
    maxLength: 2048,
    custom: 'validateURL'
  },
  visitId: {
    type: 'string',
    required: true,
    pattern: /^[a-f0-9-]{36}$/ // UUID格式
  }
};
```

## 自定义验证器

### URL验证器
```typescript
function validateURL(url: string): boolean {
  try {
    const parsed = new URL(url);
    // 检查协议
    if (!['http:', 'https:', 'chrome:', 'chrome-extension:'].includes(parsed.protocol)) {
      return false;
    }
    // 检查主机名
    if (parsed.protocol.startsWith('http') && !parsed.hostname) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
```

### 业务规则验证器
```typescript
function validateTimeRange(startTime: number, endTime: number): ValidationResult {
  const errors: ValidationError[] = [];
  
  if (startTime >= endTime) {
    errors.push({
      field: 'timeRange',
      code: 'INVALID_TIME_RANGE',
      message: 'Start time must be before end time'
    });
  }
  
  const maxDuration = 24 * 60 * 60 * 1000; // 24小时
  if (endTime - startTime > maxDuration) {
    errors.push({
      field: 'timeRange',
      code: 'DURATION_TOO_LONG',
      message: 'Time range cannot exceed 24 hours'
    });
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}
```

## 错误处理

### 验证错误代码
```typescript
enum ValidationErrorCode {
  REQUIRED_FIELD_MISSING = 'REQUIRED_FIELD_MISSING',
  INVALID_TYPE = 'INVALID_TYPE',
  INVALID_FORMAT = 'INVALID_FORMAT',
  OUT_OF_RANGE = 'OUT_OF_RANGE',
  INVALID_ENUM_VALUE = 'INVALID_ENUM_VALUE',
  CUSTOM_VALIDATION_FAILED = 'CUSTOM_VALIDATION_FAILED'
}
```

### 错误消息国际化
```typescript
const ValidationMessages = {
  'zh-CN': {
    REQUIRED_FIELD_MISSING: '必填字段缺失',
    INVALID_TYPE: '数据类型不正确',
    INVALID_FORMAT: '格式不正确',
    OUT_OF_RANGE: '数值超出允许范围',
    INVALID_ENUM_VALUE: '不是有效的选项值'
  },
  'en-US': {
    REQUIRED_FIELD_MISSING: 'Required field is missing',
    INVALID_TYPE: 'Invalid data type',
    INVALID_FORMAT: 'Invalid format',
    OUT_OF_RANGE: 'Value out of range',
    INVALID_ENUM_VALUE: 'Invalid enum value'
  }
};
```

## 性能优化

### 验证缓存
- 缓存验证结果，避免重复验证
- 智能缓存失效策略
- 内存使用控制

### 异步验证
- 支持异步验证规则
- 并发验证优化
- 验证超时控制

### 批量验证
- 支持批量数据验证
- 早期失败策略
- 验证结果聚合

## 与其他模块的关系
- **服务对象**：core/（业务数据验证）、services/database/（数据库数据验证）
- **配置来源**：shared/config/（验证规则配置）
- **错误处理**：shared/utils/（错误格式化和处理）
