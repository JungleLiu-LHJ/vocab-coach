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
