import type { TableSchema, ColumnDefinition, SQLiteType } from "./types";

/**
 * Schema builder helper for creating table schemas fluently
 */
export class SchemaBuilder<T> {
  private schema: TableSchema<T>;

  constructor(tableName: string) {
    this.schema = {
      name: tableName,
      columns: {},
      indexes: [],
    };
  }

  /**
   * Add a column to the table
   */
  column(
    name: keyof T,
    type: SQLiteType,
    options: Partial<ColumnDefinition> = {}
  ): this {
    this.schema.columns[name as string] = { type, ...options };
    return this;
  }

  /**
   * Add an index to the table
   */
  index(
    columns: Array<keyof T>,
    options: { name?: string; unique?: boolean } = {}
  ): this {
    const indexName =
      options.name ||
      `idx_${this.schema.name}_${(columns as string[]).join("_")}`;
    this.schema.indexes!.push({
      name: indexName,
      columns: columns as string[],
      unique: options.unique,
    });
    return this;
  }

  /**
   * Build and return the schema
   */
  build(): TableSchema<T> {
    return this.schema;
  }
}

/**
 * Helper function to create a table schema with auto-added base fields
 * Base fields: id, created_at, updated_at, synced, deleted
 */
export function table<T>(
  tableName: string,
  builder: (t: SchemaBuilder<T>) => void
): TableSchema<T> {
  const schema = new SchemaBuilder<T>(tableName);

  // Auto-add base fields (these are always needed)
  schema
    .column("id" as keyof T, "TEXT", { primaryKey: true })
    .column("created_at" as keyof T, "TIMESTAMP", { notNull: true })
    .column("updated_at" as keyof T, "TIMESTAMP", { notNull: true })
    .column("synced" as keyof T, "BOOLEAN", { defaultValue: false })
    .column("deleted" as keyof T, "BOOLEAN", { defaultValue: false });

  // Add custom columns via builder function
  builder(schema);

  return schema.build();
}
