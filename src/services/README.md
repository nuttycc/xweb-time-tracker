# Services 技术服务层

## 目录职责
Services层提供所有技术实现服务，为Core业务层提供技术支撑，封装外部依赖和技术细节。

## 功能边界
- ✅ **包含内容**：数据库操作、API调用、第三方库封装、技术工具服务
- ❌ **不包含内容**：业务逻辑、业务规则、领域模型操作

## 子目录说明

### database/ - 数据库服务
封装IndexedDB操作，提供统一的数据访问接口，包括事务管理、错误处理等。

### chrome-api/ - Chrome API封装
封装Chrome扩展API调用，提供类型安全的接口，处理API兼容性和错误处理。

### event-bus/ - 事件总线服务
提供应用内事件通信机制，支持模块间的松耦合通信。

### validators/ - 验证服务
提供数据验证、配置验证等技术性验证服务。

## 设计原则

### 1. 接口抽象
所有服务都应该定义清晰的接口，便于测试和替换实现。

### 2. 错误处理
统一的错误处理机制，将技术错误转换为业务可理解的错误。

### 3. 类型安全
充分利用TypeScript的类型系统，提供类型安全的API。

### 4. 可测试性
所有服务都应该易于单元测试，支持Mock和依赖注入。

## 依赖关系
- **依赖**：models/（数据模型）、shared/（共享工具）
- **被依赖**：core/（业务核心层）
- **外部依赖**：Chrome APIs、IndexedDB、第三方库

## 服务接口规范

### 统一返回格式
```typescript
interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: ServiceError;
}

interface ServiceError {
  code: string;
  message: string;
  details?: any;
}
```

### 异步操作
所有服务操作都应该是异步的，返回Promise或使用async/await。

### 配置管理
服务层应该支持配置注入，避免硬编码配置值。
