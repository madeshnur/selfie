import { SQLiteAdapter } from "./sqlite-adapter";
import { SupabaseAdapter } from "./supabase-adapter";
import { SyncManager } from "./sync-manager";
import { Repository } from "./repository";
import { QueryBuilder } from "./query-builder";
import type { TableName } from "./schemas";
import type {
  PomodoroSession,
  PomodoroLog,
  PomodoroStreak,
  AppSettings,
} from "./schemas";

/**
 * Main Database class - Singleton pattern
 * Entry point for all database operations
 */
class Database {
  private static instance: Database;
  private sqliteAdapter: SQLiteAdapter;
  private supabaseAdapter: SupabaseAdapter | null = null;
  private syncManager: SyncManager | null = null;
  private initialized = false;
  public queryBuilder!: QueryBuilder;

  // Type-safe repositories - Pomodoro only
  public pomodoro_sessions!: Repository<PomodoroSession>;
  public pomodoro_log!: Repository<PomodoroLog>;
  public pomodoro_streak!: Repository<PomodoroStreak>;
  public app_settings!: Repository<AppSettings>;

  private constructor() {
    this.sqliteAdapter = new SQLiteAdapter();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): Database {
    if (!Database.instance) {
      Database.instance = new Database();
    }
    return Database.instance;
  }

  /**
   * Initialize database (must be called before use)
   */
  async initialize(supabaseUrl?: string, supabaseKey?: string): Promise<void> {
    if (this.initialized) return;

    // Initialize SQLite
    await this.sqliteAdapter.initialize();

    // Initialize query builder
    this.queryBuilder = new QueryBuilder(this.sqliteAdapter);

    // Initialize type-safe repositories - Pomodoro only
    this.pomodoro_sessions = new Repository<PomodoroSession>(
      this.sqliteAdapter,
      "pomodoro_sessions"
    );
    this.pomodoro_log = new Repository<PomodoroLog>(
      this.sqliteAdapter,
      "pomodoro_log"
    );
    this.pomodoro_streak = new Repository<PomodoroStreak>(
      this.sqliteAdapter,
      "pomodoro_streak"
    );
    this.app_settings = new Repository<AppSettings>(
      this.sqliteAdapter,
      "app_settings"
    );

    // Initialize Supabase sync if credentials provided
    if (supabaseUrl && supabaseKey) {
      this.supabaseAdapter = new SupabaseAdapter(supabaseUrl, supabaseKey);
      this.syncManager = new SyncManager(
        this.sqliteAdapter,
        this.supabaseAdapter
      );
    }

    this.initialized = true;
    console.log("✅ Database initialized - Pomodoro Module");
  }

  /**
   * Get generic repository for any table
   */
  table<T>(tableName: TableName): Repository<T & { id: string }> {
    return new Repository<T & { id: string }>(this.sqliteAdapter, tableName);
  }

  // ============================================
  // Sync Operations
  // ============================================

  /**
   * Manually trigger sync
   */
  async sync(): Promise<void> {
    if (!this.syncManager) {
      throw new Error(
        "Sync not configured. Initialize with Supabase credentials."
      );
    }
    await this.syncManager.sync();
  }

  /**
   * Start automatic sync at intervals
   */
  async startAutoSync(intervalMinutes: number = 5): Promise<void> {
    if (!this.syncManager) {
      throw new Error("Sync not configured.");
    }
    await this.syncManager.startAutoSync(intervalMinutes);
  }

  /**
   * Stop automatic sync
   */
  stopAutoSync(): void {
    this.syncManager?.stopAutoSync();
  }

  /**
   * Get sync status
   */
  getSyncStatus() {
    return this.syncManager?.getStatus() || null;
  }

  // ============================================
  // Raw Query Access
  // ============================================

  /**
   * Execute raw SQL query
   */
  async query(sql: string, params?: any[]): Promise<any[]> {
    return await this.sqliteAdapter.executeRaw(sql, params);
  }
}

// Export singleton instance
export default Database;

// Export types
export type { PomodoroSession, PomodoroLog, PomodoroStreak, AppSettings };
