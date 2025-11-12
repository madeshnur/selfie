import { v4 as uuidv4 } from "uuid";
import type { QueryConditions, BaseRecord } from "./types";
import { MigrationManager } from "./migration-manager";

// Platform detection
const isBrowser = typeof window !== "undefined";
const isTauri = isBrowser && "__TAURI__" in window;
const isCapacitor = isBrowser && "Capacitor" in window;

/**
 * SQLite adapter for cross-platform database operations
 * Supports: Tauri (desktop), Capacitor (mobile), Web (browser)
 */
export class SQLiteAdapter {
  private db: any = null;
  private platform: "tauri" | "capacitor" | "web" = "web";
  private migrationManager: MigrationManager | null = null;

  /**
   * Initialize SQLite database based on platform
   */
  async initialize(): Promise<void> {
    if (isTauri) {
      await this.initTauri();
    } else if (isCapacitor) {
      await this.initCapacitor();
    } else if (isBrowser) {
      await this.initWeb();
    } else {
      throw new Error("SQLite not supported on this platform");
    }

    // Auto-apply migrations
    this.migrationManager = new MigrationManager(this.db, this.platform);
    await this.migrationManager.applyMigrations();
  }

  /**
   * Initialize Tauri native SQLite
   */
  private async initTauri(): Promise<void> {
    const Database = await import("@tauri-apps/plugin-sql");
    this.db = await Database.default.load("sqlite:app.db");
    this.platform = "tauri";
    console.log("✅ Tauri SQLite initialized");
  }

  /**
   * Initialize Capacitor SQLite (mobile)
   */
  private async initCapacitor(): Promise<void> {
    const { CapacitorSQLite } = await import("@capacitor-community/sqlite");
    const { Capacitor } = await import("@capacitor/core");

    if (Capacitor.getPlatform() === "web") {
      const jeepSqlite = document.createElement("jeep-sqlite");
      document.body.appendChild(jeepSqlite);
      await customElements.whenDefined("jeep-sqlite");
      await (jeepSqlite as any).initWebStore();
    }

    await CapacitorSQLite.createConnection({
      database: "app.db",
      encrypted: false,
      mode: "no-encryption",
      version: 1,
      readonly: false,
    });

    await CapacitorSQLite.open({ database: "app.db" });
    this.db = CapacitorSQLite;
    this.platform = "capacitor";
    console.log("✅ Capacitor SQLite initialized");
  }

  /**
   * Initialize Web SQLite (sql.js with localStorage persistence)
   */
  private async initWeb(): Promise<void> {
    const initSqlJs = (await import("sql.js")).default;
    const SQL = await initSqlJs({
      locateFile: (file) => `https://sql.js.org/dist/${file}`,
    });

    const savedDb = localStorage.getItem("sqliteDb");
    if (savedDb) {
      const binaryDb = new Uint8Array(JSON.parse(savedDb));
      this.db = new SQL.Database(binaryDb);
      console.log("✅ Loaded existing web SQLite database");
    } else {
      this.db = new SQL.Database();
      console.log("✅ Created new web SQLite database");
    }

    this.platform = "web";

    // Auto-save to localStorage every 5 seconds
    setInterval(() => this.saveToLocalStorage(), 5000);
  }

  /**
   * Save database to localStorage (web platform only)
   */
  private saveToLocalStorage(): void {
    if (this.platform === "web" && this.db) {
      try {
        const data = this.db.export();
        const buffer = Array.from(data);
        localStorage.setItem("sqliteDb", JSON.stringify(buffer));
      } catch (error) {
        console.error("Failed to save database:", error);
      }
    }
  }

  // ============================================
  // CRUD Operations
  // ============================================

  /**
   * Insert a new record into the table
   * Auto-generates id, timestamps, and sync flags
   */
  async insert<T extends Partial<BaseRecord>>(
    tableName: string,
    data: Omit<T, keyof BaseRecord>
  ): Promise<string> {
    const id = uuidv4();
    const now = Date.now();

    const record = {
      ...data,
      id,
      created_at: now,
      updated_at: now,
      synced: false,
      deleted: false,
    };

    const columns = Object.keys(record);
    const placeholders = columns.map(() => "?").join(", ");
    const values = Object.values(record);

    const sql = `INSERT INTO ${tableName} (${columns.join(
      ", "
    )}) VALUES (${placeholders})`;
    await this.execute(sql, values);

    return id;
  }

  /**
   * Update an existing record
   * Auto-updates updated_at timestamp and marks as unsynced
   */
  async update<T>(
    tableName: string,
    id: string,
    data: Partial<T>
  ): Promise<void> {
    const updates = Object.keys(data)
      .map((key) => `${key} = ?`)
      .join(", ");
    const values = [...Object.values(data), Date.now(), id];

    const sql = `UPDATE ${tableName} SET ${updates}, updated_at = ?, synced = 0 WHERE id = ?`;
    await this.execute(sql, values);
  }

  /**
   * Soft delete a record (sets deleted flag)
   */
  async delete(tableName: string, id: string): Promise<void> {
    const sql = `UPDATE ${tableName} SET deleted = 1, synced = 0, updated_at = ? WHERE id = ?`;
    await this.execute(sql, [Date.now(), id]);
  }

  /**
   * Find a single record by ID
   */
  async findById<T>(tableName: string, id: string): Promise<T | null> {
    const sql = `SELECT * FROM ${tableName} WHERE id = ? AND deleted = 0`;
    const rows = await this.query(sql, [id]);
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Find all records matching conditions
   * Supports filtering, pagination, and ordering
   */
  async findAll<T>(
    tableName: string,
    conditions: QueryConditions = {}
  ): Promise<T[]> {
    const { _limit, _offset, _orderBy, _orderDir, ...where } = conditions;

    let sql = `SELECT * FROM ${tableName} WHERE deleted = 0`;
    const params: any[] = [];

    // Add WHERE conditions
    Object.entries(where).forEach(([key, value]) => {
      sql += ` AND ${key} = ?`;
      params.push(value);
    });

    // Add ORDER BY
    if (_orderBy) {
      sql += ` ORDER BY ${_orderBy} ${_orderDir || "DESC"}`;
    } else {
      sql += ` ORDER BY created_at DESC`;
    }

    // Add LIMIT/OFFSET
    if (_limit) {
      sql += ` LIMIT ${_limit}`;
      if (_offset) sql += ` OFFSET ${_offset}`;
    }

    return await this.query(sql, params);
  }

  /**
   * Count records matching conditions
   */
  async count(
    tableName: string,
    conditions: Record<string, any> = {}
  ): Promise<number> {
    let sql = `SELECT COUNT(*) as count FROM ${tableName} WHERE deleted = 0`;
    const params: any[] = [];

    Object.entries(conditions).forEach(([key, value]) => {
      sql += ` AND ${key} = ?`;
      params.push(value);
    });

    const result = await this.query(sql, params);
    return result[0]?.count || 0;
  }

  /**
   * Find unsynced records (for sync manager)
   */
  async findUnsynced(tableName: string): Promise<any[]> {
    const sql = `SELECT * FROM ${tableName} WHERE synced = 0 ORDER BY updated_at ASC`;
    return await this.query(sql);
  }

  /**
   * Mark records as synced
   */
  async markAsSynced(tableName: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => "?").join(",");
    const sql = `UPDATE ${tableName} SET synced = 1 WHERE id IN (${placeholders})`;
    await this.execute(sql, ids);
  }

  /**
   * Execute raw SQL query (for complex queries)
   */
  async executeRaw(sql: string, params: any[] = []): Promise<any[]> {
    return await this.query(sql, params);
  }

  // ============================================
  // Internal Platform-Specific Methods
  // ============================================

  /**
   * Execute SQL statement (no return value)
   */
  private async execute(sql: string, params: any[] = []): Promise<void> {
    if (this.platform === "tauri") {
      await this.db.execute(sql, params);
    } else if (this.platform === "capacitor") {
      await this.db.run({ database: "app.db", statement: sql, values: params });
    } else if (this.platform === "web") {
      this.db.run(sql, params);
      this.saveToLocalStorage();
    }
  }

  /**
   * Execute SQL query (returns results)
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
   * Parse sql.js result format to array of objects
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

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    if (this.platform === "capacitor" && this.db) {
      await this.db.closeConnection({ database: "app.db" });
    } else if (this.platform === "web" && this.db) {
      this.saveToLocalStorage();
      this.db.close();
    }
  }
}
