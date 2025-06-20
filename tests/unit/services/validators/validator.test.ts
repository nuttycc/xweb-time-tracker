/**
 * 验证器单元测试
 * 测试Zod验证器、手动验证器、复合验证器等功能
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod/v4';
import {
  ZodValidator,
  ZodErrorFormatter,
  ZodValidatorFactory,
} from '../../../../src/services/validators/zod-validator';
import {
  ManualValidator,
  CompositeValidator,
  ValidatorFactory,
  ValidatorRegistry,
  ValidatorManager,
  ValidatorMetrics,
} from '../../../../src/services/validators/hybrid-validator';
import type {
  ValidationResult,
  ValidatorOptions,
  IValidatorMiddleware,
} from '../../../../src/services/validators/base-validator';

describe('ZodValidator', () => {
  describe('基础验证功能', () => {
    it('应该成功验证有效数据', () => {
      const schema = z.object({
        name: z.string(),
        age: z.number().int().min(0),
      });
      const validator = new ZodValidator(schema, 'UserValidator');

      const input = { name: 'John', age: 25 };
      const result = validator.validate(input);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(input);
      expect(result.input).toEqual(input);
    });

    it('应该拒绝无效数据', () => {
      const schema = z.object({
        name: z.string(),
        age: z.number().int().min(0),
      });
      const validator = new ZodValidator(schema, 'UserValidator');

      const input = { name: 'John', age: -1 };
      const result = validator.validate(input);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe('VALIDATION_ERROR');
      expect(result.input).toEqual(input);
    });

    it('应该支持异步验证', async () => {
      const schema = z.string().refine(async val => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return val.length > 3;
      }, '字符串长度必须大于3');

      const validator = new ZodValidator(schema, 'AsyncValidator');

      const validResult = await validator.validateAsync('hello');
      expect(validResult.success).toBe(true);

      const invalidResult = await validator.validateAsync('hi');
      expect(invalidResult.success).toBe(false);
    });

    it('应该支持自定义错误消息', () => {
      const schema = z.string().min(3);
      const validator = new ZodValidator(schema, 'StringValidator');

      const options: ValidatorOptions = {
        errorMessages: {
          too_small: '自定义错误：字符串太短',
        },
      };

      const result = validator.validate('hi', options);
      expect(result.success).toBe(false);
      expect(result.error!.message).toContain('自定义错误');
    });
  });

  describe('Schema信息获取', () => {
    it('应该正确获取Schema类型信息', () => {
      const schema = z.string().optional();
      const validator = new ZodValidator(schema, 'OptionalStringValidator');

      const info = validator.getSchemaInfo();
      expect(info.type).toBe('string');
      expect(info.optional).toBe(true);
      expect(info.nullable).toBe(false);
    });

    it('应该正确描述验证器', () => {
      const schema = z.number().nullable();
      const validator = new ZodValidator(schema, 'NullableNumberValidator');

      const description = validator.describe();
      expect(description).toContain('NullableNumberValidator');
      expect(description).toContain('number');
      expect(description).toContain('null');
    });
  });

  describe('Schema转换', () => {
    it('应该支持transform', () => {
      const schema = z.string();
      const validator = new ZodValidator<string, string>(schema, 'StringValidator');

      const transformedValidator = validator.transform(str => str.toUpperCase());
      const result = transformedValidator.validate('hello');

      expect(result.success).toBe(true);
      expect(result.data).toBe('HELLO');
    });

    it('应该支持refine', () => {
      const schema = z.number();
      const validator = new ZodValidator<number, number>(schema, 'NumberValidator');

      const refinedValidator = validator.refine(num => num > 0, '数字必须大于0');

      const validResult = refinedValidator.validate(5);
      expect(validResult.success).toBe(true);

      const invalidResult = refinedValidator.validate(-1);
      expect(invalidResult.success).toBe(false);
    });

    it('应该支持optional和nullable', () => {
      const schema = z.string();
      const validator = new ZodValidator(schema, 'StringValidator');

      const optionalValidator = validator.optional();
      const optionalResult = optionalValidator.validate(undefined);
      expect(optionalResult.success).toBe(true);

      const nullableValidator = validator.nullable();
      const nullableResult = nullableValidator.validate(null);
      expect(nullableResult.success).toBe(true);
    });
  });
});

describe('ZodErrorFormatter', () => {
  it('应该正确格式化Zod错误', () => {
    const schema = z.object({
      name: z.string(),
      age: z.number().int().min(0),
    });

    const parseResult = schema.safeParse({ name: 123, age: -1 });
    expect(parseResult.success).toBe(false);

    if (!parseResult.success) {
      const formattedError = ZodErrorFormatter.formatZodError(parseResult.error);

      expect(formattedError.message).toBeDefined();
      expect(formattedError.code).toBe('VALIDATION_ERROR');
      expect(formattedError.details).toHaveLength(2);
      expect(formattedError.originalError).toBe(parseResult.error);
    }
  });

  it('应该格式化单个错误消息', () => {
    const issue: z.ZodIssue = {
      code: 'invalid_type',
      expected: 'string',
      path: ['name'],
      message: 'Expected string, received number',
      input: 123,
    };

    const formatted = ZodErrorFormatter.formatIssueMessage(issue);
    expect(formatted).toContain('name');
    expect(formatted).toContain('string');
  });
});

describe('ZodValidatorFactory', () => {
  it('应该创建不同类型的验证器', () => {
    const stringValidator = ZodValidatorFactory.string('StringValidator');
    expect(stringValidator.name).toBe('StringValidator');
    expect(stringValidator.isValid('hello')).toBe(true);
    expect(stringValidator.isValid(123)).toBe(false);

    const numberValidator = ZodValidatorFactory.number('NumberValidator');
    expect(numberValidator.isValid(123)).toBe(true);
    expect(numberValidator.isValid('hello')).toBe(false);

    const booleanValidator = ZodValidatorFactory.boolean('BooleanValidator');
    expect(booleanValidator.isValid(true)).toBe(true);
    expect(booleanValidator.isValid('true')).toBe(false);
  });

  it('应该创建对象和数组验证器', () => {
    const objectValidator = ZodValidatorFactory.object(
      {
        name: z.string(),
        age: z.number(),
      },
      'ObjectValidator'
    );

    expect(objectValidator.isValid({ name: 'John', age: 25 })).toBe(true);
    expect(objectValidator.isValid({ name: 'John' })).toBe(false);

    const arrayValidator = ZodValidatorFactory.array(z.string(), 'ArrayValidator');
    expect(arrayValidator.isValid(['a', 'b', 'c'])).toBe(true);
    expect(arrayValidator.isValid(['a', 1, 'c'])).toBe(false);
  });
});

describe('ManualValidator', () => {
  it('应该执行手动验证函数', () => {
    const validateFn = (input: string): ValidationResult<string> => {
      if (typeof input === 'string' && input.length > 3) {
        return { success: true, data: input.toUpperCase() };
      }
      return {
        success: false,
        error: {
          message: '字符串长度必须大于3',
          code: 'STRING_TOO_SHORT',
        },
      };
    };

    const validator = new ManualValidator(validateFn, 'ManualStringValidator');

    const validResult = validator.validate('hello');
    expect(validResult.success).toBe(true);
    expect(validResult.data).toBe('HELLO');

    const invalidResult = validator.validate('hi');
    expect(invalidResult.success).toBe(false);
    expect(invalidResult.error!.code).toBe('STRING_TOO_SHORT');
  });

  it('应该支持异步手动验证', async () => {
    const validateFn = (input: string): ValidationResult<string> => {
      return { success: true, data: input };
    };

    const validateAsyncFn = async (input: string): Promise<ValidationResult<string>> => {
      await new Promise(resolve => setTimeout(resolve, 10));
      if (input === 'async') {
        return { success: true, data: 'ASYNC_RESULT' };
      }
      return {
        success: false,
        error: {
          message: '异步验证失败',
          code: 'ASYNC_VALIDATION_FAILED',
        },
      };
    };

    const validator = new ManualValidator(validateFn, 'AsyncManualValidator', validateAsyncFn);

    const validResult = await validator.validateAsync('async');
    expect(validResult.success).toBe(true);
    expect(validResult.data).toBe('ASYNC_RESULT');

    const invalidResult = await validator.validateAsync('invalid');
    expect(invalidResult.success).toBe(false);
  });

  it('应该处理验证函数中的异常', () => {
    const validateFn = (): ValidationResult<any> => {
      throw new Error('验证函数异常');
    };

    const validator = new ManualValidator(validateFn, 'ErrorValidator');
    const result = validator.validate('test');

    expect(result.success).toBe(false);
    expect(result.error!.code).toBe('MANUAL_VALIDATION_ERROR');
    expect(result.error!.message).toContain('验证函数异常');
  });
});

describe('CompositeValidator', () => {
  let stringValidator: ZodValidator;
  let lengthValidator: ManualValidator<string, string>;

  beforeEach(() => {
    stringValidator = new ZodValidator(z.string(), 'StringValidator');
    lengthValidator = new ManualValidator<string, string>((input: string) => {
      if (input.length >= 3) {
        return { success: true, data: input };
      }
      return {
        success: false,
        error: {
          message: '字符串长度必须至少为3',
          code: 'STRING_TOO_SHORT',
        },
      };
    }, 'LengthValidator');
  });

  describe('all策略', () => {
    it('应该要求所有验证器都通过', () => {
      const composite = new CompositeValidator(
        [stringValidator, lengthValidator],
        'all',
        'AllValidator'
      );

      const validResult = composite.validate('hello');
      expect(validResult.success).toBe(true);

      const invalidResult = composite.validate('hi');
      expect(invalidResult.success).toBe(false);

      const typeErrorResult = composite.validate(123);
      expect(typeErrorResult.success).toBe(false);
    });
  });

  describe('any策略', () => {
    it('应该只要求任一验证器通过', () => {
      const alwaysFailValidator = new ManualValidator<any, any>(
        () => ({
          success: false,
          error: { message: '总是失败', code: 'ALWAYS_FAIL' },
        }),
        'AlwaysFailValidator'
      );

      const composite = new CompositeValidator(
        [alwaysFailValidator, stringValidator],
        'any',
        'AnyValidator'
      );

      const validResult = composite.validate('hello');
      expect(validResult.success).toBe(true);

      const invalidResult = composite.validate(123);
      expect(invalidResult.success).toBe(false);
    });
  });

  describe('sequence策略', () => {
    it('应该按顺序执行验证器并传递数据', () => {
      const upperCaseValidator = new ManualValidator<string, string>(
        (input: string) => ({
          success: true,
          data: input.toUpperCase(),
        }),
        'UpperCaseValidator'
      );

      const composite = new CompositeValidator(
        [stringValidator, upperCaseValidator],
        'sequence',
        'SequenceValidator'
      );

      const result = composite.validate('hello');
      expect(result.success).toBe(true);
      expect(result.data).toBe('HELLO');
    });
  });

  it('应该支持添加和移除验证器', () => {
    const composite = new CompositeValidator([], 'all', 'DynamicValidator');

    expect(composite.validators).toHaveLength(0);

    composite.addValidator(stringValidator);
    expect(composite.validators).toHaveLength(1);

    composite.addValidator(lengthValidator);
    expect(composite.validators).toHaveLength(2);

    composite.removeValidator('StringValidator');
    expect(composite.validators).toHaveLength(1);
    expect(composite.getValidator('LengthValidator')).toBeDefined();
    expect(composite.getValidator('StringValidator')).toBeUndefined();
  });
});

describe('ValidatorFactory', () => {
  let factory: ValidatorFactory;

  beforeEach(() => {
    factory = new ValidatorFactory();
  });

  it('应该创建Zod验证器', () => {
    const schema = z.string();
    const validator = factory.createZodValidator(schema, 'TestZodValidator');

    expect(validator.name).toBe('TestZodValidator');
    expect(validator.type).toBe('zod');
    expect(validator.isValid('hello')).toBe(true);
    expect(validator.isValid(123)).toBe(false);
  });

  it('应该创建手动验证器', () => {
    const validateFn = (input: number): ValidationResult<number> => {
      if (typeof input === 'number' && input > 0) {
        return { success: true, data: input * 2 };
      }
      return {
        success: false,
        error: { message: '必须是正数', code: 'NOT_POSITIVE' },
      };
    };

    const validator = factory.createManualValidator(validateFn, 'TestManualValidator');

    expect(validator.name).toBe('TestManualValidator');
    expect(validator.type).toBe('manual');

    const validResult = validator.validate(5);
    expect(validResult.success).toBe(true);
    expect(validResult.data).toBe(10);

    const invalidResult = validator.validate(-1);
    expect(invalidResult.success).toBe(false);
  });

  it('应该创建复合验证器', () => {
    const validator1 = factory.createZodValidator(z.string(), 'StringValidator');
    const validator2 = factory.createManualValidator(
      (input: string) =>
        input.length > 3
          ? { success: true, data: input }
          : { success: false, error: { message: '太短', code: 'TOO_SHORT' } },
      'LengthValidator'
    );

    const composite = factory.createCompositeValidator(
      [validator1, validator2],
      'all',
      'TestCompositeValidator'
    );

    expect(composite.name).toBe('TestCompositeValidator');
    expect(composite.type).toBe('hybrid');
    expect(composite.strategy).toBe('all');
    expect(composite.validators).toHaveLength(2);
  });
});

describe('ValidatorRegistry', () => {
  let registry: ValidatorRegistry;
  let validator: ZodValidator;

  beforeEach(() => {
    registry = new ValidatorRegistry();
    validator = new ZodValidator(z.string(), 'TestValidator');
  });

  it('应该注册和获取验证器', () => {
    expect(registry.has('TestValidator')).toBe(false);

    registry.register('TestValidator', validator);
    expect(registry.has('TestValidator')).toBe(true);

    const retrieved = registry.get('TestValidator');
    expect(retrieved).toBe(validator);
  });

  it('应该移除验证器', () => {
    registry.register('TestValidator', validator);
    expect(registry.has('TestValidator')).toBe(true);

    const removed = registry.remove('TestValidator');
    expect(removed).toBe(true);
    expect(registry.has('TestValidator')).toBe(false);

    const notRemoved = registry.remove('NonExistentValidator');
    expect(notRemoved).toBe(false);
  });

  it('应该获取所有验证器名称', () => {
    registry.register('Validator1', validator);
    registry.register('Validator2', validator);

    const names = registry.getNames();
    expect(names).toHaveLength(2);
    expect(names).toContain('Validator1');
    expect(names).toContain('Validator2');
  });

  it('应该清空注册表', () => {
    registry.register('Validator1', validator);
    registry.register('Validator2', validator);
    expect(registry.getNames()).toHaveLength(2);

    registry.clear();
    expect(registry.getNames()).toHaveLength(0);
  });

  it('应该提供统计信息', () => {
    const zodValidator = new ZodValidator(z.string(), 'ZodValidator');
    const manualValidator = new ManualValidator(() => ({ success: true }), 'ManualValidator');

    registry.register('ZodValidator', zodValidator);
    registry.register('ManualValidator', manualValidator);

    const stats = registry.getStats();
    expect(stats.total).toBe(2);
    expect(stats.byType.zod).toBe(1);
    expect(stats.byType.manual).toBe(1);
  });
});

describe('ValidatorMetrics', () => {
  let metrics: ValidatorMetrics;

  beforeEach(() => {
    metrics = new ValidatorMetrics();
  });

  it('应该记录验证性能', async () => {
    const id1 = metrics.startValidation('TestValidator', 100);
    const id2 = metrics.startValidation('AnotherValidator', 200);

    // 模拟一些处理时间
    await new Promise(resolve =>
      setTimeout(() => {
        metrics.endValidation(id1, true);
        metrics.endValidation(id2, false, 2);
        resolve(undefined);
      }, 10)
    );

    // 等待统计更新
    await new Promise(resolve => setTimeout(resolve, 10));

    const stats = metrics.getStats();
    expect(stats.totalValidations).toBe(2);
    expect(stats.successRate).toBe(0.5);
    expect(stats.errorRate).toBe(1); // 2 errors / 2 validations
    expect(stats.averageTime).toBeGreaterThan(0);
  });

  it('应该跟踪活跃验证', () => {
    const id = metrics.startValidation('TestValidator', 100);

    const active = metrics.getActiveValidations();
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe(id);
    expect(active[0].validatorName).toBe('TestValidator');
    expect(active[0].inputSize).toBe(100);

    metrics.endValidation(id, true);

    const activeAfter = metrics.getActiveValidations();
    expect(activeAfter).toHaveLength(0);
  });

  it('应该重置统计', () => {
    const id = metrics.startValidation('TestValidator');
    metrics.endValidation(id, true);

    let stats = metrics.getStats();
    expect(stats.totalValidations).toBe(1);

    metrics.reset();

    stats = metrics.getStats();
    expect(stats.totalValidations).toBe(0);
    expect(stats.successRate).toBe(0);
    expect(stats.averageTime).toBe(0);
    expect(stats.errorRate).toBe(0);
  });
});

describe('ValidatorManager', () => {
  let manager: ValidatorManager;

  beforeEach(() => {
    manager = new ValidatorManager();
  });

  it('应该注册和使用验证器', () => {
    const validator = new ZodValidator(z.string(), 'StringValidator');
    manager.registry.register('StringValidator', validator);

    const validResult = manager.validate('StringValidator', 'hello');
    expect(validResult.success).toBe(true);
    expect(validResult.data).toBe('hello');

    const invalidResult = manager.validate('StringValidator', 123);
    expect(invalidResult.success).toBe(false);
  });

  it('应该处理不存在的验证器', () => {
    const result = manager.validate('NonExistentValidator', 'test');
    expect(result.success).toBe(false);
    expect(result.error!.code).toBe('VALIDATOR_NOT_FOUND');
  });

  it('应该支持中间件', () => {
    const middleware: IValidatorMiddleware = {
      name: 'TestMiddleware',
      beforeValidation: input => {
        return typeof input === 'string' ? input.toUpperCase() : input;
      },
      afterValidation: result => {
        if (result.success && typeof result.data === 'string') {
          return {
            ...result,
            data: `PROCESSED_${result.data}` as any,
          };
        }
        return result;
      },
    };

    manager.addMiddleware(middleware);

    const validator = new ZodValidator(z.string(), 'StringValidator');
    manager.registry.register('StringValidator', validator);

    const result = manager.validate('StringValidator', 'hello');
    expect(result.success).toBe(true);
    expect(result.data).toBe('PROCESSED_HELLO');
  });

  it('应该支持异步验证', async () => {
    const schema = z.string().refine(async val => {
      await new Promise(resolve => setTimeout(resolve, 10));
      return val.length > 3;
    });

    const validator = new ZodValidator(schema, 'AsyncValidator');
    manager.registry.register('AsyncValidator', validator);

    const validResult = await manager.validateAsync('AsyncValidator', 'hello');
    expect(validResult.success).toBe(true);

    const invalidResult = await manager.validateAsync('AsyncValidator', 'hi');
    expect(invalidResult.success).toBe(false);
  });

  it('应该提供状态信息', () => {
    const validator = new ZodValidator(z.string(), 'StringValidator');
    manager.registry.register('StringValidator', validator);

    const middleware: IValidatorMiddleware = {
      name: 'TestMiddleware',
    };
    manager.addMiddleware(middleware);

    const status = manager.getStatus();
    expect(status.registeredValidators).toBe(1);
    expect(status.activeMiddlewares).toBe(1);
    expect(status.performanceStats).toBeDefined();
    expect(status.registryStats).toBeDefined();
  });

  it('应该批量注册验证器', () => {
    const validators = [
      { name: 'StringValidator', validator: new ZodValidator(z.string(), 'StringValidator') },
      { name: 'NumberValidator', validator: new ZodValidator(z.number(), 'NumberValidator') },
    ];

    manager.registerValidators(validators);

    expect(manager.registry.has('StringValidator')).toBe(true);
    expect(manager.registry.has('NumberValidator')).toBe(true);
  });
});
