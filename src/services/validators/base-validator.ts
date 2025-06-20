/**
 * 验证器基础接口和类型定义
 * 提供统一的验证器接口，支持Zod验证和手动验证的混合使用
 *
 * 功能包括：
 * - 统一的验证接口
 * - 错误处理和格式化
 * - 验证结果类型定义
 * - 验证器组合和链式调用
 */

import type { z, ZodError } from 'zod/v4';

/**
 * 验证结果类型
 */
export interface ValidationResult<T = unknown> {
  /** 验证是否成功 */
  success: boolean;
  /** 验证后的数据（成功时） */
  data?: T;
  /** 错误信息（失败时） */
  error?: ValidationError;
  /** 原始输入数据 */
  input?: unknown;
}

/**
 * 验证错误类型
 */
export interface ValidationError {
  /** 错误消息 */
  message: string;
  /** 错误代码 */
  code?: string;
  /** 错误路径 */
  path?: PropertyKey[];
  /** 详细错误信息 */
  details?: ValidationErrorDetail[];
  /** 原始错误对象 */
  originalError?: unknown;
}

/**
 * 验证错误详情
 */
export interface ValidationErrorDetail {
  /** 字段路径 */
  path: PropertyKey[];
  /** 错误消息 */
  message: string;
  /** 错误代码 */
  code: string;
  /** 期望值 */
  expected?: unknown;
  /** 实际值 */
  received?: unknown;
}

/**
 * 验证器配置选项
 */
export interface ValidatorOptions {
  /** 是否启用严格模式 */
  strict?: boolean;
  /** 是否在第一个错误时停止验证 */
  abortEarly?: boolean;
  /** 自定义错误消息映射 */
  errorMessages?: Record<string, string>;
  /** 验证上下文 */
  context?: Record<string, unknown>;
  /** 是否启用调试模式 */
  debug?: boolean;
}

/**
 * 验证器类型枚举
 */
export enum ValidatorType {
  ZOD = 'zod',
  MANUAL = 'manual',
  HYBRID = 'hybrid',
}

/**
 * 基础验证器接口
 */
export interface IValidator<TInput = unknown, TOutput = TInput> {
  /** 验证器类型 */
  readonly type: ValidatorType;

  /** 验证器名称 */
  readonly name: string;

  /** 验证数据 */
  validate(input: TInput, options?: ValidatorOptions): ValidationResult<TOutput>;

  /** 异步验证数据 */
  validateAsync(input: TInput, options?: ValidatorOptions): Promise<ValidationResult<TOutput>>;

  /** 安全验证（不抛出异常） */
  safeParse(input: TInput, options?: ValidatorOptions): ValidationResult<TOutput>;

  /** 解析数据（抛出异常） */
  parse(input: TInput, options?: ValidatorOptions): TOutput;

  /** 检查数据是否有效 */
  isValid(input: TInput, options?: ValidatorOptions): boolean;

  /** 获取验证器描述 */
  describe(): string;
}

/**
 * Zod验证器接口
 */
export interface IZodValidator<TInput = unknown, TOutput = TInput>
  extends IValidator<TInput, TOutput> {
  /** Zod Schema */
  readonly schema: z.ZodType;

  /** 获取Schema类型信息 */
  getSchemaInfo(): {
    type: string;
    optional: boolean;
    nullable: boolean;
    description?: string;
  };
}

/**
 * 手动验证器接口
 */
export interface IManualValidator<TInput = unknown, TOutput = TInput>
  extends IValidator<TInput, TOutput> {
  /** 验证函数 */
  readonly validateFn: (input: TInput, options?: ValidatorOptions) => ValidationResult<TOutput>;

  /** 异步验证函数 */
  readonly validateAsyncFn?: (
    input: TInput,
    options?: ValidatorOptions
  ) => Promise<ValidationResult<TOutput>>;
}

/**
 * 复合验证器接口
 */
export interface ICompositeValidator<TInput = unknown, TOutput = TInput>
  extends IValidator<TInput, TOutput> {
  /** 子验证器列表 */
  readonly validators: IValidator[];

  /** 组合策略 */
  readonly strategy: 'all' | 'any' | 'sequence';

  /** 添加验证器 */
  addValidator(validator: IValidator): this;

  /** 移除验证器 */
  removeValidator(name: string): this;

  /** 获取验证器 */
  getValidator(name: string): IValidator | undefined;
}

/**
 * 验证器工厂接口
 */
export interface IValidatorFactory {
  /** 创建Zod验证器 */
  createZodValidator<T>(schema: z.ZodType, name?: string): IZodValidator<unknown, T>;

  /** 创建手动验证器 */
  createManualValidator<TInput, TOutput>(
    validateFn: (input: TInput, options?: ValidatorOptions) => ValidationResult<TOutput>,
    name?: string,
    validateAsyncFn?: (
      input: TInput,
      options?: ValidatorOptions
    ) => Promise<ValidationResult<TOutput>>
  ): IManualValidator<TInput, TOutput>;

  /** 创建复合验证器 */
  createCompositeValidator<TInput, TOutput>(
    validators: IValidator[],
    strategy: 'all' | 'any' | 'sequence',
    name?: string
  ): ICompositeValidator<TInput, TOutput>;
}

/**
 * 验证器注册表接口
 */
export interface IValidatorRegistry {
  /** 注册验证器 */
  register(name: string, validator: IValidator): void;

  /** 获取验证器 */
  get(name: string): IValidator | undefined;

  /** 检查验证器是否存在 */
  has(name: string): boolean;

  /** 移除验证器 */
  remove(name: string): boolean;

  /** 获取所有验证器名称 */
  getNames(): string[];

  /** 清空注册表 */
  clear(): void;
}

/**
 * 验证器中间件接口
 */
export interface IValidatorMiddleware {
  /** 中间件名称 */
  readonly name: string;

  /** 验证前处理 */
  beforeValidation?(input: unknown, options?: ValidatorOptions): unknown;

  /** 验证后处理 */
  afterValidation?<T>(
    result: ValidationResult<T>,
    input: unknown,
    options?: ValidatorOptions
  ): ValidationResult<T>;

  /** 错误处理 */
  onError?(error: ValidationError, input: unknown, options?: ValidatorOptions): ValidationError;
}

/**
 * 验证器管理器接口
 */
export interface IValidatorManager {
  /** 验证器工厂 */
  readonly factory: IValidatorFactory;

  /** 验证器注册表 */
  readonly registry: IValidatorRegistry;

  /** 中间件列表 */
  readonly middlewares: IValidatorMiddleware[];

  /** 添加中间件 */
  addMiddleware(middleware: IValidatorMiddleware): void;

  /** 移除中间件 */
  removeMiddleware(name: string): boolean;

  /** 执行验证 */
  validate<T>(
    validatorName: string,
    input: unknown,
    options?: ValidatorOptions
  ): ValidationResult<T>;

  /** 执行异步验证 */
  validateAsync<T>(
    validatorName: string,
    input: unknown,
    options?: ValidatorOptions
  ): Promise<ValidationResult<T>>;
}

/**
 * 错误格式化器接口
 */
export interface IErrorFormatter {
  /** 格式化Zod错误 */
  formatZodError(error: ZodError): ValidationError;

  /** 格式化通用错误 */
  formatError(error: unknown, context?: Record<string, unknown>): ValidationError;

  /** 格式化错误消息 */
  formatMessage(code: string, context?: Record<string, unknown>): string;
}

/**
 * 验证器性能监控接口
 */
export interface IValidatorMetrics {
  /** 记录验证开始 */
  startValidation(validatorName: string, inputSize?: number): string;

  /** 记录验证结束 */
  endValidation(id: string, success: boolean, errorCount?: number): void;

  /** 获取性能统计 */
  getStats(): {
    totalValidations: number;
    successRate: number;
    averageTime: number;
    errorRate: number;
  };

  /** 重置统计 */
  reset(): void;
}

/**
 * 验证器事件类型
 */
export enum ValidatorEvent {
  VALIDATION_START = 'validation:start',
  VALIDATION_SUCCESS = 'validation:success',
  VALIDATION_ERROR = 'validation:error',
  VALIDATION_END = 'validation:end',
  VALIDATOR_REGISTERED = 'validator:registered',
  VALIDATOR_REMOVED = 'validator:removed',
  MIDDLEWARE_ADDED = 'middleware:added',
  MIDDLEWARE_REMOVED = 'middleware:removed',
}

/**
 * 验证器事件数据
 */
export interface ValidatorEventData {
  validatorName?: string;
  input?: unknown;
  result?: ValidationResult;
  error?: ValidationError;
  duration?: number;
  middlewareName?: string;
}

/**
 * 验证器事件监听器接口
 */
export interface IValidatorEventListener {
  /** 监听验证器事件 */
  on(event: ValidatorEvent, listener: (data: ValidatorEventData) => void): void;

  /** 移除事件监听器 */
  off(event: ValidatorEvent, listener: (data: ValidatorEventData) => void): void;

  /** 触发事件 */
  emit(event: ValidatorEvent, data: ValidatorEventData): void;
}
