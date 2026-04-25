# Known Issues & Deferred Work

记录当前架构（scope-based + SQLite，2026-04 重构后）下**仍未修复**的问题。
按优先级（P3 = 可延后，P4 = 产品决策）分类。

---

## P3 · 代码/行为层面

### 1. README 预览与 generator prompt 互相矛盾

- `README.md` 的卡片预览承诺“最后一句结合当前时事”：
  > 🌐 Ukraine's resilient grid withstood another missile strike.
- 但 `src/generator.ts` 的 prompt **明确禁止**时事例句：
  > IMPORTANT: Do NOT write news headlines, current events, or sentences mentioning specific years, analysts, reports, or recent events.

**决策点**：
- (a) 降级 README 文案，承诺改成“3 句日常/学术语境例句”
- (b) 让 prompt 的第 3 句允许时事（删除禁止条款，或改成“第 3 句可结合通用时事类主题，但不要提具体年份和人名”）

**建议**：(a) 更稳，时事句容易让 LLM 出现幻觉事实/过时内容。

### 2. 活跃时间窗口不支持跨零点

`src/scheduler.ts` 的 `isInActiveWindow` / `msUntilWindowStart` 隐含假设 `activeHoursStart < activeHoursEnd`。`parseConfigCommand` 里 `start >= end` 直接拒绝。结果：夜猫子用户无法配置 `[22, 6]` 这种跨零点窗口。

**修法草案**：
```ts
function isInActiveWindow(config) {
  const s = config.activeHoursStart;
  const e = config.activeHoursEnd;
  const h = currentHour(config.timezone);
  return s < e ? (h >= s && h < e) : (h >= s || h < e);
}
```
`msUntilWindowStart` 也要对应处理跨天情况。同时 `parseConfigCommand` 的 hours 校验需要放开 `s >= e` 的限制，但仍需禁止 `s === e`（零长度窗口）。

### 3. 长期不活跃 scope 的 timer 没回收

`src/index.ts` 的 `timers: Map<scopeId, Timeout>` 只在“暂停 / 新 timer 覆盖”时清理。一个 scope 长期没人交互后，timer 仍按窗口规则触发 `triggerPushForScope`：
- 进入函数 → 读 SQLite → `pushLogRepo.getTodayCount()` 永远 ≥ dailyTarget（如果到达上限）→ 重新调度
- 或者每天首次窗口打开就推送一条 → 用户不响应 → 一直发到 dailyTarget

**修法草案**：
- `learning_scope_progress` 增加 `last_activity_at` 列，在 `handleAction` / `handleCommand` 入口更新
- `scheduleScope` 里若 `now - lastActivityAt > 30d`，跳过调度，让用户下次发消息时再唤醒
- 或者引入 `getActiveScopes()` 时按 `last_activity_at` 过滤

### 4. 多语言扩展缺数据

P2 重构已铺好架构（`targetLang` + `LevelSystem` + 分语言 prompt + `pronunciationHint`），但：
- `data/` 下只有 `ielts-vocab.json`（英语）
- 切 `targetLang=ja` / `zh` 后 `ensureCached` 返回空数组，用户收到 `allDoneMessage`

**下一步**：至少加一个 JLPT N5–N3 词库 JSON 验证多语言流程端到端跑通。词条 schema 需要扩展 `lv` 的取值：
- en: `A1`/`A2`/`B1`/`B2`/`C1`/`C2`
- ja: `N5`/`N4`/`N3`/`N2`/`N1`
- zh: `1`/`2`/`3`/`4`/`5`/`6`（HSK）

### 5. 词库切换时缓存不失效

`src/vocab.ts` 的 `cachedVocab` 是 `Map<targetLang, VocabWord[]>`，以 BCP 47 主标签为 key。`/vocab-set lang ja` 时不会清旧缓存，但下次推送会按新 targetLang 拿新缓存 — 没有正确性问题，只是内存占用会随用户切换语言增长。**优先级最低**，可不修。

---

## P4 · 产品决策（等用户拍板）

### 6. 默认起始等级 7 vs 自动升级算法不自洽

- `db/schema.sql` 的 `level INTEGER NOT NULL DEFAULT 7`（CEFR B2，匹配 IELTS 词库）
- `index.ts` 里 `nextLevel = 1 + Math.floor(masteredCount / 10)`，即要 60 个词才升到 7

**现象**：新英语用户直接从 B2 进入，`mastered.length / 10` 这条自动升级曲线在前 60 个词完全不起作用。

**三种路线**：
- (a) 删掉“自动升级”，等级永远由 `/vocab-set lang` 或“切换词库”决定
- (b) 把 IELTS 替换成全 CEFR 覆盖的词库，起始等级改回 1
- (c) 保留现状但重新设计自动升级规则：比如“当前等级下已掌握 X% 才升级”

注意：因为现在每个 scope 都独立计算 `level`，群聊 scope 的自动升级会是“整个群组共享进度”叠加的结果，行为可能反直觉。

### 7. 同一用户在不同 scope 的进度完全隔离

新架构下 `direct:{channel}:{from}` 和 `channel:{channel}:{conversation}` 是独立 scope，进度互不可见。
- 优点：群聊里的练习不污染个人进度
- 缺点：用户在私聊学了 100 词，进群继续学时还是从 0 开始

**问题**：是否需要“private 进度同步到 group”或反向？目前没有跨 scope 的合并机制。
**建议**：暂不做，等用户反馈“想看自己在群里贡献了多少”再加。

### 8. FSRS 实现过于简化

当前 `applyRating` 只用固定乘数表（know=×2.5 / fuzzy=×1.5 / forgot=×0.1 / master=21）。真正的 FSRS 算法有：
- 难度自适应曲线
- retention 目标（默认 90%）
- 历史间隔参与计算下一次间隔

如果要保留 “FSRS” 作为卖点，建议引入 [`ts-fsrs`](https://github.com/open-spaced-repetition/ts-fsrs) 替换 `src/srs.ts` 的算法；否则 README 里把 “FSRS” 改成 “simplified SRS”。

---

## P5 · 细节清理（nice-to-have）

- `package.json` 的 `description` 仍写 “IELTS/TOEFL/CET words”，未来加入其它语言时要更新
- `README.md` 的“功能特点”列表也需要补充多语言说明
- `openclaw.plugin.json` 的 manifest schema 目前没暴露 `targetLang` 给插件用户配置（代码已接入 `pluginConfig.targetLang`，但 schema 未声明）
- `card.ts` 的 `STRINGS` 当前只覆盖 zh/en/ja/ko，加新母语时需要补
- `tests/index.test.ts` 用 `mkdtemp` 起临时 SQLite，但 afterEach 清理 `VocabDatabase.instances` Map 时是按当前 `tempDirs` 顺序 pop — 测试间共享 instance map 可能在并发测试下打架，目前 vitest 默认串行所以不会出问题

---

## 已修复 / 已规避（供参考）

新架构（scope-based + SQLite）实际上已经解决了旧版本的多个问题：

- ✅ `master` 评级导致 FSRS 状态 NaN（`MULTIPLIERS` 加上了 `master: MASTERY_THRESHOLD`）
- ✅ 进度不落盘（已切到 SQLite 持久化）
- ✅ `/vocab-set` / `/vocab-status` 命令缺失（`parseConfigCommand` / `buildStatusMessage`）
- ✅ 群聊和私聊互相覆盖进度（`scopeId = direct:{channel}:{from}` vs `channel:{channel}:{conversation}`）
- ✅ 词库耗尽时调度死循环（本 PR 加入 `EXHAUSTED_BACKOFF_MS = 1h`）
- ✅ 指数分布长尾未裁剪（本 PR 加入 `MIN_WAIT_MS` / `MAX_WAIT_MULT` 钳制）
- ✅ 多语言架构准备（本 PR 加入 `targetLang` + `LevelSystem` + 分语言 prompt + `pronunciationHint`）
