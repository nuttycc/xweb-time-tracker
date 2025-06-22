```
src/
├── db/                                   # IndexedDB 核心模块
│   ├── schemas/                          # 阶段1：数据库Schema定义
│   │   ├── index.ts                      # 数据库实例和Schema导出
│   │   ├── eventslog.schema.ts           # eventslog 表定义和索引
│   │   ├── aggregatedstats.schema.ts     # aggregatedstats 表定义和索引
│   │   └── hooks.ts                      # Dexie 钩子（自动更新 lastupdated）
│   │
│   ├── connection/                       # 阶段2：数据库连接管理层
│   │   ├── index.ts                      # 连接模块导出
│   │   ├── manager.ts                    # 连接管理器（状态、健康检查、重试）
│   │   └── service.ts                    # 高级数据库服务接口
│   │
│   ├── models/                           # 阶段3：数据模型与验证层
│   │   ├── domain-event.model.ts         # DomainEvent TypeScript 接口
│   │   ├── aggregated-stat.model.ts      # AggregatedStat TypeScript 接口
│   │   ├── domain-event.schema.ts        # DomainEvent Zod 验证模式
│   │   └── aggregated-stat.schema.ts     # AggregatedStat Zod 验证模式
│   │
│   ├── repositories/                     # 阶段4：数据访问接口层 (CRUD)
│   │   ├── eventslog.repository.ts       # eventslog 表的 CRUD 操作
│   │   └── aggregatedstats.repository.ts # aggregatedstats 表的 CRUD 操作
│   │
│   ├── services/                         # 阶段5：业务服务层
│   │   ├── database.service.ts           # 统一的数据库业务服务
│   │   └── error-handler.service.ts      # 专门的错误处理逻辑
│   │
│   ├── utils/                            # 工具函数和辅助类
│   │   ├── health-check.util.ts          # 数据库健康检查工具
│   │   └── version-manager.util.ts       # 数据库版本管理工具
│   │
│   └── index.ts                          # 模块统一入口，导出所有服务
│
├── entrypoints/                          # （现有，不变）
├── components/                           # （现有，不变）
├── assets/                               # （现有，不变）
└── ...
```
