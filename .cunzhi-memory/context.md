# 项目上下文信息
- 项目基础specs存放于docs\specs\base,包含PRD,SRS等。
- 项目采用v3.1.1混合架构方案，分层设计：core(业务逻辑)、services(技术服务)、models(数据模型)、shared(共享资源)，需要迁移现有config/types/utils/constants到shared目录
- 项目目录结构初始化已完成，采用v3.1.1混合架构，包含core/services/models/shared四层架构，所有模块都有README文档和index.ts导出文件，构建系统正常工作，项目已准备好进入功能开发阶段
- 已完成数据库设计与初始化任务(1.1)，包含6个子任务：Schema定义、数据库管理器、事件Repository、聚合数据Repository、错误处理监控、单元测试套件。实现了完整的IndexedDB数据层架构，支持事件存储、聚合统计、性能监控和错误处理。

