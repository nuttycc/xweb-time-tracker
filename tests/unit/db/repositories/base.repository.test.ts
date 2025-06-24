/**
 * BaseRepository Unit Tests
 *
 * Tests for the base repository class functionality including CRUD operations,
 * error handling, validation, and type safety.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Dexie from 'dexie';
import {
  BaseRepository,
  RepositoryError,
  ValidationError,
} from '@/db/repositories/base.repository';
import type { EntityTable, IDType } from 'dexie';

// Test entity interface
interface TestEntity {
  id?: number;
  name: string;
  value: number;
  createdAt: number;
}

// Test repository implementation
class TestRepository extends BaseRepository<TestEntity, 'id'> {
  constructor(db: TestDB) {
    // Direct use of EntityTable without type assertion
    super(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any, // Simplified for testing
      db.testTable as EntityTable<TestEntity, 'id'>,
      'test_table'
    );
  }

  protected async validateForCreate(entity: TestEntity): Promise<void> {
    if (!entity.name || entity.name.trim() === '') {
      throw new ValidationError('Name is required');
    }
    if (entity.value < 0) {
      throw new ValidationError('Value must be non-negative');
    }
  }

  protected async validateForUpdate(
    id: IDType<TestEntity, 'id'>,
    changes: Partial<TestEntity>
  ): Promise<void> {
    if (changes.name !== undefined && (!changes.name || changes.name.trim() === '')) {
      throw new ValidationError('Name cannot be empty');
    }
    if (changes.value !== undefined && changes.value < 0) {
      throw new ValidationError('Value must be non-negative');
    }
  }

  protected async validateForUpsert(entity: TestEntity): Promise<void> {
    await this.validateForCreate(entity);
  }
}

// Test database class
class TestDB extends Dexie {
  public testTable!: EntityTable<TestEntity, 'id'>;

  constructor() {
    super('TestDB');
    this.version(1).stores({
      testTable: '++id, name, value, createdAt',
    });
  }
}

describe('BaseRepository', () => {
  let db: TestDB;
  let repository: TestRepository;

  beforeEach(async () => {
    db = new TestDB();
    repository = new TestRepository(db);
    await db.testTable.clear();
  });

  afterEach(async () => {
    await db.delete();
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new entity successfully', async () => {
      const entity: TestEntity = {
        name: 'Test Entity',
        value: 100,
        createdAt: Date.now(),
      };

      const id = await repository.create(entity);

      expect(id).toBeDefined();
      expect(typeof id).toBe('number');

      const created = await repository.findById(id);
      expect(created).toBeDefined();
      expect(created!.name).toBe(entity.name);
      expect(created!.value).toBe(entity.value);
    });

    it('should throw ValidationError for invalid entity', async () => {
      const invalidEntity: TestEntity = {
        name: '', // Invalid: empty name
        value: 100,
        createdAt: Date.now(),
      };

      await expect(repository.create(invalidEntity)).rejects.toThrow(ValidationError);
      await expect(repository.create(invalidEntity)).rejects.toThrow('Name is required');
    });

    it('should throw ValidationError for negative value', async () => {
      const invalidEntity: TestEntity = {
        name: 'Test',
        value: -1, // Invalid: negative value
        createdAt: Date.now(),
      };

      await expect(repository.create(invalidEntity)).rejects.toThrow(ValidationError);
      await expect(repository.create(invalidEntity)).rejects.toThrow('Value must be non-negative');
    });

    it('should handle database errors', async () => {
      // Mock the table.add method to throw an error
      const mockError = new Error('Database connection failed');
      vi.spyOn(db.testTable, 'add').mockImplementation(() => {
        return Promise.reject(mockError) as ReturnType<typeof db.testTable.add>;
      });

      const entity: TestEntity = {
        name: 'Test Entity',
        value: 100,
        createdAt: Date.now(),
      };

      await expect(repository.create(entity)).rejects.toThrow(RepositoryError);
    });
  });

  describe('findById', () => {
    it('should find entity by id', async () => {
      const entity: TestEntity = {
        name: 'Test Entity',
        value: 100,
        createdAt: Date.now(),
      };

      const id = await repository.create(entity);
      const found = await repository.findById(id);

      expect(found).toBeDefined();
      expect(found!.id).toBe(id);
      expect(found!.name).toBe(entity.name);
    });

    it('should return undefined for non-existent id', async () => {
      const found = await repository.findById(999);
      expect(found).toBeUndefined();
    });

    it('should handle database errors', async () => {
      const mockError = new Error('Database connection failed');
      vi.spyOn(db.testTable, 'get').mockImplementation(() => {
        return Promise.reject(mockError) as ReturnType<typeof db.testTable.get>;
      });

      await expect(repository.findById(1)).rejects.toThrow(RepositoryError);
    });
  });

  describe('update', () => {
    it('should update entity successfully', async () => {
      const entity: TestEntity = {
        name: 'Original Name',
        value: 100,
        createdAt: Date.now(),
      };

      const id = await repository.create(entity);
      const updateCount = await repository.update(id, { name: 'Updated Name', value: 200 });

      expect(updateCount).toBe(1);

      const updated = await repository.findById(id);
      expect(updated!.name).toBe('Updated Name');
      expect(updated!.value).toBe(200);
    });

    it('should throw ValidationError for invalid update data', async () => {
      const entity: TestEntity = {
        name: 'Test Entity',
        value: 100,
        createdAt: Date.now(),
      };

      const id = await repository.create(entity);

      await expect(repository.update(id, { name: '' })).rejects.toThrow(ValidationError);
      await expect(repository.update(id, { value: -1 })).rejects.toThrow(ValidationError);
    });
  });

  describe('delete', () => {
    it('should delete entity successfully', async () => {
      const entity: TestEntity = {
        name: 'Test Entity',
        value: 100,
        createdAt: Date.now(),
      };

      const id = await repository.create(entity);
      await repository.delete(id);

      const found = await repository.findById(id);
      expect(found).toBeUndefined();
    });

    it('should handle deletion of non-existent entity', async () => {
      // Should not throw error for non-existent entity
      await expect(repository.delete(999)).resolves.not.toThrow();
    });
  });

  describe('findAll', () => {
    it('should return all entities', async () => {
      const entities: TestEntity[] = [
        { name: 'Entity 1', value: 100, createdAt: Date.now() },
        { name: 'Entity 2', value: 200, createdAt: Date.now() },
        { name: 'Entity 3', value: 300, createdAt: Date.now() },
      ];

      for (const entity of entities) {
        await repository.create(entity);
      }

      const all = await repository.findAll();
      expect(all).toHaveLength(3);
      expect(all.map(e => e.name)).toEqual(['Entity 1', 'Entity 2', 'Entity 3']);
    });

    it('should return empty array when no entities exist', async () => {
      const all = await repository.findAll();
      expect(all).toEqual([]);
    });
  });

  describe('count', () => {
    it('should return correct count', async () => {
      expect(await repository.count()).toBe(0);

      await repository.create({ name: 'Entity 1', value: 100, createdAt: Date.now() });
      expect(await repository.count()).toBe(1);

      await repository.create({ name: 'Entity 2', value: 200, createdAt: Date.now() });
      expect(await repository.count()).toBe(2);
    });
  });

  describe('clear', () => {
    it('should clear all entities', async () => {
      await repository.create({ name: 'Entity 1', value: 100, createdAt: Date.now() });
      await repository.create({ name: 'Entity 2', value: 200, createdAt: Date.now() });

      expect(await repository.count()).toBe(2);

      await repository.clear();
      expect(await repository.count()).toBe(0);
    });
  });

  describe('upsert', () => {
    it('should insert new entity when it does not exist', async () => {
      const entity: TestEntity = {
        id: 1,
        name: 'New Entity',
        value: 100,
        createdAt: Date.now(),
      };

      const id = await repository.upsert(entity);
      expect(id).toBe(1);

      const found = await repository.findById(1);
      expect(found).toBeDefined();
      expect(found!.name).toBe('New Entity');
    });

    it('should update existing entity', async () => {
      const entity: TestEntity = {
        id: 1,
        name: 'Original Entity',
        value: 100,
        createdAt: Date.now(),
      };

      await repository.upsert(entity);

      const updatedEntity: TestEntity = {
        id: 1,
        name: 'Updated Entity',
        value: 200,
        createdAt: Date.now(),
      };

      await repository.upsert(updatedEntity);

      const found = await repository.findById(1);
      expect(found!.name).toBe('Updated Entity');
      expect(found!.value).toBe(200);
    });
  });
});
