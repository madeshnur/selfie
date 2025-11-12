import { writable } from "svelte/store";
import Database from "$lib/db";

export const db = Database.getInstance();
export const syncStatus = writable({
  lastSync: null,
  pendingCount: 0,
  isSyncing: false,
  error: null,
});

// Update sync status periodically
if (typeof window !== "undefined") {
  setInterval(() => {
    const status = db.getSyncStatus();
    if (status) {
      syncStatus.set(status);
    }
  }, 1000);
}
