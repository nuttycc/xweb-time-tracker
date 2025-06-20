/**
 * 混合验证中间件
 * 支持Zod验证和手动验证的混合使用，提供灵活的验证策略
 *
 * 功能包括：
 * - 手动验证器实现
 * - 复合验证器实现
 * - 验证器管理器
 * - 中间件系统
 * - 性能监控
 */

import type { z } from 'zod/v4';
import type {
  IManualValidator,
  ICompositeValidator,
  IValidatorFactory,
  IValidatorRegistry,
  IValidatorManager,
  IValidatorMiddleware,
  IValidatorMetrics,
  ValidationResult,
  ValidationError,
  ValidatorOptions,
  IValidator,
} from './base-validator';
import { ValidatorType } from './base-validator';
import { ZodValidator } from './zod-validator';

/**
 * 手动验证器实现
 */
export class ManualValidator<TInput = unknown, TOutput = TInput>
  implements IManualValidator<TInput, TOutput>
{
  readonly type = ValidatorType.MANUAL;
  readonly name: string;
  readonly validateFn: (input: TInput, options?: ValidatorOptions) => ValidationResult<TOutput>;
  readonly validateAsyncFn?: (
    input: TInput,
    options?: ValidatorOptions
  ) => Promise<ValidationResult<TOutput>>;

  constructor(
    validateFn: (input: TInput, options?: ValidatorOptions) => ValidationResult<TOutput>,
    name?: string,
    validateAsyncFn?: (
      input: TInput,
      options?: ValidatorOptions
    ) => Promise<ValidationResult<TOutput>>
  ) {
    this.validateFn = validateFn;
    this.validateAsyncFn = validateAsyncFn;
    this.name = name || `ManualValidator_${Date.now()}`;
  }

  /**
   * 验证数据
   */
  validate(input: TInput, options: ValidatorOptions = {}): ValidationResult<TOutput> {
    try {
      const startTime = options.debug ? performance.now() : 0;

      const result = this.validateFn(input, options);

      if (options.debug) {
        const duration = performance.now() - startTime;
        console.debug(`[ManualValidator] ${this.name} validation took ${duration.toFixed(2)}ms`);
      }

      return {
        ...result,
        input,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: error instanceof Error ? error.message : '手动验证过程中发生错误',
          code: 'MANUAL_VALIDATION_ERROR',
          originalError: error,
        },
        input,
      };
    }
  }

  /**
   * 异步验证数据
   */
  async validateAsync(
    input: TInput,
    options: ValidatorOptions = {}
  ): Promise<ValidationResult<TOutput>> {
    if (this.validateAsyncFn) {
      try {
        const result = await this.validateAsyncFn(input, options);
        return {
          ...result,
          input,
        };
      } catch (error) {
        return {
          success: false,
          error: {
            message: error instanceof Error ? error.message : '异步手动验证过程中发生错误',
            code: 'ASYNC_MANUAL_VALIDATION_ERROR',
            originalError: error,
          },
          input,
        };
      }
    } else {
      // 如果没有异步验证函数，使用同步验证
      return Promise.resolve(this.validate(input, options));
    }
  }

  /**
   * 安全验证
   */
  safeParse(input: TInput, options: ValidatorOptions = {}): ValidationResult<TOutput> {
    return this.validate(input, options);
  }

  /**
   * 解析数据
   */
  parse(input: TInput, options: ValidatorOptions = {}): TOutput {
    const result = this.validate(input, options);

    if (result.success) {
      return result.data!;
    } else {
      const error = new Error(result.error!.message) as Error & {
        validationError: ValidationError;
      };
      error.validationError = result.error!;
      throw error;
    }
  }

  /**
   * 检查数据是否有效
   */
  isValid(input: TInput, options: ValidatorOptions = {}): boolean {
    return this.validate(input, options).success;
  }

  /**
   * 获取验证器描述
   */
  describe(): string {
    return `ManualValidator(${this.name})`;
  }
}

/**
 * 复合验证器实现
 */
export class CompositeValidator<TInput = unknown, TOutput = TInput>
  implements ICompositeValidator<TInput, TOutput>
{
  readonly type = ValidatorType.HYBRID;
  readonly name: string;
  readonly validators: IValidator[] = [];
  readonly strategy: 'all' | 'any' | 'sequence';

  constructor(
    validators: IValidator[],
    strategy: 'all' | 'any' | 'sequence' = 'all',
    name?: string
  ) {
    this.validators = [...validators];
    this.strategy = strategy;
    this.name = name || `CompositeValidator_${Date.now()}`;
  }

  /**
   * 验证数据
   */
  validate(input: TInput, options: ValidatorOptions = {}): ValidationResult<TOutput> {
    const startTime = options.debug ? performance.now() : 0;

    try {
      let result: ValidationResult<TOutput>;

      switch (this.strategy) {
        case 'all':
          result = this.validateAll(input, options);
          break;
        case 'any':
          result = this.validateAny(input, options);
          break;
        case 'sequence':
          result = this.validateSequence(input, options);
          break;
        default:
          throw new Error(`Unknown validation strategy: ${this.strategy}`);
      }

      if (options.debug) {
        const duration = performance.now() - startTime;
        console.debug(`[CompositeValidator] ${this.name} validation took ${duration.toFixed(2)}ms`);
      }

      return result;
    } catch (error) {
      return {
        success: false,
        error: {
          message: error instanceof Error ? error.message : '复合验证过程中发生错误',
          code: 'COMPOSITE_VALIDATION_ERROR',
          originalError: error,
        },
        input,
      };
    }
  }

  /**
   * 异步验证数据
   */
  async validateAsync(
    input: TInput,
    options: ValidatorOptions = {}
  ): Promise<ValidationResult<TOutput>> {
    try {
      let result: ValidationResult<TOutput>;

      switch (this.strategy) {
        case 'all':
          result = await this.validateAllAsync(input, options);
          break;
        case 'any':
          result = await this.validateAnyAsync(input, options);
          break;
        case 'sequence':
          result = await this.validateSequenceAsync(input, options);
          break;
        default:
          throw new Error(`Unknown validation strategy: ${this.strategy}`);
      }

      return result;
    } catch (error) {
      return {
        success: false,
        error: {
          message: error instanceof Error ? error.message : '异步复合验证过程中发生错误',
          code: 'ASYNC_COMPOSITE_VALIDATION_ERROR',
          originalError: error,
        },
        input,
      };
    }
  }

  /**
   * 安全验证
   */
  safeParse(input: TInput, options: ValidatorOptions = {}): ValidationResult<TOutput> {
    return this.validate(input, options);
  }

  /**
   * 解析数据
   */
  parse(input: TInput, options: ValidatorOptions = {}): TOutput {
    const result = this.validate(input, options);

    if (result.success) {
      return result.data!;
    } else {
      const error = new Error(result.error!.message) as Error & {
        validationError: ValidationError;
      };
      error.validationError = result.error!;
      throw error;
    }
  }

  /**
   * 检查数据是否有效
   */
  isValid(input: TInput, options: ValidatorOptions = {}): boolean {
    return this.validate(input, options).success;
  }

  /**
   * 获取验证器描述
   */
  describe(): string {
    const validatorNames = this.validators.map(v => v.name).join(', ');
    return `CompositeValidator(${this.name})[${this.strategy}]: ${validatorNames}`;
  }

  /**
   * 添加验证器
   */
  addValidator(validator: IValidator): this {
    this.validators.push(validator);
    return this;
  }

  /**
   * 移除验证器
   */
  removeValidator(name: string): this {
    const index = this.validators.findIndex(v => v.name === name);
    if (index !== -1) {
      this.validators.splice(index, 1);
    }
    return this;
  }

  /**
   * 获取验证器
   */
  getValidator(name: string): IValidator | undefined {
    return this.validators.find(v => v.name === name);
  }

  /**
   * 验证所有（all策略）
   */
  private validateAll(input: TInput, options: ValidatorOptions): ValidationResult<TOutput> {
    const errors: ValidationError[] = [];
    let lastSuccessData: TOutput | undefined;

    for (const validator of this.validators) {
      const result = validator.validate(input, options);

      if (!result.success) {
        errors.push(result.error!);
        if (options.abortEarly) {
          break;
        }
      } else {
        lastSuccessData = result.data as TOutput;
      }
    }

    if (errors.length === 0) {
      return {
        success: true,
        data: lastSuccessData!,
        input,
      };
    } else {
      return {
        success: false,
        error: this.combineErrors(errors),
        input,
      };
    }
  }

  /**
   * 验证任一（any策略）
   */
  private validateAny(input: TInput, options: ValidatorOptions): ValidationResult<TOutput> {
    const errors: ValidationError[] = [];

    for (const validator of this.validators) {
      const result = validator.validate(input, options);

      if (result.success) {
        return {
          success: true,
          data: result.data as TOutput,
          input,
        };
      } else {
        errors.push(result.error!);
      }
    }

    return {
      success: false,
      error: this.combineErrors(errors, 'any'),
      input,
    };
  }

  /**
   * 序列验证（sequence策略）
   */
  private validateSequence(input: TInput, options: ValidatorOptions): ValidationResult<TOutput> {
    let currentData: unknown = input;

    for (const validator of this.validators) {
      const result = validator.validate(currentData, options);

      if (!result.success) {
        return {
          success: false,
          error: result.error!,
          input,
        };
      }

      currentData = result.data;
    }

    return {
      success: true,
      data: currentData as TOutput,
      input,
    };
  }

  /**
   * 异步验证所有
   */
  private async validateAllAsync(
    input: TInput,
    options: ValidatorOptions
  ): Promise<ValidationResult<TOutput>> {
    const errors: ValidationError[] = [];
    let lastSuccessData: TOutput | undefined;

    for (const validator of this.validators) {
      const result = await validator.validateAsync(input, options);

      if (!result.success) {
        errors.push(result.error!);
        if (options.abortEarly) {
          break;
        }
      } else {
        lastSuccessData = result.data as TOutput;
      }
    }

    if (errors.length === 0) {
      return {
        success: true,
        data: lastSuccessData!,
        input,
      };
    } else {
      return {
        success: false,
        error: this.combineErrors(errors),
        input,
      };
    }
  }

  /**
   * 异步验证任一
   */
  private async validateAnyAsync(
    input: TInput,
    options: ValidatorOptions
  ): Promise<ValidationResult<TOutput>> {
    const errors: ValidationError[] = [];

    for (const validator of this.validators) {
      const result = await validator.validateAsync(input, options);

      if (result.success) {
        return {
          success: true,
          data: result.data as TOutput,
          input,
        };
      } else {
        errors.push(result.error!);
      }
    }

    return {
      success: false,
      error: this.combineErrors(errors, 'any'),
      input,
    };
  }

  /**
   * 异步序列验证
   */
  private async validateSequenceAsync(
    input: TInput,
    options: ValidatorOptions
  ): Promise<ValidationResult<TOutput>> {
    let currentData: unknown = input;

    for (const validator of this.validators) {
      const result = await validator.validateAsync(currentData, options);

      if (!result.success) {
        return {
          success: false,
          error: result.error!,
          input,
        };
      }

      currentData = result.data;
    }

    return {
      success: true,
      data: currentData as TOutput,
      input,
    };
  }

  /**
   * 合并错误
   */
  private combineErrors(errors: ValidationError[], strategy?: string): ValidationError {
    if (errors.length === 1) {
      return errors[0];
    }

    const allDetails = errors.flatMap(error => error.details || []);
    const messages = errors.map(error => error.message);

    let mainMessage: string;
    if (strategy === 'any') {
      mainMessage = `所有验证器都失败了：${messages.join('; ')}`;
    } else {
      mainMessage = `验证失败：${messages.join('; ')}`;
    }

    return {
      message: mainMessage,
      code: 'COMPOSITE_VALIDATION_ERROR',
      details: allDetails,
      originalError: errors,
    };
  }
}

/**
 * 验证器工厂实现
 */
export class ValidatorFactory implements IValidatorFactory {
  /**
   * 创建Zod验证器
   */
  createZodValidator<T>(schema: z.ZodType, name?: string): ZodValidator<unknown, T> {
    return new ZodValidator<unknown, T>(schema, name);
  }

  /**
   * 创建手动验证器
   */
  createManualValidator<TInput, TOutput>(
    validateFn: (input: TInput, options?: ValidatorOptions) => ValidationResult<TOutput>,
    name?: string,
    validateAsyncFn?: (
      input: TInput,
      options?: ValidatorOptions
    ) => Promise<ValidationResult<TOutput>>
  ): ManualValidator<TInput, TOutput> {
    return new ManualValidator(validateFn, name, validateAsyncFn);
  }

  /**
   * 创建复合验证器
   */
  createCompositeValidator<TInput, TOutput>(
    validators: IValidator[],
    strategy: 'all' | 'any' | 'sequence',
    name?: string
  ): CompositeValidator<TInput, TOutput> {
    return new CompositeValidator<TInput, TOutput>(validators, strategy, name);
  }
}

/**
 * 验证器注册表实现
 */
export class ValidatorRegistry implements IValidatorRegistry {
  private validators = new Map<string, IValidator>();

  /**
   * 注册验证器
   */
  register(name: string, validator: IValidator): void {
    this.validators.set(name, validator);
  }

  /**
   * 获取验证器
   */
  get(name: string): IValidator | undefined {
    return this.validators.get(name);
  }

  /**
   * 检查验证器是否存在
   */
  has(name: string): boolean {
    return this.validators.has(name);
  }

  /**
   * 移除验证器
   */
  remove(name: string): boolean {
    return this.validators.delete(name);
  }

  /**
   * 获取所有验证器名称
   */
  getNames(): string[] {
    return Array.from(this.validators.keys());
  }

  /**
   * 清空注册表
   */
  clear(): void {
    this.validators.clear();
  }

  /**
   * 获取注册表统计信息
   */
  getStats(): { total: number; byType: Record<string, number> } {
    const total = this.validators.size;
    const byType: Record<string, number> = {};

    for (const validator of this.validators.values()) {
      const type = validator.type;
      byType[type] = (byType[type] || 0) + 1;
    }

    return { total, byType };
  }
}

/**
 * 验证器性能监控实现
 */
export class ValidatorMetrics implements IValidatorMetrics {
  private validations = new Map<
    string,
    {
      startTime: number;
      validatorName: string;
      inputSize?: number;
    }
  >();

  private stats = {
    totalValidations: 0,
    successfulValidations: 0,
    totalTime: 0,
    totalErrors: 0,
  };

  /**
   * 记录验证开始
   */
  startValidation(validatorName: string, inputSize?: number): string {
    const id = `${validatorName}_${Date.now()}_${Math.random()}`;
    this.validations.set(id, {
      startTime: performance.now(),
      validatorName,
      inputSize,
    });
    return id;
  }

  /**
   * 记录验证结束
   */
  endValidation(id: string, success: boolean, errorCount?: number): void {
    const validation = this.validations.get(id);
    if (!validation) {
      return;
    }

    const duration = performance.now() - validation.startTime;
    this.validations.delete(id);

    this.stats.totalValidations++;
    this.stats.totalTime += duration;

    if (success) {
      this.stats.successfulValidations++;
    } else {
      this.stats.totalErrors += errorCount || 1;
    }
  }

  /**
   * 获取性能统计
   */
  getStats(): {
    totalValidations: number;
    successRate: number;
    averageTime: number;
    errorRate: number;
  } {
    const { totalValidations, successfulValidations, totalTime, totalErrors } = this.stats;

    return {
      totalValidations,
      successRate: totalValidations > 0 ? successfulValidations / totalValidations : 0,
      averageTime: totalValidations > 0 ? totalTime / totalValidations : 0,
      errorRate: totalValidations > 0 ? totalErrors / totalValidations : 0,
    };
  }

  /**
   * 重置统计
   */
  reset(): void {
    this.validations.clear();
    this.stats = {
      totalValidations: 0,
      successfulValidations: 0,
      totalTime: 0,
      totalErrors: 0,
    };
  }

  /**
   * 获取当前进行中的验证
   */
  getActiveValidations(): Array<{
    id: string;
    validatorName: string;
    duration: number;
    inputSize?: number;
  }> {
    const now = performance.now();
    return Array.from(this.validations.entries()).map(([id, validation]) => ({
      id,
      validatorName: validation.validatorName,
      duration: now - validation.startTime,
      inputSize: validation.inputSize,
    }));
  }
}

/**
 * 验证器管理器实现
 */
export class ValidatorManager implements IValidatorManager {
  readonly factory: IValidatorFactory;
  readonly registry: IValidatorRegistry;
  readonly middlewares: IValidatorMiddleware[] = [];
  private metrics: IValidatorMetrics;

  constructor() {
    this.factory = new ValidatorFactory();
    this.registry = new ValidatorRegistry();
    this.metrics = new ValidatorMetrics();
  }

  /**
   * 添加中间件
   */
  addMiddleware(middleware: IValidatorMiddleware): void {
    this.middlewares.push(middleware);
  }

  /**
   * 移除中间件
   */
  removeMiddleware(name: string): boolean {
    const index = this.middlewares.findIndex(m => m.name === name);
    if (index !== -1) {
      this.middlewares.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * 执行验证
   */
  validate<T>(
    validatorName: string,
    input: unknown,
    options: ValidatorOptions = {}
  ): ValidationResult<T> {
    const validator = this.registry.get(validatorName);
    if (!validator) {
      return {
        success: false,
        error: {
          message: `验证器 '${validatorName}' 未找到`,
          code: 'VALIDATOR_NOT_FOUND',
        },
        input,
      };
    }

    const metricsId = this.metrics.startValidation(validatorName, this.getInputSize(input));

    try {
      // 执行前置中间件
      let processedInput = input;
      for (const middleware of this.middlewares) {
        if (middleware.beforeValidation) {
          processedInput = middleware.beforeValidation(processedInput, options);
        }
      }

      // 执行验证
      let result = validator.validate(processedInput, options) as ValidationResult<T>;

      // 执行后置中间件
      for (const middleware of this.middlewares) {
        if (middleware.afterValidation) {
          result = middleware.afterValidation(result, processedInput, options);
        }
      }

      // 记录性能指标
      this.metrics.endValidation(metricsId, result.success, result.error?.details?.length);

      return result;
    } catch (error) {
      // 处理错误中间件
      let validationError: ValidationError = {
        message: error instanceof Error ? error.message : '验证过程中发生未知错误',
        code: 'VALIDATION_EXCEPTION',
        originalError: error,
      };

      for (const middleware of this.middlewares) {
        if (middleware.onError) {
          validationError = middleware.onError(validationError, input, options);
        }
      }

      this.metrics.endValidation(metricsId, false, 1);

      return {
        success: false,
        error: validationError,
        input,
      };
    }
  }

  /**
   * 执行异步验证
   */
  async validateAsync<T>(
    validatorName: string,
    input: unknown,
    options: ValidatorOptions = {}
  ): Promise<ValidationResult<T>> {
    const validator = this.registry.get(validatorName);
    if (!validator) {
      return {
        success: false,
        error: {
          message: `验证器 '${validatorName}' 未找到`,
          code: 'VALIDATOR_NOT_FOUND',
        },
        input,
      };
    }

    const metricsId = this.metrics.startValidation(validatorName, this.getInputSize(input));

    try {
      // 执行前置中间件
      let processedInput = input;
      for (const middleware of this.middlewares) {
        if (middleware.beforeValidation) {
          processedInput = middleware.beforeValidation(processedInput, options);
        }
      }

      // 执行异步验证
      let result = (await validator.validateAsync(processedInput, options)) as ValidationResult<T>;

      // 执行后置中间件
      for (const middleware of this.middlewares) {
        if (middleware.afterValidation) {
          result = middleware.afterValidation(result, processedInput, options);
        }
      }

      // 记录性能指标
      this.metrics.endValidation(metricsId, result.success, result.error?.details?.length);

      return result;
    } catch (error) {
      // 处理错误中间件
      let validationError: ValidationError = {
        message: error instanceof Error ? error.message : '异步验证过程中发生未知错误',
        code: 'ASYNC_VALIDATION_EXCEPTION',
        originalError: error,
      };

      for (const middleware of this.middlewares) {
        if (middleware.onError) {
          validationError = middleware.onError(validationError, input, options);
        }
      }

      this.metrics.endValidation(metricsId, false, 1);

      return {
        success: false,
        error: validationError,
        input,
      };
    }
  }

  /**
   * 获取性能指标
   */
  getMetrics(): IValidatorMetrics {
    return this.metrics;
  }

  /**
   * 获取输入数据大小（用于性能监控）
   */
  private getInputSize(input: unknown): number {
    try {
      return JSON.stringify(input).length;
    } catch {
      return 0;
    }
  }

  /**
   * 批量注册验证器
   */
  registerValidators(validators: Array<{ name: string; validator: IValidator }>): void {
    for (const { name, validator } of validators) {
      this.registry.register(name, validator);
    }
  }

  /**
   * 获取管理器状态
   */
  getStatus(): {
    registeredValidators: number;
    activeMiddlewares: number;
    performanceStats: ReturnType<IValidatorMetrics['getStats']>;
    registryStats: ReturnType<ValidatorRegistry['getStats']>;
  } {
    return {
      registeredValidators: this.registry.getNames().length,
      activeMiddlewares: this.middlewares.length,
      performanceStats: this.metrics.getStats(),
      registryStats: (this.registry as ValidatorRegistry).getStats(),
    };
  }
}

/**
 * 所有实现已通过 export class 导出
 */
