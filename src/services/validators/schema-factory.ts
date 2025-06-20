/**
 * Schema工厂函数
 * 提供统一的Schema生成、组合和管理功能
 *
 * 功能包括：
 * - 动态Schema生成
 * - Schema组合和扩展
 * - 条件验证Schema
 * - 自定义验证规则
 * - Schema缓存和优化
 */

import * as z from 'zod/v4';
import type { ZodObject, ZodRawShape } from 'zod/v4';

/**
 * Schema工厂配置选项
 */
export interface SchemaFactoryOptions {
  /** 是否启用严格模式 */
  strict?: boolean;
  /** 自定义错误消息 */
  errorMessage?: string;
  /** 是否启用缓存 */
  enableCache?: boolean;
}

/**
 * 条件验证配置
 */
export interface ConditionalValidationConfig<T> {
  /** 条件函数 */
  condition: (data: T) => boolean;
  /** 满足条件时的Schema */
  thenSchema: z.ZodType;
  /** 不满足条件时的Schema */
  elseSchema?: z.ZodType;
  /** 错误消息 */
  message?: string;
}

/**
 * Schema缓存管理器
 */
class SchemaCacheManager {
  private cache = new Map<string, z.ZodType>();
  private enabled = true;

  /**
   * 设置缓存启用状态
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.clear();
    }
  }

  /**
   * 获取缓存的Schema
   */
  get(key: string): z.ZodType | undefined {
    return this.enabled ? this.cache.get(key) : undefined;
  }

  /**
   * 设置缓存的Schema
   */
  set(key: string, schema: z.ZodType): void {
    if (this.enabled) {
      this.cache.set(key, schema);
    }
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * 获取缓存统计
   */
  getStats(): { size: number; enabled: boolean } {
    return {
      size: this.cache.size,
      enabled: this.enabled,
    };
  }
}

/**
 * 全局Schema缓存实例
 */
const schemaCache = new SchemaCacheManager();

/**
 * Schema工厂类
 */
export class SchemaFactory {
  /**
   * 创建对象Schema
   */
  static createObject<T extends ZodRawShape>(shape: T, options: SchemaFactoryOptions = {}) {
    const { strict = true, errorMessage } = options;
    const params = errorMessage ? { error: errorMessage } : undefined;

    let schema = z.object(shape, params);

    if (strict) {
      schema = schema.strict();
    }

    return schema;
  }

  /**
   * 创建数组Schema
   */
  static createArray<T extends z.ZodType>(
    itemSchema: T,
    options: {
      minLength?: number;
      maxLength?: number;
      errorMessage?: string;
    } = {}
  ): z.ZodArray<T> {
    const { minLength, maxLength, errorMessage } = options;

    let schema = z.array(itemSchema, errorMessage ? { error: errorMessage } : undefined);

    if (minLength !== undefined) {
      schema = schema.min(minLength, `数组长度不能少于${minLength}个元素`);
    }

    if (maxLength !== undefined) {
      schema = schema.max(maxLength, `数组长度不能超过${maxLength}个元素`);
    }

    return schema;
  }

  /**
   * 创建枚举Schema
   */
  static createEnum<T extends readonly [string, ...string[]]>(
    values: T,
    options: SchemaFactoryOptions = {}
  ) {
    const { errorMessage } = options;
    return z.enum(values, errorMessage ? { error: errorMessage } : undefined);
  }

  /**
   * 创建联合Schema
   */
  static createUnion<T extends readonly [z.ZodType, ...z.ZodType[]]>(
    schemas: T,
    options: SchemaFactoryOptions = {}
  ) {
    const { errorMessage } = options;
    return z.union(schemas, errorMessage ? { error: errorMessage } : undefined);
  }

  /**
   * 创建可选Schema
   */
  static createOptional<T extends z.ZodType>(schema: T): z.ZodOptional<T> {
    return schema.optional();
  }

  /**
   * 创建可空Schema
   */
  static createNullable<T extends z.ZodType>(schema: T): z.ZodNullable<T> {
    return schema.nullable();
  }

  /**
   * 创建带默认值的Schema
   */
  static createWithDefault<T extends z.ZodType>(
    schema: T,
    defaultValue: z.infer<T>
  ): z.ZodDefault<T> {
    return schema.default(defaultValue);
  }

  /**
   * 创建条件验证Schema
   */
  static createConditional<T>(
    baseSchema: z.ZodType,
    config: ConditionalValidationConfig<T>
  ): z.ZodType {
    return baseSchema.refine(
      data => {
        if (config.condition(data as T)) {
          return config.thenSchema.safeParse(data).success;
        } else if (config.elseSchema) {
          return config.elseSchema.safeParse(data).success;
        }
        return true;
      },
      {
        message: config.message || '条件验证失败',
      }
    );
  }

  /**
   * 扩展Schema
   */
  static extend<T extends ZodRawShape, U extends ZodRawShape>(
    baseSchema: ZodObject<T>,
    extension: U,
    options: SchemaFactoryOptions = {}
  ) {
    const { strict = true } = options;

    let schema = z.object({
      ...baseSchema.shape,
      ...extension,
    });

    if (strict) {
      schema = schema.strict();
    }

    return schema;
  }

  /**
   * 合并Schema
   */
  static merge<T extends ZodRawShape, U extends ZodRawShape>(
    schema1: ZodObject<T>,
    schema2: ZodObject<U>
  ) {
    return schema1.merge(schema2);
  }

  /**
   * 选择Schema字段
   */
  static pick<T extends ZodRawShape, K extends keyof T>(schema: ZodObject<T>, keys: K[]) {
    // @ts-expect-error Zod's complex types make dynamic mask creation difficult to type.
    return schema.pick(Object.fromEntries(keys.map(key => [key, true])));
  }

  /**
   * 排除Schema字段
   */
  static omit<T extends ZodRawShape, K extends keyof T>(schema: ZodObject<T>, keys: K[]) {
    // @ts-expect-error Zod's complex types make dynamic mask creation difficult to type.
    return schema.omit(Object.fromEntries(keys.map(key => [key, true])));
  }

  /**
   * 创建部分Schema（所有字段可选）
   */
  static createPartial<T extends ZodRawShape>(
    schema: ZodObject<T>
  ): z.ZodObject<{ [K in keyof T]: z.ZodOptional<T[K]> }> {
    return schema.partial();
  }

  /**
   * 添加自定义验证
   */
  static addValidation<T extends z.ZodType>(
    schema: T,
    validator: (data: z.infer<T>) => boolean,
    message: string
  ): T {
    return schema.refine(validator, { message }) as T;
  }

  /**
   * 添加异步验证
   */
  static addAsyncValidation<T extends z.ZodType>(
    schema: T,
    validator: (data: z.infer<T>) => Promise<boolean>,
    message: string
  ): T {
    return schema.refine(validator, { message }) as T;
  }

  /**
   * 创建转换Schema
   */
  static createTransform<T extends z.ZodType, U>(
    schema: T,
    transformer: (data: z.infer<T>) => U
  ): z.ZodType<U> {
    return schema.transform(transformer);
  }

  /**
   * 获取Schema缓存管理器
   */
  static getCacheManager(): SchemaCacheManager {
    return schemaCache;
  }

  /**
   * 创建缓存的Schema
   */
  static createCached<T extends z.ZodType>(key: string, schemaFactory: () => T): T {
    const cached = schemaCache.get(key);
    if (cached) {
      return cached as T;
    }

    const schema = schemaFactory();
    schemaCache.set(key, schema);
    return schema;
  }
}

/**
 * 常用Schema工厂函数
 */
export const CommonSchemas = {
  /**
   * 创建ID Schema
   */
  id: (options: { type?: 'number' | 'string'; positive?: boolean } = {}) => {
    const { type = 'number', positive = true } = options;

    if (type === 'number') {
      let schema = z.number().int();
      if (positive) {
        schema = schema.positive();
      }
      return schema;
    } else {
      return z.string().min(1);
    }
  },

  /**
   * 创建分页Schema
   */
  pagination: (options: { maxPageSize?: number } = {}) => {
    const { maxPageSize = 1000 } = options;

    return SchemaFactory.createObject({
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(maxPageSize).default(20),
    });
  },

  /**
   * 创建排序Schema
   */
  sorting: (allowedFields: string[]) => {
    return SchemaFactory.createObject({
      sortBy: z.enum(allowedFields as [string, ...string[]]).optional(),
      sortOrder: z.enum(['asc', 'desc']).default('asc'),
    });
  },

  /**
   * 创建日期范围Schema
   */
  dateRange: (options: { required?: boolean } = {}) => {
    const { required = false } = options;

    const schema = SchemaFactory.createObject({
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }).refine(data => new Date(data.startDate) <= new Date(data.endDate), {
      message: '开始日期不能晚于结束日期',
    });

    return required ? schema : schema.optional();
  },
};

/**
 * 导出类型
 */
export type SchemaFactoryType = typeof SchemaFactory;
export type CommonSchemasType = typeof CommonSchemas;
