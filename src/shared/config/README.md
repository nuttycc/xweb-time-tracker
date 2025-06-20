# Config 配置管理目录

## 目录职责
管理应用的所有配置文件、默认设置和用户配置，为整个应用提供统一的配置访问接口。

## 功能范围
- ✅ **包含内容**：默认配置、用户设置、环境配置、配置验证
- ❌ **不包含内容**：业务逻辑、数据操作、UI组件

## 文件说明

### default-config.ts
定义应用的默认配置参数，包括追踪设置、存储配置、性能参数等。

### user-settings.ts  
管理用户个性化设置，如界面主题、数据保留策略、显示偏好等。

### index.ts
统一导出配置相关的接口和工具函数。

## 配置层次结构
1. **默认配置** - 应用的基础配置
2. **环境配置** - 开发/生产环境特定配置  
3. **用户配置** - 用户个性化设置
4. **运行时配置** - 动态调整的配置

## 使用方式
```typescript
import { getDefaultConfig, getUserSettings } from '@/shared/config';

const config = getDefaultConfig();
const userSettings = getUserSettings();
```

## 与其他模块的关系
- **被依赖**：所有需要配置的模块
- **配置来源**：用户输入、环境变量、默认值
