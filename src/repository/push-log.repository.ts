import type { VocabDatabase } from '../db/database.js';
import type { FeedbackRating } from '../types.js';

export class PushLogRepository {
  constructor(private readonly db: VocabDatabase) {}

  logPush(scopeId: string, wordId: number, pushType: 'new' | 'review'): void {
    this.db.execute(
      'INSERT INTO push_log (scope_id, word_id, push_type, pushed_at) VALUES (?, ?, ?, ?)',
      [scopeId, wordId, pushType, Date.now()],
    );
  }

  logFeedback(scopeId: string, wordId: number, rating: FeedbackRating): void {
    this.db.execute(
      'INSERT INTO push_log (scope_id, word_id, push_type, rating, pushed_at) VALUES (?, ?, ?, ?, ?)',
      [scopeId, wordId, 'feedback', rating, Date.now()],
    );
  }

  getTodayCount(scopeId: string, now: number = Date.now()): number {
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    return this.db.queryOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM push_log WHERE scope_id = ? AND push_type IN (?, ?) AND pushed_at >= ?',
      [scopeId, 'new', 'review', startOfDay.getTime()],
    )?.count ?? 0;
  }

  getLatestPushedWord(scopeId: string): { wordId: number; pushType: 'new' | 'review'; pushedAt: number } | null {
    const row = this.db.queryOne<{ word_id: number; push_type: 'new' | 'review'; pushed_at: number }>(
      'SELECT word_id, push_type, pushed_at FROM push_log WHERE scope_id = ? AND push_type IN (?, ?) ORDER BY pushed_at DESC LIMIT 1',
      [scopeId, 'new', 'review'],
    );
    if (!row) return null;
    return { wordId: row.word_id, pushType: row.push_type, pushedAt: row.pushed_at };
  }
}
