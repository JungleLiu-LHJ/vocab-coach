# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build        # esbuild bundle → dist/index.js (includes data/ielts-vocab.json inline)
npm run test         # vitest run (all tests, once)
npm run test:watch   # vitest watch mode
npm run typecheck    # tsc --noEmit (type check only, no emit)
npx vitest run tests/srs.test.ts   # run a single test file
```

## Code Conventions

- **All comments must be in Chinese** — no English 注释
- Button labels use: 认识 / 模糊 / 不知道 / 完全认识 (not 忘记)
- Cards must show minimum 3 example sentences

## Architecture

This is an **OpenClaw plugin** — a single ESM bundle that OpenClaw loads via `openclaw.plugin.json`. The entry point is `src/index.ts`, which exports `onLoad` and `onAction` lifecycle hooks.

### Data flow

```
onLoad → scheduleNext (Poisson timer)
              ↓ fires
         triggerPush → loadProgress → selectNextWord → generateContent → card.build → gateway.send
                                                                          ↓
                                                                  scheduleNext (loop)

User taps button → onAction → applyRating (FSRS) → saveProgress → scheduleNext
```

### Module responsibilities

| File | Role |
|------|------|
| `src/index.ts` | Plugin entry, `onLoad` / `onAction` hooks, timer map |
| `src/types.ts` | All TypeScript interfaces — no runtime logic |
| `src/storage.ts` | Typed wrapper over `ctx.storage`; keys namespaced as `progress:{userId}` |
| `src/srs.ts` | FSRS algorithm: `applyRating`, `isMastered` (threshold: stability ≥ 21 days) |
| `src/vocab.ts` | Word selection: due-first → new → earliest-next; CEFR ceiling by skill level |
| `src/scheduler.ts` | Poisson inter-arrival timer, active-window guard using IANA timezone |
| `src/card.ts` | Card builders for Feishu JSON and OpenClaw markdown; `STRINGS` i18n map (zh/en/ja/ko) |
| `src/generator.ts` | LLM prompt via `ctx.agent.complete()`; static fallback on parse failure |
| `src/vocab-fs.ts` | Optional FS-based vocab loader (overrides bundled data via `vocab_cache` storage key) |

### Multi-user isolation

One plugin instance serves all users. Per-user state is stored under `progress:{userId}`. Timer handles live in a process-level `Map<string, Timer>` — timers are lost on plugin restart and must be reinstalled via `onLoad`.

### Multilanguage support

`UserConfig.nativeLang` (BCP 47, default `'zh'`) controls card UI language and LLM prompt language. `card.ts` has a `STRINGS` map; unknown langs fall back to `'en'`. Pass `nativeLang` through all `card.build` and `generateContent` calls.

## Known Issues (pre-existing, do not fix without context)

- `src/index.ts`: some storage calls pass `ctx` instead of `stateDir` (interface mismatch with storage.ts)
- `src/srs.ts`: `MULTIPLIERS` map missing `'master'` key

## Testing Notes

- Pure functions (`srs.ts`, `selectNextWord`) have no mocks — deterministic I/O
- Scheduler tests use `vi.useFakeTimers()` and `vi.spyOn(Math, 'random')`
- `storage.ts`, `generator.ts`, and `card.ts` are not unit-tested (integration/visual only)
