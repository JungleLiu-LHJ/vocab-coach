import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS learning_scope_progress (
  scope_id TEXT PRIMARY KEY,
  scope_type TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  conversation_id TEXT,
  from_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  account_id TEXT,
  level INTEGER NOT NULL DEFAULT 7,
  last_push_time INTEGER NOT NULL DEFAULT 0,
  daily_target INTEGER NOT NULL DEFAULT 5,
  active_hours_start INTEGER NOT NULL DEFAULT 9,
  active_hours_end INTEGER NOT NULL DEFAULT 22,
  vocab_source TEXT NOT NULL DEFAULT 'ielts',
  native_lang TEXT NOT NULL DEFAULT 'zh',
  target_lang TEXT NOT NULL DEFAULT 'en',
  timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  paused INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_scope_progress_channel
  ON learning_scope_progress(channel_id, conversation_id);

CREATE TABLE IF NOT EXISTS word_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope_id TEXT NOT NULL,
  word_id INTEGER NOT NULL,
  stability REAL NOT NULL DEFAULT 1.0,
  difficulty REAL NOT NULL DEFAULT 5.0,
  next_review INTEGER NOT NULL,
  reviews INTEGER NOT NULL DEFAULT 0,
  lapses INTEGER NOT NULL DEFAULT 0,
  mastered INTEGER NOT NULL DEFAULT 0,
  mastered_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  FOREIGN KEY (scope_id) REFERENCES learning_scope_progress(scope_id) ON DELETE CASCADE,
  UNIQUE(scope_id, word_id)
);

CREATE INDEX IF NOT EXISTS idx_word_progress_scope_next
  ON word_progress(scope_id, next_review);
CREATE INDEX IF NOT EXISTS idx_word_progress_scope_mastered
  ON word_progress(scope_id, mastered, next_review);

CREATE TABLE IF NOT EXISTS word_bank (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope_id TEXT NOT NULL,
  word_id INTEGER NOT NULL,
  custom_note TEXT,
  custom_mnemonic TEXT,
  difficulty_rating INTEGER,
  is_favorite INTEGER NOT NULL DEFAULT 0,
  is_archived INTEGER NOT NULL DEFAULT 0,
  added_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  FOREIGN KEY (scope_id) REFERENCES learning_scope_progress(scope_id) ON DELETE CASCADE,
  UNIQUE(scope_id, word_id)
);

CREATE TABLE IF NOT EXISTS push_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope_id TEXT NOT NULL,
  word_id INTEGER NOT NULL,
  push_type TEXT NOT NULL,
  rating TEXT,
  response_time INTEGER,
  pushed_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  FOREIGN KEY (scope_id) REFERENCES learning_scope_progress(scope_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_push_log_scope_time
  ON push_log(scope_id, pushed_at);
`;

export class VocabDatabase {
  private db: Database.Database;
  private static instances = new Map<string, VocabDatabase>();

  private constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('synchronous = NORMAL');
    this.db.exec(SCHEMA_SQL);
    this.runMigrations();
  }

  // 给已存在的旧 DB 升级缺失字段。SQLite 不支持 ADD COLUMN IF NOT EXISTS，
  // 因此先用 PRAGMA 检查列是否存在，再决定是否 ALTER。
  private runMigrations(): void {
    const cols = this.db
      .prepare("PRAGMA table_info(learning_scope_progress)")
      .all() as Array<{ name: string }>;
    const colNames = new Set(cols.map((c) => c.name));
    if (!colNames.has('target_lang')) {
      this.db.exec(`ALTER TABLE learning_scope_progress ADD COLUMN target_lang TEXT NOT NULL DEFAULT 'en'`);
    }
  }

  static getInstance(stateDir: string): VocabDatabase {
    const dir = stateDir || process.cwd();
    const existing = VocabDatabase.instances.get(dir);
    if (existing) return existing;

    mkdirSync(dir, { recursive: true });
    const db = new VocabDatabase(join(dir, 'vocab.db'));
    VocabDatabase.instances.set(dir, db);
    return db;
  }

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  prepare(sql: string): Database.Statement {
    return this.db.prepare(sql);
  }

  query<T>(sql: string, params: unknown[] = []): T[] {
    return this.db.prepare(sql).all(...params) as T[];
  }

  queryOne<T>(sql: string, params: unknown[] = []): T | undefined {
    return this.db.prepare(sql).get(...params) as T | undefined;
  }

  execute(sql: string, params: unknown[] = []): Database.RunResult {
    return this.db.prepare(sql).run(...params);
  }

  close(): void {
    const matched = [...VocabDatabase.instances.entries()].find(([, value]) => value === this);
    if (matched) VocabDatabase.instances.delete(matched[0]);
    this.db.close();
  }
}
