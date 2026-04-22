# Known Issues & Deferred Work

本文档记录 2026-04 重构后**仍未修复**的问题，供后续迭代参考。按优先级（P3 = 可延后，P4 = 产品决策）分类。

---

## P3 · 代码/行为层面

### 1. README 预览与 generator prompt 互相矛盾

- `README.md` 的卡片预览承诺"最后一句结合当前时事"：
  > 🌐 Ukraine's resilient grid withstood another missile strike.
- 但 `src/generator.ts` 的 prompt **明确禁止**时事例句：
  > IMPORTANT: Do NOT write news headlines, current events, or sentences mentioning specific years, analysts, reports, or recent events.

**决策点**：
- (a) 降级 README 文案，承诺改成"3 句日常/学术语境例句"
- (b) 让 prompt 的第 3 句允许时事（删除禁止条款，或改成"第 3 句可结合通用时事类主题，但不要提具体年份和人名"）

**建议**：(a) 更稳，时事句容易让 LLM 出现幻觉事实/过时内容。

### 2. 活跃时间窗口不支持跨零点

`src/scheduler.ts` 的 `isInActiveWindow` / `msUntilWindowStart` 假设 `activeHours[0] < activeHours[1]`。对于夜猫子用户设 `[22, 6]` 会永远返回 false，推送彻底停摆。

**修法草案**：
```ts
function isInActiveWindow(config) {
  const [s, e] = config.activeHours;
  const h = currentHour(config.timezone);
  return s < e ? (h >= s && h < e) : (h >= s || h < e);
}
```
`msUntilWindowStart` 也要对应处理跨天情况。同时 `applyVocabSet` 的 `hours` 校验需要放开 `s < e` 的限制。

### 3. 长期不活跃用户的 timer 没回收

`src/index.ts` 的 `timers: Map<userId, Timeout>` 只在"暂停 / 新 timer 覆盖"时清理。一个用户 N 天不交互后，timer 仍然会按窗口触发 `triggerPush`，虽然幂等但浪费 CPU 和内存。

**修法草案**：
- 增加 `lastActivity: number` 字段到 `UserProgress`
- 在 `triggerPush` / `handleAction` / `handleCommand` 开头更新它
- `scheduleNextForUser` 里若 `now - lastActivity > 30d`，跳过调度，让用户下次发消息时再"唤醒"

---

## P4 · 产品决策（等用户拍板）

### 4. 默认起始等级 7 vs 自动升级算法不自洽

- `storage.ts:defaultStartLevel('en') = 7`（CEFR B2，匹配 IELTS 词库）
- `index.ts` 里 `newLevel = 1 + floor(mastered.length / 10)`，即要 60 个词才升到 7

**现象**：新英语用户直接从 B2 进入，`mastered.length / 10` 这条自动升级曲线在前 60 个词完全不起作用。

**三种路线**：
- (a) 删掉"自动升级"，等级永远由 `/vocab-set lang` 或"切换词库"决定
- (b) 把 IELTS 替换成全 CEFR 覆盖的词库，起始等级改回 1
- (c) 保留现状但重新设计自动升级规则：比如"当前等级下已掌握 X% 才升级"

### 5. 多语言扩展缺数据

P2 重构已铺好架构（targetLang、LevelSystem 抽象、generator prompt 分支），但：
- `data/` 下只有 `ielts-vocab.json`（英语）
- 切 `targetLang=ja` / `zh` 后 `ensureCached` 返回空数组，用户收到 `allDoneMessage`

**下一步**：至少加一个 JLPT N5-N3 词库 JSON 验证多语言流程端到端跑通。

### 6. FSRS 实现过于简化

当前 `applyRating` 只用固定乘数表（know=×2.5 / fuzzy=×1.5 / forgot=×0.1）。真正的 FSRS 算法有：
- 难度自适应曲线
- retention 目标（默认 90%）
- 历史间隔参与计算下一次间隔

市面上有懂行的用户会看出差异。如果要保留"FSRS"作为卖点，建议引入 [`ts-fsrs`](https://github.com/open-spaced-repetition/ts-fsrs) 替换 `src/srs.ts` 的算法；否则 README 里把"FSRS"改成"simplified SRS"。

---

## P5 · 细节清理（nice-to-have）

- `tsconfig.json` 里 `rootDir: "src"`，但 `include` 包含 `tests/**/*` → `tsc --noEmit` 报 TS6059（当前测试用 `rootDir: "."` 绕开）。可改成删掉 `rootDir` 或把 tests 移到独立 `tsconfig.test.json`
- `package.json` 的 `description` 里仍写 "IELTS/TOEFL/CET words"，未来加入其它语言时要更新
- `README.md` 的"功能特点"列表也需要补充多语言说明
- `openclaw.plugin.json` 的 manifest schema 目前没暴露 `targetLang` / `startLevel` 给插件用户配置（代码里已接入 `ctx.config.targetLang` 但 schema 未声明）

---

## 已修复问题（供参考）

2026-04-22 的重构已解决：
- ✅ `master` 评级导致 FSRS 状态 NaN
- ✅ `storage.ts` 与 `ctx.storage` 双实现不兼容（进度根本不落盘）
- ✅ `/vocab-set` / `/vocab-status` 命令缺失
- ✅ 按钮并发点击的覆盖写（加了 per-user mutex）
- ✅ `UserRoute` 从不保存
- ✅ `nextWaitMs` 指数分布长尾未裁剪
- ✅ 词库耗尽时的调度死循环（改为 1 小时退避）
- ✅ 多语言扩展的架构准备（targetLang + LevelSystem + 分语言 prompt）
- ✅ 插件配置 → 用户配置的 `seedProgress` 流程
