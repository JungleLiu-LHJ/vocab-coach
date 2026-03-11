# Technical Design: Vocab Coach OpenClaw Plugin

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        OpenClaw Runtime                             │
│                                                                     │
│  ┌──────────┐    onLoad()     ┌─────────────────────────────────┐   │
│  │ Platform │ ─────────────▶ │           index.ts              │   │
│  │ Lifecycle│    onAction()  │  ┌──────────┐  ┌─────────────┐  │   │
│  └──────────┘ ─────────────▶ │  │scheduler │  │   storage   │  │   │
│                               │  └────┬─────┘  └──────┬──────┘  │   │
│  ┌──────────┐                 │       │ setTimeout      │ get/set │   │
│  │ context  │                 │  ┌────▼─────┐  ┌──────▼──────┐  │   │
│  │ .storage │◀────────────────│  │triggerPush│  │UserProgress │  │   │
│  │ .gateway │                 │  └────┬─────┘  └─────────────┘  │   │
│  │ .agent   │                 │       │                          │   │
│  └──────────┘                 │  ┌────▼─────────────────────┐   │   │
│                               │  │ vocab → srs → generator  │   │   │
│  ┌──────────┐                 │  │         → card.build()   │   │   │
│  │ User     │◀────────────────│  └──────────────────────────┘   │   │
│  │ (chat)   │  gateway.send() └─────────────────────────────────┘   │
│  └──────────┘                                                        │
└─────────────────────────────────────────────────────────────────────┘
```

**Data flow for a push cycle:**

```
onLoad → ensureCached(vocab) → scheduleNext()
                                    │
                              [setTimeout fires]
                                    │
                              triggerPush()
                                    ├── loadProgress(userId)
                                    ├── selectNextWord(progress, vocab)
                                    ├── generateContent(word, level)   ← Phase 2
                                    ├── card.build(word, content, isReview)
                                    ├── gateway.send(card)
                                    └── scheduleNext()  ← loop
```

**Feedback cycle:**

```
User clicks button
      │
onAction(payload: {wordId, rating})
      ├── loadProgress(userId)
      ├── applyRating(state, rating, now)
      ├── isMastered(newState) → push to mastered[]
      ├── auto-level check (every 10 mastered)
      ├── saveProgress(userId, progress)
      ├── gateway.send(ackMessage)
      └── scheduleNext()
```

---

## 2. Module Responsibilities

### `src/types.ts`

Central type definitions. No runtime logic. All modules import from here.

```
VocabWord       — vocabulary item schema (id, w, lv, tag, def, phonetic)
FSRSState       — per-word SRS state (s, d, next, reviews, lapses)
UserProgress    — full persisted user record
UserConfig      — user settings (activeHours, timezone, dailyTarget, vocabTags)
ActionPayload   — button click data (wordId, rating)
GeneratedContent — LLM response shape (example, mnemonic)
OpenClawContext — typed interface for the OpenClaw context object
```

### `src/storage.ts`

Thin, typed wrapper around `context.storage`. All keys are namespaced by `userId` to support multiple users from a single plugin instance.

```
Key format:  progress:{userId}
Value:       JSON-serialized UserProgress

loadProgress(ctx, userId) → UserProgress   (returns default if absent)
saveProgress(ctx, userId, progress)
```

On first load, `loadProgress` seeds `UserConfig` from plugin manifest config (`ctx.config.*`), so admin-level defaults propagate to new users automatically.

### `src/srs.ts` — FSRS Algorithm

Simplified FSRS (Free Spaced Repetition Scheduler). Two public functions and one constant.

**State model:**

| Field     | Type   | Meaning                                         |
|-----------|--------|-------------------------------------------------|
| `s`       | number | Stability in days (days until ~90% forgetting)  |
| `d`       | number | Difficulty 1–10 (higher = harder to memorize)   |
| `next`    | number | Unix ms timestamp of next scheduled review       |
| `reviews` | number | Total times this word has been reviewed          |
| `lapses`  | number | Times the user forgot this word                 |

**Multipliers:**

| Rating  | `s` multiplier | `d` adjustment |
|---------|---------------|----------------|
| `know`  | × 2.5         | − 0.3 (min 1)  |
| `fuzzy` | × 1.5         | no change      |
| `forgot`| × 0.1 → min 1 | + 0.8 (max 10) |

**Mastery threshold:** `s >= 21` days — word is retired to `mastered[]` and never selected again.

**Why these numbers?**
- A new word starts at `s=1` (24-hour interval). Four consecutive `know` ratings → `s = 1 × 2.5⁴ = 39.06` → mastered in ~4 sessions over ~39 days.
- A forgotten word resets aggressively (× 0.1, clamped to 1) but difficulty increases, so the next review comes quickly and future intervals grow more slowly.

### `src/vocab.ts` — Word Selection Engine

**Vocabulary source:** 11,287 IELTS words (`data/ielts-vocab.json`) inlined at build time by esbuild. No runtime network call required.

**CEFR ceiling by skill level:**

| Skill level | CEFR ceiling |
|-------------|-------------|
| 1–2         | A1          |
| 3–4         | A2          |
| 5–6         | B1          |
| 7–8         | B2          |
| 9           | C1          |
| 10          | C2          |

**`selectNextWord` algorithm (priority order):**

1. Filter: exclude `mastered[]`, words above CEFR ceiling, words not matching `vocabTags`
2. If any filtered word is **due for review** (`weights[id].next <= now`) → return the most overdue one
3. Else if any **new words** exist (not in `weights`) → return the first one (sequential introduction)
4. Else → return the word with the earliest upcoming `next` timestamp (least urgent pending review)
5. If none found → return `null` (all eligible words mastered)

### `src/scheduler.ts` — Smart Scheduler

**Poisson process inter-arrival time:**

```
windowMs      = (activeHoursEnd - activeHoursStart) × 3,600,000 ms
meanInterval  = windowMs / dailyTarget
waitMs        = -ln(rand()) × meanInterval          ← exponential distribution
```

This produces pushes that cluster naturally (sometimes 2 arrive close together, sometimes spread far apart), simulating organic recall moments rather than metronomic reminders.

**Active window guard:**

```
isInActiveWindow(config)
  → parse current hour in user's IANA timezone via Intl.DateTimeFormat
  → return hour >= activeHours[0] && hour < activeHours[1]
```

If `scheduleNext` is called outside the active window, it calculates `msUntilWindowStart` and schedules for the next window open instead of immediately.

**Timer management:** `index.ts` keeps a `Map<userId, TimerHandle>` and cancels the previous timer before scheduling a new one to avoid duplicate pushes.

### `src/card.ts` — Message Builder

Produces OpenClaw-flavored markdown with inline action buttons.

**Button encoding:**

```
[Label](action:{"wordId":42,"rating":"know"})
```

The `data` field carries the full `ActionPayload` as JSON, which OpenClaw passes back to `onAction` when the user taps.

**Two card types:**

| Card type   | Shown when              | Contains                         |
|-------------|-------------------------|----------------------------------|
| New word    | `word.id not in weights` | phonetic, definition, example, mnemonic, 3 buttons |
| Review card | `word.id in weights`    | word only (recall test), 2 buttons (reveal / forgot) |

"显示释义" (reveal) is mapped to `rating: 'fuzzy'` — it counts as a soft correct, triggers the definition reveal via a follow-up `know/forgot` button, and adjusts FSRS state.

### `src/generator.ts` — LLM Content (Phase 2)

Calls `ctx.agent.complete(prompt)` with a structured prompt asking for:

1. One context-appropriate example sentence at the user's CEFR level
2. One ≤15-word mnemonic (etymology or vivid image)

Response must be JSON `{"example":"...","mnemonic":"..."}`. A regex extraction handles cases where the model wraps output in markdown code fences. Falls back to a static template if JSON parse fails.

### `src/index.ts` — Entry Point

The only file OpenClaw imports. Exports two lifecycle hooks:

| Export      | Called by OpenClaw when...                            |
|-------------|------------------------------------------------------|
| `onLoad`    | Plugin starts or is re-enabled                       |
| `onAction`  | User taps an action button in a card                 |

`triggerPush` is internal — invoked by the scheduler timer.

---

## 3. Data Persistence

### Storage schema

```
Key                      Value
─────────────────────────────────────────────────
progress:{userId}        JSON → UserProgress
vocab_cache              JSON → VocabWord[]   (optional runtime override)
```

`vocab_cache` is checked first on startup. If present, it overrides the bundled vocab — this allows hot-updating the word list without a plugin rebuild.

### UserProgress shape

```typescript
{
  level: 3,                       // current skill level (1–10)
  mastered: [12, 47, 203],        // retired word IDs
  weights: {
    "42": { s: 6.25, d: 4.4, next: 1709823600000, reviews: 3, lapses: 0 },
    "17": { s: 1,    d: 6.2, next: 1709737200000, reviews: 1, lapses: 1 }
  },
  lastPushTime: 1709823600000,
  config: {
    activeHours: [9, 22],
    timezone: "Asia/Shanghai",
    dailyTarget: 5,
    vocabTags: ["ielts"]
  }
}
```

---

## 4. Multi-User Design

One plugin instance serves all users. Isolation is achieved entirely through namespaced storage keys (`progress:{userId}`). The userId comes from `ctx.user.id`, which OpenClaw populates from the authenticated gateway session.

Timer handles are stored in a process-level `Map<string, Timer>`. This means timers do not survive a plugin restart — `onLoad` must be called for each user session to reinstall their timer. In a stateless serverless deployment, the scheduler would need to be replaced with a persistent job queue (e.g. OpenClaw's built-in cron triggers, if available).

---

## 5. Build System

### esbuild configuration

| Flag          | Value     | Reason                                              |
|---------------|-----------|-----------------------------------------------------|
| `--bundle`    | —         | Inline all imports including `data/ielts-vocab.json` |
| `--platform`  | `node`    | Target Node.js globals                              |
| `--target`    | `node18`  | Minimum runtime version                             |
| `--minify`    | prod only | Reduces bundle from ~1.1MB to ~600KB                |
| `--sourcemap` | dev only  | Source-mapped stack traces during development       |

### Why esbuild over tsc / webpack / rollup?

- **Speed**: 57ms full build vs. ~3s for tsc+rollup on this size
- **JSON inlining**: natively handles `import data from '*.json'`
- **Zero config**: single CLI flag set, no config file needed
- **Single output**: OpenClaw expects one `dist/index.js` entry point

---

## 6. Testing Strategy

### Coverage

| Module      | Test file              | What's tested                                         |
|-------------|------------------------|-------------------------------------------------------|
| `srs.ts`    | `tests/srs.test.ts`    | All 3 rating multipliers, clamping, mastery threshold, accumulation |
| `scheduler.ts` | `tests/scheduler.test.ts` | Deterministic `nextWaitMs`, `isInActiveWindow` edge hours, `msUntilWindowStart` |
| `vocab.ts`  | `tests/vocab.test.ts`  | Mastered exclusion, CEFR ceiling, tag filter, due-first priority, overdue ordering |

### Test design principles

- **No mocks for pure functions** (`srs.ts`, `selectNextWord`) — inputs and outputs are deterministic
- **`vi.useFakeTimers()`** for scheduler tests — lets us pin `Date.now()` to specific hours without waiting
- **`vi.spyOn(Math, 'random')`** for Poisson wait time — makes stochastic output deterministic in tests

### What's not unit-tested (integration only)

- `storage.ts` — requires a real `ctx.storage` mock; covered by OpenClaw's sandbox E2E
- `generator.ts` — requires `ctx.agent`; test in dev sandbox with `openclaw dev`
- `card.ts` — output is markdown strings; verify visually in sandbox, no logic to unit-test

---

## 7. Phase 2: LLM Integration

When `ctx.agent` becomes available:

1. `generator.ts` is already scaffolded — `generateContent(ctx, word, userLevel)` sends a structured prompt and parses JSON back
2. Update `triggerPush` in `index.ts` to `await generator.generateContent(...)` — already in the current implementation
3. The fallback path (`staticFallback`) ensures the plugin degrades gracefully if the LLM call fails

**Prompt template:**

```
Word: "resilient" (able to recover quickly)
User CEFR level: B2 (Upper-Intermediate)

Generate:
1. One natural example sentence using this word at the user's level.
2. One short memory trick (etymology or vivid image, ≤15 words).

Return ONLY valid JSON: {"example":"...","mnemonic":"..."}
```

---

## 8. Security & Privacy

- **No PII stored** — `userId` is treated as an opaque string; no name, email, or phone
- **Storage is scoped** — `context.storage` is sandboxed per plugin by OpenClaw; other plugins cannot access `progress:{userId}`
- **No external calls at runtime** — vocab is bundled; only `ctx.agent.complete()` calls the LLM (controlled by OpenClaw)
- **Action payload validation** — `onAction` should validate `payload.rating` is one of `know|fuzzy|forgot` before processing (TODO: add in Phase 3)

---

## 9. Known Limitations & Future Work

| Limitation | Current workaround | Future fix |
|---|---|---|
| Timers lost on plugin restart | `onLoad` reinstalls timer | OpenClaw persistent cron trigger |
| Chinese definitions only | LLM generates English example | Phase 2 LLM integration |
| No phonetic data in bundled vocab | Field optional in `VocabWord` | Augment with ECDICT phonetics |
| Static word order for new words | First eligible unseen word | Phase 3: randomize new word selection |
| No "显示释义" reveal follow-up | Reveal counts as fuzzy | Phase 3: two-step reveal flow |
| `vocabTags` filter allows only exact match | Config defaults to `ielts` | Phase 4: fuzzy/multi-tag support |
