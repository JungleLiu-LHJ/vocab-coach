import type { VocabDatabase } from '../db/database.js';
import type { LearningScope, ScopeConfig, ScopeProgress } from '../types.js';

interface ScopeRow {
  scope_id: string;
  scope_type: 'direct' | 'channel';
  channel_id: string;
  conversation_id: string | null;
  from_id: string;
  target_id: string;
  account_id: string | null;
  level: number;
  last_push_time: number;
  daily_target: number;
  active_hours_start: number;
  active_hours_end: number;
  vocab_source: string;
  native_lang: string;
  target_lang: string;
  timezone: string;
  paused: number;
}

function toConfig(row: ScopeRow): ScopeConfig {
  return {
    activeHoursStart: row.active_hours_start,
    activeHoursEnd: row.active_hours_end,
    timezone: row.timezone,
    dailyTarget: row.daily_target,
    vocabSource: row.vocab_source,
    nativeLang: row.native_lang,
    // 老数据兼容：迁移后字段存在但未填充时回落到 'en'
    targetLang: row.target_lang || 'en',
    paused: row.paused === 1,
  };
}

function toScopeProgress(row: ScopeRow): ScopeProgress {
  return {
    scopeId: row.scope_id,
    scopeType: row.scope_type,
    channelId: row.channel_id,
    conversationId: row.conversation_id ?? undefined,
    fromId: row.from_id,
    targetId: row.target_id,
    accountId: row.account_id ?? undefined,
    level: row.level,
    lastPushTime: row.last_push_time,
    config: toConfig(row),
  };
}

export class UserRepository {
  constructor(private readonly db: VocabDatabase) {}

  getByScopeId(scopeId: string): ScopeProgress | undefined {
    const row = this.db.queryOne<ScopeRow>(
      'SELECT * FROM learning_scope_progress WHERE scope_id = ?',
      [scopeId],
    );
    return row ? toScopeProgress(row) : undefined;
  }

  createScope(scope: LearningScope, config: ScopeConfig): void {
    const now = Date.now();
    this.db.execute(
      `INSERT INTO learning_scope_progress (
        scope_id, scope_type, channel_id, conversation_id, from_id, target_id, account_id,
        level, last_push_time, daily_target, active_hours_start, active_hours_end,
        vocab_source, native_lang, target_lang, timezone, paused, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 7, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        scope.scopeId,
        scope.scopeType,
        scope.channelId,
        scope.conversationId ?? null,
        scope.fromId,
        scope.targetId,
        scope.accountId ?? null,
        config.dailyTarget,
        config.activeHoursStart,
        config.activeHoursEnd,
        config.vocabSource,
        config.nativeLang,
        config.targetLang,
        config.timezone,
        config.paused ? 1 : 0,
        now,
        now,
      ],
    );
  }

  upsertScope(scope: LearningScope, config: ScopeConfig): ScopeProgress {
    const existing = this.getByScopeId(scope.scopeId);
    if (!existing) {
      this.createScope(scope, config);
      return this.getByScopeId(scope.scopeId)!;
    }

    this.db.execute(
      `UPDATE learning_scope_progress
       SET scope_type = ?, channel_id = ?, conversation_id = ?, from_id = ?, target_id = ?, account_id = ?,
           daily_target = ?, active_hours_start = ?, active_hours_end = ?, vocab_source = ?,
           native_lang = ?, target_lang = ?, timezone = ?, paused = ?, updated_at = ?
       WHERE scope_id = ?`,
      [
        scope.scopeType,
        scope.channelId,
        scope.conversationId ?? null,
        scope.fromId,
        scope.targetId,
        scope.accountId ?? null,
        config.dailyTarget,
        config.activeHoursStart,
        config.activeHoursEnd,
        config.vocabSource,
        config.nativeLang,
        config.targetLang,
        config.timezone,
        config.paused ? 1 : 0,
        Date.now(),
        scope.scopeId,
      ],
    );

    return this.getByScopeId(scope.scopeId)!;
  }

  updateConfig(scopeId: string, config: ScopeConfig): void {
    this.db.execute(
      `UPDATE learning_scope_progress
       SET daily_target = ?, active_hours_start = ?, active_hours_end = ?, vocab_source = ?,
           native_lang = ?, target_lang = ?, timezone = ?, paused = ?, updated_at = ?
       WHERE scope_id = ?`,
      [
        config.dailyTarget,
        config.activeHoursStart,
        config.activeHoursEnd,
        config.vocabSource,
        config.nativeLang,
        config.targetLang,
        config.timezone,
        config.paused ? 1 : 0,
        Date.now(),
        scopeId,
      ],
    );
  }

  updateLastPushTime(scopeId: string, timestamp: number): void {
    this.db.execute(
      'UPDATE learning_scope_progress SET last_push_time = ?, updated_at = ? WHERE scope_id = ?',
      [timestamp, Date.now(), scopeId],
    );
  }

  updateLevel(scopeId: string, level: number): void {
    this.db.execute(
      'UPDATE learning_scope_progress SET level = ?, updated_at = ? WHERE scope_id = ?',
      [level, Date.now(), scopeId],
    );
  }

  getActiveScopes(): ScopeProgress[] {
    const rows = this.db.query<ScopeRow>(
      'SELECT * FROM learning_scope_progress WHERE paused = 0',
    );
    return rows.map(toScopeProgress);
  }
}
