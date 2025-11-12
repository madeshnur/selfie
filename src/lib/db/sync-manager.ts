import type { SQLiteAdapter } from "./sqlite-adapter";
import type { SupabaseAdapter } from "./supabase-adapter";
import type { SyncStatus } from "./types";
import { TABLE_NAMES } from "./schemas";

/**
 * Sync manager for bidirectional sync between SQLite and Supabase
 * Handles conflict resolution and maintains sync state
 */
export class SyncManager {
  private sqliteAdapter: SQLiteAdapter;
  private supabaseAdapter: SupabaseAdapter;
  private syncStatus: SyncStatus = {
    lastSync: null,
    pendingCount: 0,
    isSyncing: false,
    error: null,
  };
  private syncInterval: number | null = null;

  constructor(sqliteAdapter: SQLiteAdapter, supabaseAdapter: SupabaseAdapter) {
    this.sqliteAdapter = sqliteAdapter;
    this.supabaseAdapter = supabaseAdapter;
  }

  /**
   * Perform full sync across all tables
   */
  async sync(): Promise<void> {
    if (this.syncStatus.isSyncing) {
      console.log("Sync already in progress");
      return;
    }

    this.syncStatus.isSyncing = true;
    this.syncStatus.error = null;

    try {
      // Sync each table sequentially
      for (const tableName of TABLE_NAMES) {
        await this.syncTable(tableName);
      }

      this.syncStatus.lastSync = Date.now();
      this.syncStatus.pendingCount = 0;
      console.log("✅ All tables synced successfully");
    } catch (error) {
      this.syncStatus.error =
        error instanceof Error ? error.message : "Unknown error";
      console.error("❌ Sync failed:", error);
    } finally {
      this.syncStatus.isSyncing = false;
    }
  }

  /**
   * Sync a single table (upload then download)
   */
  private async syncTable(tableName: string): Promise<void> {
    console.log(`🔄 Syncing table: ${tableName}`);

    // Step 1: Upload local changes to Supabase
    const unsyncedRecords = await this.sqliteAdapter.findUnsynced(tableName);

    if (unsyncedRecords.length > 0) {
      console.log(`  📤 Uploading ${unsyncedRecords.length} local changes...`);
      const syncedIds = await this.supabaseAdapter.syncTable(
        tableName,
        unsyncedRecords
      );
      await this.sqliteAdapter.markAsSynced(tableName, syncedIds);
      console.log(`  ✅ Uploaded ${syncedIds.length} records`);
    }

    // Step 2: Download remote changes from Supabase
    const lastSync = this.syncStatus.lastSync || 0;
    const remoteRecords = await this.supabaseAdapter.downloadTable(
      tableName,
      lastSync
    );

    if (remoteRecords.length > 0) {
      console.log(`  📥 Downloading ${remoteRecords.length} remote changes...`);

      for (const record of remoteRecords) {
        const existing = await this.sqliteAdapter.findById(
          tableName,
          record.id
        );

        if (!existing) {
          // Insert new record from remote
          const { id, created_at, updated_at, synced, deleted, ...data } =
            record;
          await this.sqliteAdapter.insert(tableName, {
            id,
            ...data,
            created_at,
            updated_at,
            synced,
            deleted,
          });
        } else if (record.updated_at > existing.updated_at) {
          // Update if remote is newer (conflict resolution: last-write-wins)
          const { id, created_at, synced, ...data } = record;
          await this.sqliteAdapter.update(tableName, id, { ...data, synced });
        }
      }

      console.log(`  ✅ Downloaded ${remoteRecords.length} records`);
    }

    console.log(`  ✅ ${tableName} sync complete`);
  }

  /**
   * Start automatic sync at regular intervals
   */
  async startAutoSync(intervalMinutes: number = 5): Promise<void> {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    // Initial sync
    await this.sync();

    // Set up periodic sync
    this.syncInterval = window.setInterval(async () => {
      await this.sync();
    }, intervalMinutes * 60 * 1000);

    console.log(`🔄 Auto-sync started (every ${intervalMinutes} minutes)`);
  }

  /**
   * Stop automatic sync
   */
  stopAutoSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      console.log("⏸️ Auto-sync stopped");
    }
  }

  /**
   * Get current sync status
   */
  getStatus(): SyncStatus {
    return { ...this.syncStatus };
  }

  /**
   * Update pending count (for UI display)
   */
  async updatePendingCount(): Promise<void> {
    let totalPending = 0;

    for (const tableName of TABLE_NAMES) {
      const unsynced = await this.sqliteAdapter.findUnsynced(tableName);
      totalPending += unsynced.length;
    }

    this.syncStatus.pendingCount = totalPending;
  }
}
