/**
 * Zod验证器实现
 * 基于Zod Schema的验证器，提供类型安全的数据验证
 *
 * 功能包括：
 * - Zod Schema验证
 * - 错误格式化和本地化
 * - 性能优化和缓存
 * - 调试和监控支持
 */

import { z, type ZodError } from 'zod/v4';
import type {
  IZodValidator,
  ValidationResult,
  ValidationError,
  ValidatorOptions,
} from './base-validator';
import { ValidatorType } from './base-validator';

/**
 * Zod错误格式化器
 */
export class ZodErrorFormatter {
  /**
   * 格式化Zod错误为统一的验证错误格式
   */
  static formatZodError(error: ZodError): ValidationError {
    const details = error.issues.map(issue => ({
      path: issue.path,
      message: issue.message,
      code: issue.code,
      expected: 'expected' in issue ? issue.expected : undefined,
    }));

    return {
      message: ZodErrorFormatter.getMainErrorMessage(error),
      code: 'VALIDATION_ERROR',
      path: error.issues[0]?.path || [],
      details,
      originalError: error,
    };
  }

  /**
   * 获取主要错误消息
   */
  private static getMainErrorMessage(error: ZodError): string {
    if (error.issues.length === 1) {
      return error.issues[0].message;
    }

    return `验证失败：发现 ${error.issues.length} 个错误`;
  }

  /**
   * 格式化单个错误消息
   */
  static formatIssueMessage(issue: z.ZodIssue): string {
    const path = issue.path.length > 0 ? issue.path.join('.') : '根对象';

    switch (issue.code) {
      case 'invalid_type':
        return `${path}: 期望类型为 ${issue.expected}`;
      case 'invalid_format':
        return `${path}: 格式无效，期望为 ${issue.format}`;
      case 'too_small':
        return `${path}: 值太小，最小值为 ${issue.minimum}`;
      case 'too_big':
        return `${path}: 值太大，最大值为 ${issue.maximum}`;
      case 'invalid_value':
        return `${path}: 无效的值，允许的值为: ${issue.values?.join(', ')}`;
      case 'unrecognized_keys':
        return `${path}: 包含未识别的键: ${issue.keys?.join(', ')}`;
      case 'invalid_union':
        return `${path}: 不匹配任何联合类型`;
      case 'custom':
        return issue.message || `${path}: 自定义验证失败`;
      default:
        return issue.message || `${path}: 验证失败`;
    }
  }
}

/**
 * Zod验证器实现
 */
export class ZodValidator<TInput = unknown, TOutput = TInput>
  implements IZodValidator<TInput, TOutput>
{
  readonly type = ValidatorType.ZOD;
  readonly schema: z.ZodType;
  readonly name: string;

  private _schemaInfo?: {
    type: string;
    optional: boolean;
    nullable: boolean;
    description?: string;
  };

  constructor(schema: z.ZodType, name?: string) {
    this.schema = schema;
    this.name = name || `ZodValidator_${Date.now()}`;
  }

  /**
   * 验证数据
   */
  validate(input: TInput, options: ValidatorOptions = {}): ValidationResult<TOutput> {
    return this.safeParse(input, options);
  }

  /**
   * 异步验证数据
   */
  async validateAsync(
    input: TInput,
    options: ValidatorOptions = {}
  ): Promise<ValidationResult<TOutput>> {
    try {
      // Zod的异步验证
      const result = await this.schema.safeParseAsync(input);

      if (result.success) {
        return {
          success: true,
          data: result.data as TOutput,
          input,
        };
      } else {
        return {
          success: false,
          error: ZodErrorFormatter.formatZodError(result.error),
          input,
        };
      }
    } catch (error) {
      return {
        success: false,
        error: {
          message: error instanceof Error ? error.message : '未知错误',
          code: 'ASYNC_VALIDATION_ERROR',
          originalError: error,
        },
        input,
      };
    }
  }

  /**
   * 安全验证（不抛出异常）
   */
  safeParse(input: TInput, options: ValidatorOptions = {}): ValidationResult<TOutput> {
    try {
      const startTime = options.debug ? performance.now() : 0;

      const result = this.schema.safeParse(input);

      if (options.debug) {
        const duration = performance.now() - startTime;
        console.debug(`[ZodValidator] ${this.name} validation took ${duration.toFixed(2)}ms`);
      }

      if (result.success) {
        return {
          success: true,
          data: result.data as TOutput,
          input,
        };
      } else {
        const formattedError = ZodErrorFormatter.formatZodError(result.error);

        // 应用自定义错误消息
        if (options.errorMessages) {
          formattedError.message = this.applyCustomErrorMessages(
            formattedError,
            options.errorMessages
          );
        }

        return {
          success: false,
          error: formattedError,
          input,
        };
      }
    } catch (error) {
      return {
        success: false,
        error: {
          message: error instanceof Error ? error.message : '验证过程中发生未知错误',
          code: 'VALIDATION_EXCEPTION',
          originalError: error,
        },
        input,
      };
    }
  }

  /**
   * 解析数据（抛出异常）
   */
  parse(input: TInput, options: ValidatorOptions = {}): TOutput {
    const result = this.safeParse(input, options);

    if (result.success) {
      return result.data!;
    } else {
      const error = new Error(result.error!.message);
      (error as any).validationError = result.error;
      throw error;
    }
  }

  /**
   * 检查数据是否有效
   */
  isValid(input: TInput, options: ValidatorOptions = {}): boolean {
    return this.safeParse(input, options).success;
  }

  /**
   * 获取验证器描述
   */
  describe(): string {
    const info = this.getSchemaInfo();
    return `ZodValidator(${this.name}): ${info.type}${info.optional ? '?' : ''}${info.nullable ? ' | null' : ''}`;
  }

  /**
   * 获取Schema类型信息
   */
  getSchemaInfo(): {
    type: string;
    optional: boolean;
    nullable: boolean;
    description?: string;
  } {
    if (this._schemaInfo) {
      return this._schemaInfo;
    }

    let schema: z.ZodType = this.schema;
    const optional = schema.isOptional();
    const nullable = schema.isNullable();

    // Helper function to get schema definition (supports both Zod v3 and v4)
    const getTypeName = (schema: z.ZodType): string => {
      // Zod v4: use _zod.def.type
      if ('_zod' in schema && (schema as any)._zod?.def?.type) {
        return (schema as any)._zod.def.type;
      }

      // Zod v3: use _def.typeName
      if ((schema as any)._def?.typeName) {
        return (schema as any)._def.typeName;
      }

      return 'unknown';
    };

    // Unwrap optional and nullable schemas to get the base schema
    while (true) {
      const currentTypeName = getTypeName(schema);
      if (
        currentTypeName === 'ZodOptional' ||
        currentTypeName === 'optional' ||
        currentTypeName === 'ZodNullable' ||
        currentTypeName === 'nullable'
      ) {
        schema = (schema as z.ZodOptional<any> | z.ZodNullable<any>).unwrap();
      } else {
        break;
      }
    }

    const rawTypeName = getTypeName(schema);
    // Convert type name to consistent format
    const type = rawTypeName.startsWith('Zod')
      ? rawTypeName.replace('Zod', '').toLowerCase()
      : rawTypeName;

    const description = schema.description;

    this._schemaInfo = { type, optional, nullable, description };
    return this._schemaInfo;
  }

  /**
   * 应用自定义错误消息
   */
  private applyCustomErrorMessages(
    error: ValidationError,
    customMessages: Record<string, string>
  ): string {
    if (error.details && error.details.length > 0) {
      const firstDetail = error.details[0];
      const pathKey = firstDetail.path.join('.');
      const codeKey = firstDetail.code;

      // 优先使用路径特定的消息
      if (customMessages[pathKey]) {
        return customMessages[pathKey];
      }

      // 其次使用错误代码特定的消息
      if (customMessages[codeKey]) {
        return customMessages[codeKey];
      }
    }

    return error.message;
  }

  /**
   * 创建带转换的验证器
   */
  transform<U>(transformer: (data: TOutput) => U): ZodValidator<TInput, U> {
    const transformedSchema = (this.schema as z.ZodType<TOutput>).transform(transformer);
    return new ZodValidator<TInput, U>(transformedSchema, `${this.name}_transformed`);
  }

  /**
   * 创建带细化的验证器
   */
  refine(
    refinement: (data: TOutput) => boolean,
    message?: string | { message: string; path?: (string | number)[] }
  ): ZodValidator<TInput, TOutput> {
    const refinedSchema = (this.schema as z.ZodType<TOutput>).refine(refinement, message);
    return new ZodValidator<TInput, TOutput>(refinedSchema, `${this.name}_refined`);
  }

  /**
   * 创建可选的验证器
   */
  optional(): ZodValidator<TInput | undefined, TOutput | undefined> {
    const optionalSchema = this.schema.optional();
    return new ZodValidator<TInput | undefined, TOutput | undefined>(
      optionalSchema,
      `${this.name}_optional`
    );
  }

  /**
   * 创建可空的验证器
   */
  nullable(): ZodValidator<TInput | null, TOutput | null> {
    const nullableSchema = this.schema.nullable();
    return new ZodValidator<TInput | null, TOutput | null>(nullableSchema, `${this.name}_nullable`);
  }

  /**
   * 创建带默认值的验证器
   */
  default(defaultValue: TOutput): ZodValidator<TInput | undefined, TOutput> {
    const defaultSchema = this.schema.default(defaultValue);
    return new ZodValidator<TInput | undefined, TOutput>(defaultSchema, `${this.name}_default`);
  }

  /**
   * 获取Schema的JSON表示（用于调试）
   */
  toJSON(): object {
    return {
      name: this.name,
      type: this.type,
      schemaInfo: this.getSchemaInfo(),
      description: this.describe(),
    };
  }
}

/**
 * Zod验证器工厂函数
 */
export class ZodValidatorFactory {
  /**
   * 从Schema创建验证器
   */
  static fromSchema<T>(schema: z.ZodType, name?: string): ZodValidator<unknown, T> {
    return new ZodValidator<unknown, T>(schema, name);
  }

  /**
   * 创建对象验证器
   */
  static object<T extends Record<string, any>>(
    shape: { [K in keyof T]: z.ZodType },
    name?: string
  ): ZodValidator<unknown, T> {
    const schema = z.object(shape);
    return new ZodValidator<unknown, T>(schema, name || 'ObjectValidator');
  }

  /**
   * 创建数组验证器
   */
  static array<T>(itemSchema: z.ZodType, name?: string): ZodValidator<unknown, T[]> {
    const schema = z.array(itemSchema);
    return new ZodValidator<unknown, T[]>(schema, name || 'ArrayValidator');
  }

  /**
   * 创建字符串验证器
   */
  static string(name?: string): ZodValidator<unknown, string> {
    return new ZodValidator<unknown, string>(z.string(), name || 'StringValidator');
  }

  /**
   * 创建数字验证器
   */
  static number(name?: string): ZodValidator<unknown, number> {
    return new ZodValidator<unknown, number>(z.number(), name || 'NumberValidator');
  }

  /**
   * 创建布尔验证器
   */
  static boolean(name?: string): ZodValidator<unknown, boolean> {
    return new ZodValidator<unknown, boolean>(z.boolean(), name || 'BooleanValidator');
  }
}

/**
 * 导出类型和实现
 * 注意：ZodValidator 是类，需要作为值导出，不是类型导出
 */
