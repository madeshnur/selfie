// Core database types
export type SQLiteType =
  | "TEXT"
  | "INTEGER"
  | "REAL"
  | "BOOLEAN"
  | "TIMESTAMP"
  | "DATE"
  | "JSONB";

export interface ColumnDefinition {
  type: SQLiteType;
  primaryKey?: boolean;
  autoIncrement?: boolean;
  notNull?: boolean;
  unique?: boolean;
  defaultValue?: any;
  references?: { table: string; column: string };
}

export interface TableSchema<T = any> {
  name: string;
  columns: Record<string, ColumnDefinition>;
  indexes?: Array<{ name: string; columns: string[]; unique?: boolean }>;
  __type?: T;
}

export type InferSchemaType<T extends TableSchema> = T extends TableSchema<
  infer U
>
  ? U
  : never;

// Base record with system fields
export interface BaseRecord {
  id: string;
  created_at: number;
  updated_at: number;
  synced: boolean;
  deleted: boolean;
}

// Query conditions
export interface QueryConditions {
  [key: string]: any;
  _limit?: number;
  _offset?: number;
  _orderBy?: string;
  _orderDir?: "ASC" | "DESC";
}

// Sync status
export interface SyncStatus {
  lastSync: number | null;
  pendingCount: number;
  isSyncing: boolean;
  error: string | null;
}

// Migration types
export interface Migration {
  version: number;
  tableName: string;
  operations: MigrationOperation[];
  timestamp: number;
}

export type MigrationOperation =
  | { type: "CREATE_TABLE"; schema: TableSchema }
  | { type: "ADD_COLUMN"; columnName: string; definition: ColumnDefinition }
  | { type: "CREATE_INDEX"; indexName: string; columns: string[] };
