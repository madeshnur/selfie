import Database from "$lib/db";
import type {
  PomodoroSession,
  PomodoroLog,
  PomodoroStreak,
  AppSettings,
} from "$lib/db/schemas";

/**
 * Pomodoro Service - Auto-timer implementation
 * Sessions run automatically for set duration and complete when time runs out
 * Pause/Resume are manual controls
 */
export class PomodoroService {
  private db: Database;
  private activeTimer: NodeJS.Timeout | null = null;
  private currentSessionId: string | null = null;
  private tickInterval = 1000; // 1 second

  constructor() {
    this.db = Database.getInstance();
  }

  // ============================================
  // SESSION MANAGEMENT - AUTO-TIMER
  // ============================================

  /**
   * Start a new Pomodoro session
   * Timer starts automatically and will complete after duration expires
   * @returns Session ID
   */
  async startSession(): Promise<string> {
    // Check if there's already an active or paused session
    const existingSession = await this.getActiveOrPausedSession();
    if (existingSession) {
      throw new Error(
        `Session #${existingSession.session_number} is already ${existingSession.status}`
      );
    }

    const today = this.getTodayDate();
    const settings = await this.getSettings();

    // Get today's session count to determine session number
    const todaySessions = await this.db.pomodoro_sessions.findAll({
      session_date: today,
      _orderBy: "session_number",
      _orderDir: "DESC",
    });

    const sessionNumber =
      todaySessions.length > 0 ? todaySessions[0].session_number + 1 : 1;

    // Create session with remaining time = planned duration
    const sessionId = await this.db.pomodoro_sessions.create({
      session_date: today,
      session_number: sessionNumber,
      status: "active",
      planned_duration: settings.work_session_duration,
      actual_duration: settings.work_session_duration, // Will decrement as timer runs
      pause_count: 0,
      total_pause_duration: 0,
      started_at: Date.now(),
      completed_at: null,
      efficiency_score: 0,
    });

    // Start auto-timer
    this.currentSessionId = sessionId;
    this.startTimer();

    console.log(
      `✅ Started session #${sessionNumber} - ${settings.work_session_duration} minutes`
    );
    return sessionId;
  }

  /**
   * Internal timer that runs every second
   * Decrements remaining time and auto-completes when done
   */
  private startTimer(): void {
    this.stopTimer(); // Clear any existing timer

    this.activeTimer = setInterval(async () => {
      if (!this.currentSessionId) {
        this.stopTimer();
        return;
      }

      try {
        const session = await this.db.pomodoro_sessions.findById(
          this.currentSessionId
        );

        if (!session || session.status !== "active") {
          this.stopTimer();
          return;
        }

        // Calculate elapsed time in minutes
        const elapsedMs = Date.now() - session.started_at;
        const elapsedMinutes = elapsedMs / 1000 / 60;
        const pauseMinutes = session.total_pause_duration / 60;
        const workMinutes = elapsedMinutes - pauseMinutes;

        // Calculate remaining time
        const remainingMinutes = Math.max(
          0,
          session.planned_duration - workMinutes
        );

        // Check if session should complete
        if (remainingMinutes <= 0) {
          await this.autoCompleteSession(this.currentSessionId);
          this.stopTimer();
          return;
        }

        // Update remaining time (stored in actual_duration for now)
        await this.db.pomodoro_sessions.update(this.currentSessionId, {
          actual_duration: Math.ceil(remainingMinutes),
        });
      } catch (error) {
        console.error("Timer error:", error);
        this.stopTimer();
      }
    }, this.tickInterval);
  }

  /**
   * Stop the internal timer
   */
  private stopTimer(): void {
    if (this.activeTimer) {
      clearInterval(this.activeTimer);
      this.activeTimer = null;
    }
  }

  /**
   * Auto-complete session when timer reaches 0
   */
  private async autoCompleteSession(sessionId: string): Promise<void> {
    const session = await this.db.pomodoro_sessions.findById(sessionId);
    if (!session) return;

    // Calculate actual work time
    const totalElapsedMs = Date.now() - session.started_at;
    const totalElapsedMinutes = totalElapsedMs / 1000 / 60;
    const pauseMinutes = session.total_pause_duration / 60;
    const actualWorkMinutes = Math.round(totalElapsedMinutes - pauseMinutes);

    // Calculate efficiency (should be ~100% if no pauses and ran full duration)
    const efficiency = this.calculateEfficiency(
      session.planned_duration,
      actualWorkMinutes,
      session.total_pause_duration
    );

    await this.db.pomodoro_sessions.update(sessionId, {
      status: "completed",
      actual_duration: actualWorkMinutes,
      completed_at: Date.now(),
      efficiency_score: efficiency,
    });

    this.currentSessionId = null;

    console.log(
      `🎉 Session #${session.session_number} auto-completed! (${actualWorkMinutes} minutes)`
    );

    // Update daily log
    await this.updateDailyLog(session.session_date);

    // TODO: Trigger notification/sound in UI
  }

  /**
   * Manually pause the running session
   * Timer stops counting down
   * @param sessionId - Session ID to pause
   */
  async pauseSession(sessionId: string): Promise<void> {
    const session = await this.db.pomodoro_sessions.findById(sessionId);
    if (!session) throw new Error("Session not found");

    if (session.status !== "active") {
      throw new Error("Can only pause active sessions");
    }

    // Stop the timer
    this.stopTimer();

    // Update status to paused
    await this.db.pomodoro_sessions.update(sessionId, {
      status: "paused",
      pause_count: session.pause_count + 1,
    });

    console.log(`⏸️ Session paused (pause #${session.pause_count + 1})`);
  }

  /**
   * Manually resume the paused session
   * Timer continues counting down from where it left off
   * @param sessionId - Session ID to resume
   */
  async resumeSession(sessionId: string): Promise<void> {
    const session = await this.db.pomodoro_sessions.findById(sessionId);
    if (!session) throw new Error("Session not found");

    if (session.status !== "paused") {
      throw new Error("Session is not paused");
    }

    // Calculate pause duration
    const pauseStartTime = session.updated_at;
    const pauseDuration = Math.floor((Date.now() - pauseStartTime) / 1000);

    // Update session
    await this.db.pomodoro_sessions.update(sessionId, {
      status: "active",
      total_pause_duration: session.total_pause_duration + pauseDuration,
    });

    // Restart timer
    this.currentSessionId = sessionId;
    this.startTimer();

    console.log(
      `▶️ Session resumed (paused for ${Math.round(
        pauseDuration / 60
      )} minutes)`
    );
  }

  /**
   * Manually complete session before timer expires
   * Use this if user wants to end session early
   * @param sessionId - Session ID to complete
   */
  async completeSessionManually(sessionId: string): Promise<void> {
    const session = await this.db.pomodoro_sessions.findById(sessionId);
    if (!session) throw new Error("Session not found");

    if (session.status !== "active" && session.status !== "paused") {
      throw new Error("Can only complete active or paused sessions");
    }

    // Stop timer if running
    if (this.currentSessionId === sessionId) {
      this.stopTimer();
      this.currentSessionId = null;
    }

    // Calculate actual work time
    const totalElapsedMs = Date.now() - session.started_at;
    const totalElapsedMinutes = totalElapsedMs / 1000 / 60;
    const pauseMinutes = session.total_pause_duration / 60;
    const actualWorkMinutes = Math.round(totalElapsedMinutes - pauseMinutes);

    // Calculate efficiency
    const efficiency = this.calculateEfficiency(
      session.planned_duration,
      actualWorkMinutes,
      session.total_pause_duration
    );

    await this.db.pomodoro_sessions.update(sessionId, {
      status: "completed",
      actual_duration: actualWorkMinutes,
      completed_at: Date.now(),
      efficiency_score: efficiency,
    });

    console.log(`✅ Session manually completed (${actualWorkMinutes} minutes)`);

    // Update daily log
    await this.updateDailyLog(session.session_date);
  }

  /**
   * Cancel session
   * @param sessionId - Session ID to cancel
   */
  async cancelSession(sessionId: string): Promise<void> {
    // Stop timer if running
    if (this.currentSessionId === sessionId) {
      this.stopTimer();
      this.currentSessionId = null;
    }

    await this.db.pomodoro_sessions.update(sessionId, {
      status: "cancelled",
    });

    console.log("❌ Session cancelled");
  }

  // ============================================
  // SESSION STATUS & PROGRESS
  // ============================================

  /**
   * Get current session progress in real-time
   * @param sessionId - Session ID
   */
  async getSessionProgress(sessionId: string) {
    const session = await this.db.pomodoro_sessions.findById(sessionId);
    if (!session) throw new Error("Session not found");

    const now = Date.now();
    const totalElapsedMs = now - session.started_at;
    const totalElapsedMinutes = totalElapsedMs / 1000 / 60;
    const pauseMinutes = session.total_pause_duration / 60;
    const workMinutes = totalElapsedMinutes - pauseMinutes;
    const remainingMinutes = Math.max(
      0,
      session.planned_duration - workMinutes
    );
    const remainingSeconds = Math.max(0, Math.round(remainingMinutes * 60));

    return {
      sessionId: session.id,
      sessionNumber: session.session_number,
      status: session.status,
      plannedDuration: session.planned_duration,
      elapsedWork: Math.round(workMinutes),
      remainingMinutes: Math.floor(remainingMinutes),
      remainingSeconds: remainingSeconds % 60,
      totalRemainingSeconds: remainingSeconds,
      pauseCount: session.pause_count,
      totalPauseTime: Math.round(pauseMinutes),
      percentComplete: Math.min(
        100,
        (workMinutes / session.planned_duration) * 100
      ),
      formattedTime: this.formatTime(remainingSeconds),
    };
  }

  /**
   * Format seconds into MM:SS
   */
  private formatTime(totalSeconds: number): string {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
      2,
      "0"
    )}`;
  }

  /**
   * Get active or paused session (if any)
   */
  async getActiveOrPausedSession(): Promise<PomodoroSession | null> {
    const sessions = await this.db.query(`
      SELECT * FROM pomodoro_sessions 
      WHERE (status = 'active' OR status = 'paused')
        AND deleted = 0
      ORDER BY started_at DESC 
      LIMIT 1
    `);

    return sessions.length > 0 ? sessions[0] : null;
  }

  // ============================================
  // DAILY LOG MANAGEMENT
  // ============================================

  /**
   * Update or create daily log based on completed sessions
   */
  private async updateDailyLog(date: string): Promise<void> {
    const settings = await this.getSettings();

    // Get all completed sessions for the day
    const sessions = await this.db.pomodoro_sessions.findAll({
      session_date: date,
      status: "completed",
    });

    if (sessions.length === 0) {
      console.log("No completed sessions to aggregate");
      return;
    }

    // Calculate aggregates
    const workSessions = sessions.length;
    const totalWorkTime = sessions.reduce(
      (sum, s) => sum + s.actual_duration,
      0
    );
    const averageEfficiency =
      sessions.reduce((sum, s) => sum + s.efficiency_score, 0) / workSessions;
    const totalPauseCount = sessions.reduce((sum, s) => sum + s.pause_count, 0);
    const completionRate = workSessions / settings.daily_target_sessions;

    // Calculate weighted focus score (1-10 scale)
    const focusScore = this.calculateFocusScore({
      completionRate,
      averageEfficiency,
      totalPauseCount,
      workSessions,
      targetSessions: settings.daily_target_sessions,
    });

    // Check if log exists
    const existingLogs = await this.db.pomodoro_log.findAll({ log_date: date });

    const logData = {
      log_date: date,
      work_sessions: workSessions,
      total_work_time: totalWorkTime,
      target_sessions: settings.daily_target_sessions,
      focus_score: focusScore,
      average_efficiency: averageEfficiency,
      total_pause_count: totalPauseCount,
      completion_rate: completionRate,
      daily_notes: null,
    };

    if (existingLogs.length > 0) {
      await this.db.pomodoro_log.update(existingLogs[0].id, logData);
      console.log(`📊 Updated daily log for ${date}`);
    } else {
      await this.db.pomodoro_log.create(logData);
      console.log(`📊 Created daily log for ${date}`);
    }

    // Update streak
    await this.updateStreak();
  }

  /**
   * Calculate efficiency score for a session
   */
  private calculateEfficiency(
    plannedMinutes: number,
    actualMinutes: number,
    pauseSeconds: number
  ): number {
    const pauseMinutes = pauseSeconds / 60;
    const effectiveMinutes = actualMinutes - pauseMinutes;
    const efficiency = plannedMinutes / effectiveMinutes;

    let score = 100;

    if (efficiency >= 0.95 && efficiency <= 1.05) {
      score = 100;
    } else if (efficiency < 0.95) {
      score = Math.max(0, 100 - (1 - efficiency) * 200);
    } else {
      score = Math.max(70, 100 - (efficiency - 1) * 50);
    }

    return Math.round(score);
  }

  /**
   * Calculate weighted focus score (1-10 scale)
   */
  private calculateFocusScore(data: {
    completionRate: number;
    averageEfficiency: number;
    totalPauseCount: number;
    workSessions: number;
    targetSessions: number;
  }): number {
    const completionScore = Math.min(10, data.completionRate * 10);
    const efficiencyScore = (data.averageEfficiency / 100) * 10;

    const pausesPerSession = data.totalPauseCount / data.workSessions;
    let pauseScore = 10;
    if (pausesPerSession > 0) {
      pauseScore = Math.max(0, 10 - pausesPerSession * 2);
    }

    const volumeBonus =
      data.workSessions >= data.targetSessions
        ? 10
        : (data.workSessions / data.targetSessions) * 10;

    const focusScore =
      completionScore * 0.4 +
      efficiencyScore * 0.35 +
      pauseScore * 0.15 +
      volumeBonus * 0.1;

    return Math.max(1, Math.min(10, Math.round(focusScore * 10) / 10));
  }

  /**
   * Manually update focus score for a day
   */
  async updateFocusScore(date: string, score: number): Promise<void> {
    const logs = await this.db.pomodoro_log.findAll({ log_date: date });
    if (logs.length === 0) throw new Error(`No log found for ${date}`);

    await this.db.pomodoro_log.update(logs[0].id, {
      focus_score: Math.max(1, Math.min(10, score)),
    });
  }

  /**
   * Add or update daily notes
   */
  async updateDailyNotes(date: string, notes: string): Promise<void> {
    const logs = await this.db.pomodoro_log.findAll({ log_date: date });
    if (logs.length === 0) throw new Error(`No log found for ${date}`);

    await this.db.pomodoro_log.update(logs[0].id, { daily_notes: notes });
  }

  // ============================================
  // STREAK TRACKING
  // ============================================

  async updateStreak(): Promise<void> {
    const settings = await this.getSettings();
    const logs = await this.db.pomodoro_log.findAll({
      _orderBy: "log_date",
      _orderDir: "DESC",
    });

    if (logs.length === 0) {
      await this.saveStreak(0, 0, 0, null);
      return;
    }

    let currentStreak = 0;
    let bestStreak = 0;
    let tempStreak = 0;
    let lastDate: Date | null = null;
    const totalDaysLogged = logs.length;

    for (const log of logs.reverse()) {
      const logDate = new Date(log.log_date);
      const hitTarget = log.work_sessions >= settings.daily_target_sessions;

      if (hitTarget) {
        if (!lastDate || this.isConsecutiveDay(lastDate, logDate)) {
          tempStreak++;
          bestStreak = Math.max(bestStreak, tempStreak);
        } else {
          tempStreak = 1;
        }
        lastDate = logDate;
      } else {
        tempStreak = 0;
      }
    }

    const today = new Date();
    const lastLogDate = new Date(logs[0].log_date);
    currentStreak =
      this.isConsecutiveDay(lastLogDate, today) ||
      lastLogDate.toDateString() === today.toDateString()
        ? tempStreak
        : 0;

    await this.saveStreak(
      currentStreak,
      bestStreak,
      totalDaysLogged,
      logs[0].log_date
    );
  }

  private isConsecutiveDay(date1: Date, date2: Date): boolean {
    const oneDay = 24 * 60 * 60 * 1000;
    const diffDays = Math.round(
      Math.abs((date2.getTime() - date1.getTime()) / oneDay)
    );
    return diffDays === 1;
  }

  private async saveStreak(
    current: number,
    best: number,
    total: number,
    lastDate: string | null
  ): Promise<void> {
    const existing = await this.db.pomodoro_streak.findAll({});
    const streakData = {
      current_streak: current,
      best_streak: best,
      total_days_logged: total,
      last_streak_date: lastDate,
    };

    if (existing.length > 0) {
      await this.db.pomodoro_streak.update(existing[0].id, streakData);
    } else {
      await this.db.pomodoro_streak.create(streakData);
    }
  }

  async getStreak(): Promise<PomodoroStreak | null> {
    const streaks = await this.db.pomodoro_streak.findAll({});
    return streaks.length > 0 ? streaks[0] : null;
  }

  // ============================================
  // STATISTICS & ANALYTICS
  // ============================================

  async getTodayProgress() {
    const today = this.getTodayDate();
    const settings = await this.getSettings();

    const sessions = await this.db.pomodoro_sessions.findAll({
      session_date: today,
      status: "completed",
    });

    const totalMinutes = sessions.reduce(
      (sum, s) => sum + s.actual_duration,
      0
    );

    return {
      date: today,
      completedSessions: sessions.length,
      targetSessions: settings.daily_target_sessions,
      totalMinutes,
      progressPercentage:
        (sessions.length / settings.daily_target_sessions) * 100,
      remainingSessions: Math.max(
        0,
        settings.daily_target_sessions - sessions.length
      ),
    };
  }

  async getDailyLog(date: string): Promise<PomodoroLog | null> {
    const logs = await this.db.pomodoro_log.findAll({ log_date: date });
    return logs.length > 0 ? logs[0] : null;
  }

  async getWeeklySummary(startDate: string, endDate: string) {
    const logs = await this.db.query(
      `
      SELECT * FROM pomodoro_log
      WHERE log_date BETWEEN ? AND ? AND deleted = 0
      ORDER BY log_date ASC
    `,
      [startDate, endDate]
    );

    if (logs.length === 0) {
      return {
        logs: [],
        totalSessions: 0,
        averageFocusScore: 0,
        daysTracked: 0,
        daysHitTarget: 0,
        totalMinutes: 0,
      };
    }

    const totalSessions = logs.reduce(
      (sum: number, log: any) => sum + log.work_sessions,
      0
    );
    const avgFocusScore =
      logs.reduce((sum: number, log: any) => sum + log.focus_score, 0) /
      logs.length;
    const daysHitTarget = logs.filter(
      (log: any) => log.completion_rate >= 1
    ).length;

    return {
      logs,
      totalSessions,
      averageFocusScore: Math.round(avgFocusScore * 10) / 10,
      daysTracked: logs.length,
      daysHitTarget,
      totalMinutes: logs.reduce(
        (sum: number, log: any) => sum + log.total_work_time,
        0
      ),
    };
  }

  async getMonthlySummary(year: number, month: number) {
    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, "0")}-${lastDay}`;
    return await this.getWeeklySummary(startDate, endDate);
  }

  async getAllTimeStats() {
    const allLogs = await this.db.pomodoro_log.findAll({});
    const streak = await this.getStreak();

    if (allLogs.length === 0) {
      return {
        totalDays: 0,
        totalSessions: 0,
        totalMinutes: 0,
        averageFocusScore: 0,
        bestStreak: 0,
        currentStreak: 0,
      };
    }

    const totalSessions = allLogs.reduce(
      (sum, log) => sum + log.work_sessions,
      0
    );
    const totalMinutes = allLogs.reduce(
      (sum, log) => sum + log.total_work_time,
      0
    );
    const avgFocusScore =
      allLogs.reduce((sum, log) => sum + log.focus_score, 0) / allLogs.length;

    return {
      totalDays: allLogs.length,
      totalSessions,
      totalMinutes,
      totalHours: Math.round((totalMinutes / 60) * 10) / 10,
      averageFocusScore: Math.round(avgFocusScore * 10) / 10,
      bestStreak: streak?.best_streak || 0,
      currentStreak: streak?.current_streak || 0,
    };
  }

  // ============================================
  // SETTINGS MANAGEMENT
  // ============================================

  async getSettings(): Promise<AppSettings> {
    const settings = await this.db.app_settings.findAll({});

    if (settings.length === 0) {
      const defaultId = await this.db.app_settings.create({
        work_session_duration: 25,
        daily_target_sessions: 8,
        short_break_duration: 5,
        long_break_duration: 15,
        sessions_before_long_break: 4,
      });

      const newSettings = await this.db.app_settings.findById(defaultId);
      if (!newSettings) throw new Error("Failed to create default settings");
      return newSettings;
    }

    return settings[0];
  }

  async updateSettings(
    updates: Partial<
      Omit<AppSettings, keyof import("$lib/db/types").BaseRecord>
    >
  ): Promise<void> {
    const settings = await this.getSettings();
    await this.db.app_settings.update(settings.id, updates);
  }

  // ============================================
  // HELPERS
  // ============================================

  private getTodayDate(): string {
    return new Date().toISOString().split("T")[0];
  }

  async getSessionsForDate(date: string): Promise<PomodoroSession[]> {
    return await this.db.pomodoro_sessions.findAll({
      session_date: date,
      _orderBy: "session_number",
      _orderDir: "ASC",
    });
  }

  /**
   * Cleanup - call this when app closes
   */
  cleanup(): void {
    this.stopTimer();
  }
}

// Export singleton instance
export default new PomodoroService();
