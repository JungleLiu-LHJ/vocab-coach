# Vocab Coach — OpenClaw Plugin

An effortless, adaptive IELTS vocabulary tutor that proactively pushes word cards to you via WeChat / Telegram at randomized intervals during your active hours. No app to open — the words come to you.

---

## Features

- **Proactive push** — Poisson-process scheduler delivers words at random times within your active window (default 09:00–22:00), never on a fixed schedule
- **FSRS spaced repetition** — Three-button feedback (认识 / 模糊 / 忘记) dynamically adjusts each word's review interval
- **Absolute deduplication** — Mastered words (stability ≥ 21 days) are retired permanently and never shown again
- **Auto-level** — Your skill level increases automatically every 10 mastered words, unlocking harder vocabulary
- **LLM-generated content** — Example sentences and mnemonics generated at your CEFR level (Phase 2)
- **11,287 IELTS words** — B2/C1 vocabulary bundled offline, zero network dependency at runtime
- **Multi-user** — One plugin instance, isolated progress per user

---

## Quick Start

### Prerequisites

- Node.js 18+
- npm 9+
- OpenClaw CLI (`npm i -g openclaw-cli`)

### Install & Build

```bash
# Clone / enter the project
cd myClawVocabulary

# Install dev dependencies
npm install

# Run tests
npm test

# Build for production (minified)
npm run build

# Build for development (with sourcemaps)
npm run build:dev
```

### Run Tests

```bash
npm test
```

Expected output:

```
✓ tests/srs.test.ts        (13 tests)
✓ tests/scheduler.test.ts  (11 tests)
✓ tests/vocab.test.ts      ( 8 tests)

Tests  32 passed (32)
```

### Type Check

```bash
npm run typecheck
```

---

## How to Integrate with OpenClaw

### Step 1 — Install the plugin

From inside the project directory, run:

```bash
openclaw plugin install .
```

Or load it directly from the built bundle:

```bash
openclaw plugin install --file dist/index.js --manifest openclaw.plugin.json
```

### Step 2 — Configure (optional)

In the OpenClaw plugin settings UI, or via CLI:

```bash
openclaw plugin config vocab-coach \
  --activeHoursStart 9 \
  --activeHoursEnd   22 \
  --dailyTarget      5 \
  --vocabSource      ielts
```

| Key                | Type   | Default | Description                        |
|--------------------|--------|---------|------------------------------------|
| `activeHoursStart` | number | `9`     | Push window start (local hour)     |
| `activeHoursEnd`   | number | `22`    | Push window end (local hour)       |
| `dailyTarget`      | number | `5`     | Target pushes per day              |
| `vocabSource`      | select | `ielts` | Vocab tag: ielts / toefl / cet4 / cet6 / gre |

### Step 3 — Connect a gateway

The plugin uses `context.gateway.send()` to push cards. Bind it to your chat platform in OpenClaw:

```bash
# WeChat
openclaw gateway bind vocab-coach --platform wechat --token YOUR_TOKEN

# Telegram
openclaw gateway bind vocab-coach --platform telegram --bot-token YOUR_BOT_TOKEN --chat-id YOUR_CHAT_ID
```

### Step 4 — Activate

```bash
openclaw plugin enable vocab-coach
```

The plugin calls `onLoad` on startup, caches the vocab, and immediately schedules the first push within your active window.

---

## Card Format

### New word card

```
📚 New Word

**resilient** /rɪˈzɪliənt/  ·  B2 · IELTS

able to recover quickly from difficulties

> "The resilient startup adapted its model after three failed launches."

💡 "re-" (back) + spring → springs back into shape

[认识 ✓]  [模糊 ~]  [忘记 ✗]
```

### Review card (definition hidden to test recall)

```
📚 Review  (×3 seen)

**resilient**

Can you recall this word?

[显示释义]  [忘记 ✗]
```

---

## Feedback Buttons

| Button    | Rating   | Effect                                              |
|-----------|----------|-----------------------------------------------------|
| 认识 ✓    | `know`   | Stability × 2.5 — next review in ~days/weeks        |
| 模糊 ~    | `fuzzy`  | Stability × 1.5 — review again relatively soon      |
| 忘记 ✗    | `forgot` | Stability × 0.1 (reset) — review again very soon    |
| 显示释义  | `fuzzy`  | Reveals definition on review cards (counts as fuzzy) |

---

## Project Structure

```
myClawVocabulary/
├── openclaw.plugin.json   Plugin manifest & config schema
├── package.json           esbuild + vitest
├── tsconfig.json
├── data/
│   └── ielts-vocab.json   11,287 IELTS words (B2/C1), bundled at build time
├── src/
│   ├── index.ts           Entry: onLoad, onAction, triggerPush
│   ├── types.ts           Shared TypeScript interfaces
│   ├── storage.ts         userId-namespaced load/save
│   ├── vocab.ts           Word selection engine + CEFR filtering
│   ├── srs.ts             FSRS algorithm
│   ├── scheduler.ts       Poisson-process push scheduler
│   ├── generator.ts       LLM content generation (Phase 2)
│   └── card.ts            Markdown card builder
└── tests/
    ├── srs.test.ts
    ├── scheduler.test.ts
    └── vocab.test.ts
```

---

## Development

### Adding new vocabulary

Drop a JSON file into `data/` following the `VocabWord` schema and import it in `vocab.ts`:

```typescript
// src/vocab.ts
import BUNDLED_VOCAB from '../data/my-custom-vocab.json';
```

Schema:

```json
[
  { "id": 1, "w": "resilient", "lv": "B2", "tag": "ielts", "def": "able to recover quickly", "phonetic": "/rɪˈzɪliənt/" }
]
```

Valid `lv` values: `A1` `A2` `B1` `B2` `C1` `C2`
Valid `tag` values (used for filtering): `ielts` `toefl` `cet4` `cet6` `gre`

### Environment variables (for local testing)

Create a `.env` file:

```env
OPENCLAW_TOKEN=your_dev_token
OPENCLAW_USER_ID=test_user_123
```

Then run the sandbox:

```bash
openclaw dev --plugin dist/index.js --env .env
```

---

## Roadmap

| Phase | Status      | Description                                              |
|-------|-------------|----------------------------------------------------------|
| 1     | ✅ Complete  | Static vocab, FSRS scheduling, multi-user storage        |
| 2     | 🔧 Scaffolded | LLM example sentences + mnemonics via `context.agent`   |
| 3     | ⏳ Planned   | Auto-level tuning, "显示释义" reveal flow, Poisson full roll-out |
| 4     | ⏳ Planned   | Plugin marketplace publish, config UI polish             |

---

## License

MIT
