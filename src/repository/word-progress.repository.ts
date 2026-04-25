import type { VocabDatabase } from '../db/database.js';
import type { FSRSState } from '../types.js';

export interface WordProgressRecord {
  id: number;
  scope_id: string;
  word_id: number;
  stability: number;
  difficulty: number;
  next_review: number;
  reviews: number;
  lapses: number;
  mastered: number;
  mastered_at: number | null;
}

function toState(record: WordProgressRecord): FSRSState {
  return {
    s: record.stability,
    d: record.difficulty,
    next: record.next_review,
    reviews: record.reviews,
    lapses: record.lapses,
  };
}

export class WordProgressRepository {
  constructor(private readonly db: VocabDatabase) {}

  getByScopeId(scopeId: string): WordProgressRecord[] {
    return this.db.query<WordProgressRecord>(
      'SELECT * FROM word_progress WHERE scope_id = ? ORDER BY next_review ASC',
      [scopeId],
    );
  }

  getByWord(scopeId: string, wordId: number): WordProgressRecord | undefined {
    return this.db.queryOne<WordProgressRecord>(
      'SELECT * FROM word_progress WHERE scope_id = ? AND word_id = ?',
      [scopeId, wordId],
    );
  }

  getMasteredWordIds(scopeId: string): number[] {
    const rows = this.db.query<{ word_id: number }>(
      'SELECT word_id FROM word_progress WHERE scope_id = ? AND mastered = 1',
      [scopeId],
    );
    return rows.map((row) => row.word_id);
  }

  getWeights(scopeId: string): Record<number, FSRSState> {
    const rows = this.getByScopeId(scopeId);
    return Object.fromEntries(rows.map((row) => [row.word_id, toState(row)]));
  }

  saveState(scopeId: string, wordId: number, state: FSRSState, mastered: boolean): void {
    const existing = this.getByWord(scopeId, wordId);
    const now = Date.now();
    const masteredAt = mastered ? now : null;

    if (existing) {
      this.db.execute(
        `UPDATE word_progress
         SET stability = ?, difficulty = ?, next_review = ?, reviews = ?, lapses = ?,
             mastered = ?, mastered_at = COALESCE(?, mastered_at), updated_at = ?
         WHERE scope_id = ? AND word_id = ?`,
        [
          state.s,
          state.d,
          state.next,
          state.reviews,
          state.lapses,
          mastered ? 1 : 0,
          masteredAt,
          now,
          scopeId,
          wordId,
        ],
      );
      return;
    }

    this.db.execute(
      `INSERT INTO word_progress (
        scope_id, word_id, stability, difficulty, next_review, reviews, lapses,
        mastered, mastered_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        scopeId,
        wordId,
        state.s,
        state.d,
        state.next,
        state.reviews,
        state.lapses,
        mastered ? 1 : 0,
        masteredAt,
        now,
        now,
      ],
    );
  }

  getStats(scopeId: string, now: number): {
    totalWords: number;
    masteredWords: number;
    dueWords: number;
    newWords: number;
  } {
    const totalWords = this.db.queryOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM word_progress WHERE scope_id = ?',
      [scopeId],
    )?.count ?? 0;
    const masteredWords = this.db.queryOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM word_progress WHERE scope_id = ? AND mastered = 1',
      [scopeId],
    )?.count ?? 0;
    const dueWords = this.db.queryOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM word_progress WHERE scope_id = ? AND mastered = 0 AND next_review <= ?',
      [scopeId, now],
    )?.count ?? 0;
    const newWords = this.db.queryOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM word_progress WHERE scope_id = ? AND reviews = 0',
      [scopeId],
    )?.count ?? 0;

    return { totalWords, masteredWords, dueWords, newWords };
  }
}
