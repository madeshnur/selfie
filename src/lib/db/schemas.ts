import type { TableSchema, BaseRecord } from "./types";
import { table } from "./schema-builder";

// ============================================
// POMODORO MODULE - Tables
// ============================================

/**
 * Individual session tracking (for focus score calculation)
 * Tracks each 25-minute work session with pause data
 */
export interface PomodoroSession extends BaseRecord {
  session_date: string; // YYYY-MM-DD
  session_number: number; // Session # for the day (1, 2, 3...)
  status: "active" | "paused" | "completed" | "cancelled";
  planned_duration: number; // 25 minutes (from settings)
  actual_duration: number; // Actual time taken in minutes
  pause_count: number; // How many times paused
  total_pause_duration: number; // Total pause time in seconds
  started_at: number; // Timestamp when started
  completed_at: number | null; // Timestamp when completed
  efficiency_score: number; // Calculated: planned/actual ratio (0-100)
}

/**
 * Daily aggregate log - One record per day
 * Summary of all completed sessions for the day
 */
export interface PomodoroLog extends BaseRecord {
  log_date: string; // YYYY-MM-DD (unique per day)
  work_sessions: number; // Completed sessions count
  total_work_time: number; // Total minutes worked (sessions × duration)
  target_sessions: number; // Goal for the day (from settings)
  focus_score: number; // 1-10, weighted calculation
  daily_notes: string | null; // Optional reflection
  average_efficiency: number; // Avg efficiency across sessions (0-100)
  total_pause_count: number; // Total pauses for the day
  completion_rate: number; // work_sessions / target_sessions (0-1)
}

/**
 * Streak tracking (cached computation)
 * Single record that tracks streak statistics
 */
export interface PomodoroStreak extends BaseRecord {
  current_streak: number; // Consecutive days hitting target
  best_streak: number; // Longest streak ever
  total_days_logged: number; // Total days with any sessions
  last_streak_date: string | null; // Last day that counted for streak
}

/**
 * App-wide settings (single record)
 * Contains Pomodoro configuration
 */
export interface AppSettings extends BaseRecord {
  // Pomodoro settings
  work_session_duration: number; // default 25 minutes
  daily_target_sessions: number; // default 8
  short_break_duration: number; // default 5 minutes
  long_break_duration: number; // default 15 minutes
  sessions_before_long_break: number; // default 4
}

// ============================================
// SCHEMA REGISTRY - Only Pomodoro tables
// ============================================

export const SCHEMA_REGISTRY: Record<string, TableSchema> = {
  // Pomodoro Sessions (individual tracking for efficiency calculation)
  pomodoro_sessions: table<PomodoroSession>("pomodoro_sessions", (t) => {
    t.column("session_date", "DATE", { notNull: true })
      .column("session_number", "INTEGER", { notNull: true })
      .column("status", "TEXT", { notNull: true, defaultValue: "active" })
      .column("planned_duration", "INTEGER", { notNull: true })
      .column("actual_duration", "INTEGER", { defaultValue: 0 })
      .column("pause_count", "INTEGER", { defaultValue: 0 })
      .column("total_pause_duration", "INTEGER", { defaultValue: 0 })
      .column("started_at", "TIMESTAMP", { notNull: true })
      .column("completed_at", "TIMESTAMP")
      .column("efficiency_score", "REAL", { defaultValue: 0 })
      .index(["session_date"])
      .index(["status"]);
  }),

  // Pomodoro Daily Log (aggregated daily summary)
  pomodoro_log: table<PomodoroLog>("pomodoro_log", (t) => {
    t.column("log_date", "DATE", { notNull: true, unique: true })
      .column("work_sessions", "INTEGER", { defaultValue: 0 })
      .column("total_work_time", "INTEGER", { defaultValue: 0 })
      .column("target_sessions", "INTEGER", { notNull: true })
      .column("focus_score", "REAL", { defaultValue: 0 })
      .column("daily_notes", "TEXT")
      .column("average_efficiency", "REAL", { defaultValue: 0 })
      .column("total_pause_count", "INTEGER", { defaultValue: 0 })
      .column("completion_rate", "REAL", { defaultValue: 0 })
      .index(["log_date"], { unique: true })
      .index(["focus_score"]);
  }),

  // Pomodoro Streak (cached computation - single record)
  pomodoro_streak: table<PomodoroStreak>("pomodoro_streak", (t) => {
    t.column("current_streak", "INTEGER", { defaultValue: 0 })
      .column("best_streak", "INTEGER", { defaultValue: 0 })
      .column("total_days_logged", "INTEGER", { defaultValue: 0 })
      .column("last_streak_date", "DATE");
  }),

  // Global Settings (single record)
  app_settings: table<AppSettings>("app_settings", (t) => {
    t.column("work_session_duration", "INTEGER", { defaultValue: 25 })
      .column("daily_target_sessions", "INTEGER", { defaultValue: 8 })
      .column("short_break_duration", "INTEGER", { defaultValue: 5 })
      .column("long_break_duration", "INTEGER", { defaultValue: 15 })
      .column("sessions_before_long_break", "INTEGER", { defaultValue: 4 });
  }),
};

// Helper to get table names as typed array
export const TABLE_NAMES = Object.keys(SCHEMA_REGISTRY) as Array<
  keyof typeof SCHEMA_REGISTRY
>;

// Type-safe table name union
export type TableName = keyof typeof SCHEMA_REGISTRY;
