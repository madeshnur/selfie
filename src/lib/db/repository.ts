import type { SQLiteAdapter } from "./sqlite-adapter";
import type { QueryConditions, BaseRecord } from "./types";

/**
 * Generic repository pattern for type-safe database operations
 * Provides CRUD operations for any table
 */
export class Repository<T extends BaseRecord> {
  constructor(private adapter: SQLiteAdapter, private tableName: string) {}

  /**
   * Create a new record
   */
  async create(data: Omit<T, keyof BaseRecord>): Promise<string> {
    return await this.adapter.insert<T>(this.tableName, data);
  }

  /**
   * Update an existing record
   */
  async update(
    id: string,
    data: Partial<Omit<T, keyof BaseRecord>>
  ): Promise<void> {
    await this.adapter.update<T>(this.tableName, id, data);
  }

  /**
   * Delete a record (soft delete)
   */
  async delete(id: string): Promise<void> {
    await this.adapter.delete(this.tableName, id);
  }

  /**
   * Find record by ID
   */
  async findById(id: string): Promise<T | null> {
    return await this.adapter.findById<T>(this.tableName, id);
  }

  /**
   * Find all records matching conditions
   */
  async findAll(conditions?: QueryConditions): Promise<T[]> {
    return await this.adapter.findAll<T>(this.tableName, conditions);
  }

  /**
   * Count records matching conditions
   */
  async count(conditions?: Record<string, any>): Promise<number> {
    return await this.adapter.count(this.tableName, conditions);
  }

  /**
   * Execute raw SQL query
   */
  async query(sql: string, params?: any[]): Promise<any[]> {
    return await this.adapter.executeRaw(sql, params);
  }
}
