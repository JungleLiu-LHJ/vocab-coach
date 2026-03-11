# OpenClaw Integration Guide — Vocab Coach

This document walks through every step to install, configure, and run the plugin in a real OpenClaw environment, including Telegram and WeChat gateway setups.

---

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | ≥ 18 (22 recommended) | OpenClaw requires 22+ for production |
| npm | ≥ 9 | |
| OpenClaw CLI | latest | `npm i -g openclaw-cli` |
| OpenClaw Gateway | running | WeChat / Telegram / Discord |

---

## Step 1 — Build the plugin

```bash
cd myClawVocabulary

npm install          # install dev deps (esbuild, vitest, typescript)
npm test             # confirm 32/32 tests pass
npm run build        # produces dist/index.js  (~600 KB minified)
```

`dist/index.js` is the single self-contained bundle. It includes the full 11,287-word IELTS vocab — no network download needed at runtime.

---

## Step 2 — Install into OpenClaw

### Option A — Local development (symlink, hot-reload)

```bash
openclaw plugins install -l /absolute/path/to/myClawVocabulary
```

OpenClaw resolves `openclaw.plugin.json` → `main: dist/index.js` → calls `register(api)`.
Changes take effect after rebuilding (`npm run build`) and running `openclaw plugins reload vocab-coach`.

### Option B — Production install from a directory

```bash
openclaw plugins install /absolute/path/to/myClawVocabulary
```

OpenClaw copies the plugin directory and pins the version.

### Option C — Publish to npm first, then install

```bash
# in myClawVocabulary/
npm publish --access public           # publishes as @vocab-coach/vocab-coach

# on the OpenClaw host machine:
openclaw plugins install @vocab-coach/vocab-coach
```

### Verify installation

```bash
openclaw plugins list
# → @vocab-coach/vocab-coach   0.1.0   enabled
```

---

## Step 3 — Configure the plugin

```bash
openclaw plugins config @vocab-coach/vocab-coach \
  activeHoursStart=9  \
  activeHoursEnd=22   \
  dailyTarget=5       \
  vocabSource=ielts
```

| Key | Default | Description |
|---|---|---|
| `activeHoursStart` | `9` | Push window start (user's local hour, 0–23) |
| `activeHoursEnd` | `22` | Push window end |
| `dailyTarget` | `5` | Target word pushes per day |
| `vocabSource` | `ielts` | Vocab filter tag: `ielts` / `toefl` / `cet4` / `cet6` / `gre` |

Config is validated against `configSchema` in `openclaw.plugin.json` before the plugin loads.

---

## Step 4 — Connect a messaging gateway

The plugin uses `context.gateway.send(message, userId)` to push cards.
Wire it to your platform:

### Telegram

```bash
# 1. Create a bot via @BotFather → get BOT_TOKEN
# 2. Add the gateway to OpenClaw
openclaw gateway add telegram \
  --token YOUR_BOT_TOKEN

# 3. Bind the plugin to this gateway
openclaw gateway bind telegram vocab-coach

# 4. Start the gateway
openclaw gateway start telegram
```

When a user sends any message to your bot, OpenClaw fires `gateway:startup` for their session → the plugin schedules their first push.

### WeChat (企业微信 / Work WeChat)

```bash
openclaw gateway add wechat \
  --corp-id    YOUR_CORP_ID   \
  --corp-secret YOUR_SECRET   \
  --agent-id   YOUR_AGENT_ID

openclaw gateway bind wechat vocab-coach
openclaw gateway start wechat
```

### Discord / Slack / Signal

```bash
# Same pattern — swap platform name
openclaw gateway add discord --token YOUR_DISCORD_TOKEN
openclaw gateway bind discord vocab-coach
openclaw gateway start discord
```

---

## Step 5 — Enable and run

```bash
openclaw plugins enable @vocab-coach/vocab-coach
openclaw gateway start          # starts all bound gateways
```

Or start everything in one shot:

```bash
openclaw start
```

On startup:
1. OpenClaw calls `register(api)` on the plugin
2. Plugin subscribes to `gateway:startup` and `message:received` hooks
3. When a user connects, `gateway:startup` fires → vocab cached → scheduler armed
4. After a Poisson-distributed wait inside the active window, a word card is pushed
5. When the user taps a feedback button, `message:received` fires with `payload.action` → FSRS state updated → next push scheduled

---

## Step 6 — Verify it works

### Check plugin health

```bash
openclaw doctor
openclaw plugins info @vocab-coach/vocab-coach
```

### Validate hooks are wired

```bash
openclaw hooks check
# → gateway:startup  → dist/index.js#onGatewayStartup   ✓
# → message:received → dist/index.js#onMessageReceived  ✓
```

### Trigger a manual push (dev)

```bash
openclaw dev invoke @vocab-coach/vocab-coach \
  --hook gateway:startup \
  --payload '{"senderId":"test_user","timezone":"Asia/Shanghai","timestamp":1700000000000}'
```

You should receive a word card in your connected chat immediately.

### Simulate a button tap

```bash
openclaw dev invoke @vocab-coach/vocab-coach \
  --hook message:received \
  --payload '{
    "senderId": "test_user",
    "action": "{\"wordId\":1,\"rating\":\"know\"}",
    "timestamp": 1700000000000
  }'
```

Expected response: `✅ Great! Scheduling next review in a few days.`

### Inspect stored progress

```bash
openclaw storage get "progress:test_user" --plugin @vocab-coach/vocab-coach
```

---

## How Hooks Map to Plugin Code

```
openclaw.plugin.json                src/index.ts
─────────────────────────────────   ─────────────────────────────────
"gateway:startup"                →  onGatewayStartup(payload, api)
                                      └─ handleLoad(ctx)
                                           ├─ ensureCached(vocab)
                                           └─ scheduleNext() ──→ triggerPush()
                                                                   ├─ selectNextWord()
                                                                   ├─ generateContent()  ← Phase 2
                                                                   ├─ card.build()
                                                                   └─ gateway.send(card)

"message:received"               →  onMessageReceived(payload, api)
  (only if payload.action set)        └─ parseAction(payload.action)
                                           └─ handleAction(ctx, action)
                                                ├─ applyRating() [FSRS]
                                                ├─ isMastered() → mastered[]
                                                ├─ auto-level check
                                                ├─ saveProgress()
                                                ├─ gateway.send(ack)
                                                └─ scheduleNext()
```

---

## Multi-User Behaviour

Each user gets a fully isolated learning session:

- Storage key: `progress:{senderId}` — namespaced by the gateway-provided sender ID
- Timer: `timers.get(senderId)` — per-user `setTimeout` handle
- Level, mastered words, FSRS weights — all user-scoped

One plugin instance handles all users. No extra config needed.

---

## Phase 2 — Enable LLM Content Generation

Currently, `generator.ts` falls back to a static template.
To activate real LLM-generated example sentences and mnemonics:

```bash
# Ensure openclaw has an agent/model configured
openclaw agent configure --provider anthropic --model claude-opus-4-6

# The plugin calls ctx.agent.complete(prompt) automatically
# No code change needed — just ensure the agent permission is granted:
openclaw plugins permissions @vocab-coach/vocab-coach --grant agent
```

The plugin will then generate:
- A natural example sentence at the user's CEFR level
- A ≤15-word etymology or visual mnemonic

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| No word cards arriving | Scheduler outside active window | Check `activeHoursStart/End` match user's timezone |
| `gateway.send` not reaching user | Gateway not started | `openclaw gateway start` |
| `Unknown hook` error | Old OpenClaw version | `npm i -g openclaw-cli@latest` |
| `vocab_cache` stale | Corrupted storage | `openclaw storage delete vocab_cache --plugin @vocab-coach/vocab-coach` |
| LLM content not generating | `agent` permission missing | `openclaw plugins permissions ... --grant agent` |
| Plugin not found after install | `dist/index.js` missing | Run `npm run build` first |
| Timer fires outside active hours | Timezone mismatch | Set `timezone` in user config or ensure `payload.timezone` is correct |

---

## Uninstall

```bash
openclaw plugins disable @vocab-coach/vocab-coach
openclaw plugins uninstall @vocab-coach/vocab-coach

# Optional: clear all user data
openclaw storage clear --plugin @vocab-coach/vocab-coach
```
