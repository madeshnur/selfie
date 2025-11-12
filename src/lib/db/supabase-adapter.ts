import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase adapter for cloud sync
 * Handles bidirectional sync with Supabase PostgreSQL
 */
export class SupabaseAdapter {
  private client: SupabaseClient;

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.client = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  /**
   * Upload local records to Supabase
   * Handles both inserts/updates and deletes
   */
  async syncTable(tableName: string, localRecords: any[]): Promise<string[]> {
    const syncedIds: string[] = [];

    for (const record of localRecords) {
      try {
        const payload = this.prepareForSupabase(record);

        if (record.deleted) {
          // Delete from Supabase
          const { error } = await this.client
            .from(tableName)
            .delete()
            .eq("id", record.id);

          if (error) throw error;
        } else {
          // Upsert to Supabase (insert or update)
          const { error } = await this.client
            .from(tableName)
            .upsert(payload, { onConflict: "id" });

          if (error) throw error;
        }

        syncedIds.push(record.id);
      } catch (error) {
        console.error(
          `Failed to sync ${tableName} record ${record.id}:`,
          error
        );
      }
    }

    return syncedIds;
  }

  /**
   * Download records from Supabase that were updated since last sync
   */
  async downloadTable(tableName: string, lastSyncTime: number): Promise<any[]> {
    const { data, error } = await this.client
      .from(tableName)
      .select("*")
      .gte("updated_at", new Date(lastSyncTime).toISOString())
      .order("updated_at", { ascending: true });

    if (error) {
      console.error(`Failed to download ${tableName}:`, error);
      return [];
    }

    return (data || []).map((record) => this.prepareFromSupabase(record));
  }

  /**
   * Prepare local record for Supabase (convert ALL timestamps to ISO strings)
   */
  private prepareForSupabase(record: any): any {
    const { synced, ...rest } = record;

    // Convert all timestamp fields (numbers) to ISO strings
    const converted: any = {};

    for (const [key, value] of Object.entries(rest)) {
      if (value === null || value === undefined) {
        converted[key] = value;
      } else if (this.isTimestampField(key) && typeof value === "number") {
        // Convert Unix timestamp (milliseconds) to ISO string
        converted[key] = new Date(value).toISOString();
      } else {
        converted[key] = value;
      }
    }

    return converted;
  }

  /**
   * Prepare Supabase record for local storage (convert ISO strings to timestamps)
   */
  private prepareFromSupabase(record: any): any {
    const converted: any = { synced: true };

    for (const [key, value] of Object.entries(record)) {
      if (value === null || value === undefined) {
        converted[key] = value;
      } else if (this.isTimestampField(key) && typeof value === "string") {
        // Convert ISO string to Unix timestamp (milliseconds)
        converted[key] = new Date(value).getTime();
      } else {
        converted[key] = value;
      }
    }

    return converted;
  }

  /**
   * Check if field name represents a timestamp
   * Add more field names here as needed for other modules
   */
  private isTimestampField(fieldName: string): boolean {
    const timestampFields = [
      "created_at",
      "updated_at",
      "started_at",
      "completed_at",
      "last_streak_date", // Can be either DATE or TIMESTAMP depending on usage
    ];

    return (
      timestampFields.includes(fieldName) ||
      fieldName.endsWith("_at") ||
      fieldName.endsWith("_time")
    );
  }
}
