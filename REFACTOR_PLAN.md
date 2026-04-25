# Vocab Coach 重构计划

**版本:** 2.0  
**日期:** 2026-03-18  
**目标:** 按 OpenClaw Plugin Best Practice 重构，解决数据隔离、并发安全、架构混乱问题

---

## 1. 数据库选型分析

### 方案对比

| 特性 | JSON 文件 (当前) | SQLite (推荐) | Better-SQLite3 |
|------|-----------------|--------------|----------------|
| **并发安全** | ❌ 文件锁竞争 | ✅ 事务锁 | ✅ 同步事务 |
| **查询性能** | ❌ O(n) 全量读取 | ✅ O(log n) 索引 | ✅ 同步查询 |
| **数据一致性** | ❌ 原子性差 | ✅ ACID | ✅ ACID |
| **备份迁移** | ✅ 简单复制 | ✅ 单文件 | ✅ 单文件 |
| **复杂度** | ✅ 低 | 🟡 中 | 🟡 中 |
| **依赖** | ✅ 无 | ✅ Node.js 内置 | ⚠️ 需 npm 安装 |

### 最终推荐：**Better-SQLite3**

**理由：**
1. ✅ **同步 API** — 无需 async/await，适合插件运行时
2. ✅ **ACID 事务** — 保证多用户并发安全
3. ✅ **单文件存储** — 备份/迁移简单
4. ✅ **索引支持** — 查询效率高（按用户、按到期时间）
5. ✅ **成熟稳定** — npm 下载量高，维护活跃

**安装：**
```bash
cd /Users/claw/Project/myClawVocabulary
npm install better-sqlite3
npm install --save-dev @types/better-sqlite3
```

---

## 2. 数据模型设计

### 2.1 UserProgress 表

```sql
CREATE TABLE user_progress (
  user_id TEXT PRIMARY KEY,        -- channelId:conversationId
  channel_id TEXT NOT NULL,        -- 'feishu', 'telegram', ...
  conversation_id TEXT NOT NULL,   -- 会话 ID（群聊/私聊）
  from_id TEXT NOT NULL,           -- 发送者 ID
  account_id TEXT,                 -- 多账户时的账户 ID
  
  level INTEGER DEFAULT 1,         -- 技能等级 (1-10)
  last_push_time INTEGER DEFAULT 0,
  
  -- 用户配置
  daily_target INTEGER DEFAULT 5,
  active_hours_start INTEGER DEFAULT 9,
  active_hours_end INTEGER DEFAULT 22,
  vocab_source TEXT DEFAULT 'ielts',
  native_lang TEXT DEFAULT 'zh',
  timezone TEXT DEFAULT 'Asia/Shanghai',
  paused BOOLEAN DEFAULT FALSE,
  
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX idx_user_progress_channel ON user_progress(channel_id, conversation_id);
CREATE INDEX idx_user_progress_updated ON user_progress(updated_at);
```

### 2.2 WordProgress 表（FSRS 状态）

```sql
CREATE TABLE word_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  word_id INTEGER NOT NULL,        -- 单词在词库中的 ID
  
  stability REAL DEFAULT 1.0,      -- 稳定性（天数）
  difficulty REAL DEFAULT 5.0,     -- 难度 (1-10)
  next_review INTEGER NOT NULL,    -- 下次复习时间戳（毫秒）
  reviews INTEGER DEFAULT 0,       -- 复习次数
  lapses INTEGER DEFAULT 0,        -- 遗忘次数
  
  mastered BOOLEAN DEFAULT FALSE,  -- 是否已掌握
  mastered_at INTEGER,             -- 掌握时间
  
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  
  FOREIGN KEY (user_id) REFERENCES user_progress(user_id) ON DELETE CASCADE,
  UNIQUE(user_id, word_id)
);

CREATE INDEX idx_word_progress_user ON word_progress(user_id);
CREATE INDEX idx_word_progress_next_review ON word_progress(user_id, next_review);
CREATE INDEX idx_word_progress_mastered ON word_progress(user_id, mastered);
```

### 2.3 UserWordBank 表（用户单词本）

```sql
CREATE TABLE user_word_bank (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  word_id INTEGER NOT NULL,
  
  -- 用户自定义内容
  custom_note TEXT,                -- 个人笔记
  custom_mnemonic TEXT,            -- 个人记忆技巧
  difficulty_rating INTEGER,       -- 用户主观难度 (1-5)
  
  -- 标记
  is_favorite BOOLEAN DEFAULT FALSE,
  is_archived BOOLEAN DEFAULT FALSE,
  
  added_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  
  FOREIGN KEY (user_id) REFERENCES user_progress(user_id) ON DELETE CASCADE,
  UNIQUE(user_id, word_id)
);

CREATE INDEX idx_word_bank_user ON user_word_bank(user_id);
CREATE INDEX idx_word_bank_favorite ON user_word_bank(user_id, is_favorite);
```

### 2.4 PushLog 表（推送日志）

```sql
CREATE TABLE push_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  word_id INTEGER NOT NULL,
  
  push_type TEXT NOT NULL,         -- 'new', 'review'
  rating TEXT,                     -- 'know', 'fuzzy', 'forgot', 'master'
  response_time INTEGER,           -- 用户响应时间（毫秒）
  
  pushed_at INTEGER DEFAULT (strftime('%s', 'now')),
  
  FOREIGN KEY (user_id) REFERENCES user_progress(user_id) ON DELETE CASCADE
);

CREATE INDEX idx_push_log_user ON push_log(user_id);
CREATE INDEX idx_push_log_time ON push_log(pushed_at);
```

---

## 3. 架构设计

### 3.1 分层架构

```
┌─────────────────────────────────────────────────┐
│              Plugin Layer (index.ts)             │
│  - 插件入口                                       │
│  - 注册 Service/Hook/Command                     │
│  - 无业务逻辑，仅协调                            │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│              Service Layer                       │
│  ┌─────────────────────────────────────────┐   │
│  │ SchedulerService                         │   │
│  │ - 泊松调度器                              │   │
│  │ - 定时器管理                              │   │
│  └─────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────┐   │
│  │ PushService                              │   │
│  │ - 单词选择                                │   │
│  │ - 内容生成                                │   │
│  │ - 推送执行                                │   │
│  └─────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────┐   │
│  │ FeedbackService                          │   │
│  │ - FSRS 状态更新                           │   │
│  │ - 统计分析                                │   │
│  └─────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│            Repository Layer                      │
│  ┌─────────────────────────────────────────┐   │
│  │ Database (SQLite)                        │   │
│  │ - 连接管理                                │   │
│  │ - 事务封装                                │   │
│  │ - 迁移脚本                                │   │
│  └─────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────┐   │
│  │ UserRepository                           │   │
│  │ - UserProgress CRUD                       │   │
│  └─────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────┐   │
│  │ WordProgressRepository                   │   │
│  │ - WordProgress CRUD                       │   │
│  │ - 到期查询                                │   │
│  └─────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

### 3.2 依赖注入

```typescript
// container.ts - 简单 DI 容器
interface Container {
  db: Database;
  scheduler: SchedulerService;
  push: PushService;
  feedback: FeedbackService;
  userRepo: UserRepository;
  wordRepo: WordProgressRepository;
}

let container: Container | null = null;

export function initializeContainer(api: OpenClawPluginApi): Container {
  const db = new Database(join(api.resolvePath('.'), 'vocab.db'));
  
  const userRepo = new UserRepository(db);
  const wordRepo = new WordProgressRepository(db);
  const scheduler = new SchedulerService();
  const push = new PushService(wordRepo, scheduler, api);
  const feedback = new FeedbackService(wordRepo, userRepo);
  
  container = { db, scheduler, push, feedback, userRepo, wordRepo };
  return container;
}

export function getContainer(): Container {
  if (!container) throw new Error('Container not initialized');
  return container;
}
```

### 3.3 状态管理

```typescript
// 移除全局变量，使用 Service 封装
class VocabCoachService {
  private timers = new Map<string, NodeJS.Timeout>();
  private api: OpenClawPluginApi;
  private db: Database;
  
  constructor(api: OpenClawPluginApi, db: Database) {
    this.api = api;
    this.db = db;
  }
  
  // 定时器管理
  schedule(userId: string, callback: () => void, delay: number) {
    this.clearTimer(userId);
    const timer = setTimeout(() => {
      callback();
      this.timers.delete(userId);
    }, delay);
    this.timers.set(userId, timer);
  }
  
  clearTimer(userId: string) {
    const existing = this.timers.get(userId);
    if (existing) {
      clearTimeout(existing);
      this.timers.delete(userId);
    }
  }
  
  // Gateway 停止时清理
  async stop() {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.db.close();
  }
}
```

### 3.4 错误处理策略

```typescript
// 重试装饰器
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === maxRetries - 1) throw err;
      const delay = baseDelay * Math.pow(2, i);
      console.warn(`Retry ${i + 1}/${maxRetries} after ${delay}ms`, err);
      await sleep(delay);
    }
  }
  throw new Error('Unreachable');
}

// 使用示例
await withRetry(async () => {
  await pushService.triggerPush(userId, route);
});
```

### 3.5 并发控制

```typescript
// 使用 SQLite 事务保证原子性
class WordProgressRepository {
  updateWithTransaction(userId: string, wordId: number, rating: FeedbackRating) {
    return this.db.transaction(() => {
      const current = this.getByWord(userId, wordId);
      const newState = applyFSRS(current, rating);
      this.update(newState);
      
      // 记录日志
      this.db.prepare(`
        INSERT INTO push_log (user_id, word_id, rating)
        VALUES (?, ?, ?)
      `).run(userId, wordId, rating);
      
      return newState;
    })();
  }
  
  // 批量操作使用事务
  batchUpdate(updates: Array<{userId: string, wordId: number, rating: FeedbackRating}>) {
    return this.db.transaction(() => {
      return updates.map(u => this.updateWithTransaction(u.userId, u.wordId, u.rating));
    })();
  }
}
```

---

## 4. 重构计划

### Phase 1: 数据库迁移 (1-2 天)

**目标:** 从 JSON 文件迁移到 SQLite，保持现有功能

**任务:**
- [ ] 安装 `better-sqlite3` 和类型定义
- [ ] 创建数据库 Schema（4 张表）
- [ ] 编写迁移脚本（JSON → SQLite）
- [ ] 实现 Repository 层（UserRepository, WordProgressRepository）
- [ ] 编写单元测试（Repository 层）

**交付物:**
- `src/db/schema.sql`
- `src/db/migrate.ts`
- `src/repository/*.ts`
- 测试覆盖率 > 80%

---

### Phase 2: 架构重构 (2-3 天)

**目标:** 实现分层架构，移除全局状态

**任务:**
- [ ] 创建 Service 层（SchedulerService, PushService, FeedbackService）
- [ ] 重构 index.ts（移除全局变量，使用 DI）
- [ ] 实现错误重试机制
- [ ] 实现并发控制（事务）
- [ ] 改进日志系统（结构化日志）
- [ ] 编写 Service 层测试

**交付物:**
- `src/service/*.ts`
- `src/container.ts`
- `index.ts` (重构后 < 200 行)
- 测试覆盖率 > 70%

---

### Phase 3: 功能改进 (1-2 天)

**目标:** 用户体验优化

**任务:**
- [ ] 复习卡片显示释义（默认隐藏，点击显示）
- [ ] 添加用户单词本功能（收藏、笔记）
- [ ] 添加推送统计（成功率、响应时间）
- [ ] 改进飞书卡片 UI（更美观）
- [ ] 添加配置验证（JSON Schema）

**飞书卡片改进示例:**
```typescript
// 复习卡片：默认隐藏释义，添加"显示释义"按钮
{
  elements: [
    { tag: 'div', text: { content: '**resilient**\n\n你还记得吗？' } },
    { tag: 'action', actions: [
      { tag: 'button', text: '显示释义', type: 'default', 
        value: { action: 'reveal', wordId: 123 } },
      { tag: 'button', text: '认识 ✓', type: 'primary',
        value: { wordId: 123, rating: 'know' } },
      // ...
    ]}
  ]
}
```

**交付物:**
- 改进的卡片 UI
- 用户单词本功能
- 配置验证

---

### Phase 4: 测试和文档 (1 天)

**目标:** 完善测试和文档

**任务:**
- [ ] 编写集成测试（端到端）
- [ ] 更新 README.md
- [ ] 编写 API 文档
- [ ] 性能测试（并发推送）
- [ ] 备份/恢复测试

**交付物:**
- 测试覆盖率 > 85%
- 完整的文档
- 性能基准报告

---

## 5. 代码结构

### 建议目录

```
myClawVocabulary/
├── index.ts                      # 插件入口（< 200 行）
├── openclaw.plugin.json          # 插件清单
├── package.json
├── REFACTOR_PLAN.md              # 本文件
│
├── src/
│   ├── db/
│   │   ├── schema.sql            # 数据库 Schema
│   │   ├── database.ts           # 数据库连接封装
│   │   └── migrate.ts            # 迁移脚本
│   │
│   ├── repository/
│   │   ├── user.repository.ts    # UserProgress CRUD
│   │   ├── word-progress.repository.ts
│   │   ├── word-bank.repository.ts
│   │   └── push-log.repository.ts
│   │
│   ├── service/
│   │   ├── scheduler.service.ts  # 泊松调度器
│   │   ├── push.service.ts       # 推送逻辑
│   │   ├── feedback.service.ts   # FSRS 更新
│   │   └── content-generator.ts  # LLM 内容生成
│   │
│   ├── handler/
│   │   ├── message.handler.ts    # message_received
│   │   ├── command.handler.ts    # 命令处理
│   │   └── button.handler.ts     # 按钮点击
│   │
│   ├── model/
│   │   ├── types.ts              # 类型定义
│   │   └── fsrs.ts               # FSRS 算法（纯函数）
│   │
│   ├── card/
│   │   ├── feishu-card.ts        # 飞书卡片构建
│   │   ├── text-card.ts          # 纯文本卡片
│   │   └── strings.ts            # 多语言字符串
│   │
│   ├── config/
│   │   ├── schema.ts             # 配置验证
│   │   └── constants.ts          # 常量定义
│   │
│   └── utils/
│       ├── retry.ts              # 重试工具
│       ├── logger.ts             # 日志工具
│       └── time.ts               # 时间工具
│
├── tests/
│   ├── repository/
│   ├── service/
│   ├── handler/
│   └── integration/
│
└── data/
    └── ielts-vocab.json          # 词库（保持不变）
```

---

## 6. OpenClaw Best Practice

### 6.1 插件生命周期管理

```typescript
// ✅ 正确：使用 Service 管理生命周期
const service: OpenClawPluginService = {
  id: 'vocab-coach-service',
  async start(ctx) {
    // 初始化数据库、加载配置、启动调度器
    container = initializeContainer(api);
    await restoreTimers();
  },
  async stop() {
    // 清理定时器、关闭数据库
    await container.scheduler.stop();
    container.db.close();
  }
};

api.registerService(service);
```

### 6.2 Service 注册

```typescript
// ✅ 正确：每个 Service 单一职责
api.registerService({
  id: 'vocab-scheduler',
  start: () => schedulerService.start(),
  stop: () => schedulerService.stop()
});

api.registerService({
  id: 'vocab-database',
  start: () => databaseService.connect(),
  stop: () => databaseService.disconnect()
});
```

### 6.3 Hook 使用

```typescript
// ✅ 正确：Hook 处理器保持轻量
api.on('message_received', async (event, ctx) => {
  // 委托给 Handler，不在此写业务逻辑
  await messageHandler.handle(event, ctx);
});

api.on('gateway_start', async () => {
  await schedulerService.restoreAllTimers();
});
```

### 6.4 配置验证

```typescript
// openclaw.plugin.json
{
  "configSchema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "feishuAppId": { "type": "string", "minLength": 1 },
      "feishuAppSecret": { "type": "string", "minLength": 1 },
      "dailyTarget": { "type": "number", "minimum": 1, "maximum": 50, "default": 5 },
      "activeHoursStart": { "type": "number", "minimum": 0, "maximum": 23, "default": 9 },
      "activeHoursEnd": { "type": "number", "minimum": 1, "maximum": 24, "default": 22 },
      "vocabSource": { "type": "string", "enum": ["ielts", "toefl", "cet4", "cet6", "gre"], "default": "ielts" }
    },
    "required": ["feishuAppId", "feishuAppSecret"]
  }
}
```

### 6.5 日志规范

```typescript
// ✅ 正确：结构化日志
class Logger {
  info(message: string, meta?: Record<string, unknown>) {
    api.logger.info(`[vocab-coach] ${message}`, meta);
  }
  
  error(message: string, error: Error, meta?: Record<string, unknown>) {
    api.logger.error(`[vocab-coach] ${message}`, {
      ...meta,
      error: error.message,
      stack: error.stack
    });
  }
}

// 使用示例
logger.info('Push completed', { userId, wordId, duration: 234 });
logger.error('Push failed', err, { userId, wordId });
```

---

## 7. 关键代码示例

### 7.1 数据库连接封装

```typescript
// src/db/database.ts
import Database from 'better-sqlite3';
import { join } from 'node:path';

export class VocabDatabase {
  private db: Database.Database;
  
  constructor(stateDir: string) {
    const dbPath = join(stateDir, 'vocab.db');
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');  // 并发优化
    this.db.pragma('synchronous = NORMAL');
  }
  
  // 事务包装器
  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }
  
  // 查询
  prepare(sql: string) {
    return this.db.prepare(sql);
  }
  
  // 关闭
  close() {
    this.db.close();
  }
}
```

### 7.2 Repository 示例

```typescript
// src/repository/word-progress.repository.ts
import type { VocabDatabase } from '../db/database.js';
import type { FSRSState } from '../model/types.js';

export class WordProgressRepository {
  private db: VocabDatabase;
  
  constructor(db: VocabDatabase) {
    this.db = db;
  }
  
  getByUser(userId: string): FSRSState[] {
    const stmt = this.db.prepare(`
      SELECT word_id, stability, difficulty, next_review, reviews, lapses, mastered
      FROM word_progress
      WHERE user_id = ? AND mastered = FALSE
      ORDER BY next_review ASC
    `);
    return stmt.all(userId) as FSRSState[];
  }
  
  getDue(userId: string, now: number): FSRSState[] {
    const stmt = this.db.prepare(`
      SELECT * FROM word_progress
      WHERE user_id = ? AND next_review <= ? AND mastered = FALSE
      ORDER BY next_review ASC
      LIMIT 10
    `);
    return stmt.all(userId, now) as FSRSState[];
  }
  
  updateWithTransaction(userId: string, wordId: number, rating: FeedbackRating) {
    return this.db.transaction(() => {
      const current = this.getByWord(userId, wordId);
      const newState = applyFSRS(current, rating);
      
      const stmt = this.db.prepare(`
        UPDATE word_progress
        SET stability = ?, difficulty = ?, next_review = ?,
            reviews = ?, lapses = ?, updated_at = strftime('%s', 'now')
        WHERE user_id = ? AND word_id = ?
      `);
      
      stmt.run(
        newState.stability,
        newState.difficulty,
        newState.nextReview,
        newState.reviews,
        newState.lapses,
        userId,
        wordId
      );
      
      return newState;
    })();
  }
}
```

### 7.3 Service 示例

```typescript
// src/service/scheduler.service.ts
import type { UserConfig } from '../model/types.js';

export class SchedulerService {
  private timers = new Map<string, NodeJS.Timeout>();
  
  scheduleNext(
    userId: string,
    config: UserConfig,
    callback: () => void
  ): void {
    this.clearTimer(userId);
    
    const delay = this.calculateDelay(config);
    const timer = setTimeout(() => {
      callback();
      this.timers.delete(userId);
    }, delay);
    
    this.timers.set(userId, timer);
  }
  
  private calculateDelay(config: UserConfig): number {
    if (this.isInActiveWindow(config)) {
      // 泊松分布
      const windowMs = (config.activeHoursEnd - config.activeHoursStart) * 3_600_000;
      const meanInterval = windowMs / config.dailyTarget;
      return -Math.log(Math.random()) * meanInterval;
    } else {
      // 等待窗口开始
      return this.msUntilWindowStart(config);
    }
  }
  
  async stop(): Promise<void> {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }
  
  private clearTimer(userId: string): void {
    const existing = this.timers.get(userId);
    if (existing) {
      clearTimeout(existing);
      this.timers.delete(userId);
    }
  }
  
  private isInActiveWindow(config: UserConfig): boolean {
    const hour = new Date().getHours();
    return hour >= config.activeHoursStart && hour < config.activeHoursEnd;
  }
  
  private msUntilWindowStart(config: UserConfig): number {
    const now = new Date();
    const currentHour = now.getHours();
    const [start] = [config.activeHoursStart, config.activeHoursEnd];
    
    let hoursUntilStart = currentHour < start
      ? start - currentHour
      : 24 - currentHour + start;
    
    return hoursUntilStart * 3_600_000 - now.getMinutes() * 60_000;
  }
}
```

---

## 8. 迁移脚本

```typescript
// src/db/migrate.ts
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import Database from 'better-sqlite3';

export async function migrateFromJson(stateDir: string, dbPath: string) {
  const db = new Database(dbPath);
  
  // 读取所有 JSON 进度文件
  const progressDir = join(stateDir, 'vocab-progress');
  const files = await readdir(progressDir);
  
  for (const file of files.filter(f => f.endsWith('.json'))) {
    const userId = file.replace('.json', '');
    const jsonPath = join(progressDir, file);
    const progress = JSON.parse(await readFile(jsonPath, 'utf8'));
    
    // 插入 UserProgress
    db.prepare(`
      INSERT OR REPLACE INTO user_progress
      (user_id, channel_id, conversation_id, from_id, level, last_push_time,
       daily_target, active_hours_start, active_hours_end, vocab_source, native_lang)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      progress.channelId || 'feishu',
      progress.conversationId || userId,
      progress.from || userId,
      progress.level || 1,
      progress.lastPushTime || 0,
      progress.config?.dailyTarget || 5,
      progress.config?.activeHoursStart || 9,
      progress.config?.activeHoursEnd || 22,
      progress.config?.vocabSource || 'ielts',
      progress.config?.nativeLang || 'zh'
    );
    
    // 插入 WordProgress
    for (const [wordIdStr, state] of Object.entries(progress.weights || {})) {
      const wordId = parseInt(wordIdStr);
      db.prepare(`
        INSERT OR REPLACE INTO word_progress
        (user_id, word_id, stability, difficulty, next_review, reviews, lapses)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        userId,
        wordId,
        state.s || 1,
        state.d || 5,
        state.next || Date.now(),
        state.reviews || 0,
        state.lapses || 0
      );
    }
  }
  
  db.close();
  console.log(`Migration completed: ${files.length} users migrated`);
}
```

---

## 9. 成功标准

### 功能标准
- [ ] 所有现有功能正常工作
- [ ] 多用户并发推送无冲突
- [ ] Gateway 重启后定时器正确恢复
- [ ] 复习卡片显示释义（可隐藏/显示）

### 性能标准
- [ ] 单次推送 < 500ms（不含 LLM 生成）
- [ ] 支持 100+ 并发用户
- [ ] 数据库查询 < 10ms

### 代码质量标准
- [ ] TypeScript 严格模式无错误
- [ ] 测试覆盖率 > 85%
- [ ] 无全局状态
- [ ] 所有公开 API 有文档

### 运维标准
- [ ] 备份/恢复流程文档化
- [ ] 监控指标（推送成功率、响应时间）
- [ ] 错误告警机制

---

## 10. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| **数据库迁移失败** | 数据丢失 | 迁移前备份所有 JSON 文件 |
| **better-sqlite3 编译失败** | 无法安装 | 准备降级方案（JSON 文件 + 文件锁） |
| **性能下降** | 用户体验差 | 性能测试，优化索引 |
| **API 变更破坏兼容性** | 用户配置丢失 | 保持配置向后兼容 |

---

**下一步:** 开始 Phase 1 实施
