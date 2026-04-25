import type { VocabDatabase } from '../db/database.js';

export interface WordBankRecord {
  id: number;
  scope_id: string;
  word_id: number;
  custom_note: string | null;
  custom_mnemonic: string | null;
  difficulty_rating: number | null;
  is_favorite: number;
  is_archived: number;
}

export class WordBankRepository {
  private db: VocabDatabase;

  constructor(db: VocabDatabase) {
    this.db = db;
  }

  addToBank(scopeId: string, wordId: number): void {
    const sql = `INSERT OR IGNORE INTO word_bank (scope_id, word_id, added_at, updated_at) VALUES (?, ?, ?, ?)`;
    const now = Date.now();
    this.db.execute(sql, [scopeId, wordId, now, now]);
  }

  removeFromBank(scopeId: string, wordId: number): void {
    const sql = `DELETE FROM word_bank WHERE scope_id = ? AND word_id = ?`;
    this.db.execute(sql, [scopeId, wordId]);
  }

  getFavorites(scopeId: string): WordBankRecord[] {
    const sql = `SELECT * FROM word_bank WHERE scope_id = ? AND is_favorite = 1`;
    return this.db.query<WordBankRecord>(sql, [scopeId]);
  }

  updateNote(scopeId: string, wordId: number, note: string, mnemonic?: string): void {
    const sql = `UPDATE word_bank SET custom_note = ?, custom_mnemonic = ?, updated_at = ? WHERE scope_id = ? AND word_id = ?`;
    this.db.execute(sql, [note, mnemonic || null, Date.now(), scopeId, wordId]);
  }

  toggleFavorite(scopeId: string, wordId: number): void {
    const sql = `UPDATE word_bank SET is_favorite = CASE WHEN is_favorite = 1 THEN 0 ELSE 1 END, updated_at = ? WHERE scope_id = ? AND word_id = ?`;
    this.db.execute(sql, [Date.now(), scopeId, wordId]);
  }
}
