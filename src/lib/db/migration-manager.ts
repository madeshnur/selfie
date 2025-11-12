import type { TableSchema } from "./types";
import { SCHEMA_REGISTRY } from "./schemas";

/**
 * Migration manager for automatic schema migrations
 * Handles table creation, column additions, and index creation
 */
export class MigrationManager {
  private db: any;
  private platform: "tauri" | "capacitor" | "web";

  constructor(db: any, platform: "tauri" | "capacitor" | "web") {
    this.db = db;
    this.platform = platform;
  }

  /**
   * Initialize migration tracking table
   */
  async initializeMigrationTable(): Promise<void> {
    const sql = `
      CREATE TABLE IF NOT EXISTS _migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version INTEGER NOT NULL,
        table_name TEXT NOT NULL,
        operation TEXT NOT NULL,
        applied_at INTEGER NOT NULL
      );
    `;
    await this.execute(sql);
  }

  /**
   * Apply all pending migrations
   */
  async applyMigrations(): Promise<void> {
    await this.initializeMigrationTable();

    console.log("🔄 Checking for schema changes...");

    for (const schema of Object.values(SCHEMA_REGISTRY)) {
      await this.ensureTableExists(schema);
      await this.ensureColumnsExist(schema);
      await this.ensureIndexesExist(schema);
    }

    console.log("✅ All migrations applied");
  }

  /**
   * Ensure table exists, create if not
   */
  private async ensureTableExists(schema: TableSchema): Promise<void> {
    const tableExists = await this.checkTableExists(schema.name);

    if (!tableExists) {
      console.log(`  📝 Creating table: ${schema.name}`);
      await this.createTable(schema);
      await this.recordMigration(schema.name, "CREATE_TABLE");
    }
  }

  /**
   * Ensure all columns exist, add missing ones
   */
  private async ensureColumnsExist(schema: TableSchema): Promise<void> {
    const existingColumns = await this.getTableColumns(schema.name);
    const existingColumnNames = new Set(existingColumns.map((c) => c.name));

    for (const [columnName, definition] of Object.entries(schema.columns)) {
      if (!existingColumnNames.has(columnName)) {
        console.log(`    ➕ Adding column: ${schema.name}.${columnName}`);
        await this.addColumn(schema.name, columnName, definition);
        await this.recordMigration(schema.name, `ADD_COLUMN:${columnName}`);
      }
    }
  }

  /**
   * Ensure all indexes exist, create missing ones
   */
  private async ensureIndexesExist(schema: TableSchema): Promise<void> {
    if (!schema.indexes) return;

    for (const index of schema.indexes) {
      const indexExists = await this.checkIndexExists(index.name);
      if (!indexExists) {
        console.log(`    📑 Creating index: ${index.name}`);
        await this.createIndex(
          schema.name,
          index.name,
          index.columns,
          index.unique
        );
        await this.recordMigration(schema.name, `CREATE_INDEX:${index.name}`);
      }
    }
  }

  /**
   * Check if table exists
   */
  private async checkTableExists(tableName: string): Promise<boolean> {
    const sql = `SELECT name FROM sqlite_master WHERE type='table' AND name=?`;
    const result = await this.query(sql, [tableName]);
    return result.length > 0;
  }

  /**
   * Check if index exists
   */
  private async checkIndexExists(indexName: string): Promise<boolean> {
    const sql = `SELECT name FROM sqlite_master WHERE type='index' AND name=?`;
    const result = await this.query(sql, [indexName]);
    return result.length > 0;
  }

  /**
   * Get table columns info
   */
  private async getTableColumns(
    tableName: string
  ): Promise<Array<{ name: string; type: string }>> {
    const sql = `PRAGMA table_info(${tableName})`;
    return await this.query(sql);
  }

  /**
   * Create table from schema
   */
  private async createTable(schema: TableSchema): Promise<void> {
    const columns = Object.entries(schema.columns)
      .map(([name, def]) => this.buildColumnDefinition(name, def))
      .join(",\n      ");

    const sql = `CREATE TABLE ${schema.name} (\n      ${columns}\n    )`;
    await this.execute(sql);
  }

  /**
   * Add column to existing table
   */
  private async addColumn(
    tableName: string,
    columnName: string,
    definition: any
  ): Promise<void> {
    const columnDef = this.buildColumnDefinition(columnName, definition)
      .split(" ")
      .slice(1)
      .join(" ");
    const sql = `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef}`;

    try {
      await this.execute(sql);
    } catch (error) {
      // Column might already exist, ignore duplicate column errors
      console.warn(`    ⚠️ Column might already exist: ${error}`);
    }
  }

  /**
   * Create index on table
   */
  private async createIndex(
    tableName: string,
    indexName: string,
    columns: string[],
    unique?: boolean
  ): Promise<void> {
    const uniqueKeyword = unique ? "UNIQUE" : "";
    const sql = `CREATE ${uniqueKeyword} INDEX IF NOT EXISTS ${indexName} ON ${tableName}(${columns.join(
      ", "
    )})`;
    await this.execute(sql);
  }

  /**
   * Build column definition SQL
   */
  private buildColumnDefinition(name: string, def: any): string {
    let sql = `${name} ${this.mapType(def.type)}`;

    if (def.primaryKey) sql += " PRIMARY KEY";
    if (def.autoIncrement) sql += " AUTOINCREMENT";
    if (def.notNull) sql += " NOT NULL";
    if (def.unique) sql += " UNIQUE";
    if (def.defaultValue !== undefined) {
      const value =
        typeof def.defaultValue === "string"
          ? `'${def.defaultValue}'`
          : def.defaultValue;
      sql += ` DEFAULT ${value}`;
    }

    return sql;
  }

  /**
   * Map TypeScript types to SQLite types
   */
  private mapType(type: string): string {
    const typeMap: Record<string, string> = {
      TEXT: "TEXT",
      INTEGER: "INTEGER",
      REAL: "REAL",
      BOOLEAN: "INTEGER", // SQLite doesn't have BOOLEAN, uses INTEGER
      TIMESTAMP: "INTEGER",
      DATE: "TEXT",
      JSONB: "TEXT",
    };
    return typeMap[type] || "TEXT";
  }

  /**
   * Record migration in tracking table
   */
  private async recordMigration(
    tableName: string,
    operation: string
  ): Promise<void> {
    const sql = `INSERT INTO _migrations (version, table_name, operation, applied_at) VALUES (?, ?, ?, ?)`;
    await this.execute(sql, [1, tableName, operation, Date.now()]);
  }

  /**
   * Execute SQL (platform-specific)
   */
  private async execute(sql: string, params: any[] = []): Promise<void> {
    if (this.platform === "tauri") {
      await this.db.execute(sql, params);
    } else if (this.platform === "capacitor") {
      await this.db.execute({ database: "app.db", statements: sql });
    } else if (this.platform === "web") {
      this.db.run(sql, params);
    }
  }

  /**
   * Query SQL (platform-specific)
   */
  private async query(sql: string, params: any[] = []): Promise<any[]> {
    if (this.platform === "tauri") {
      return await this.db.select(sql, params);
    } else if (this.platform === "capacitor") {
      const result = await this.db.query({
        database: "app.db",
        statement: sql,
        values: params,
      });
      return result.values || [];
    } else if (this.platform === "web") {
      const result = this.db.exec(sql, params);
      if (result.length === 0) return [];
      return this.parseWebResult(result[0]);
    }
    return [];
  }

  /**
   * Parse web (sql.js) result format
   */
  private parseWebResult(result: any): any[] {
    const columns = result.columns;
    const values = result.values;
    return values.map((row: any[]) => {
      const obj: any = {};
      columns.forEach((col: string, idx: number) => {
        obj[col] = row[idx];
      });
      return obj;
    });
  }
}
