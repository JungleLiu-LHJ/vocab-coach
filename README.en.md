# Vocab Coach

[中文](README.md) | [English](README.en.md)

Vocab Coach is a lightweight, local-first vocabulary learning application powered by FSRS 6. It focuses on vocabulary entry, study, review, lookup, and essential learning statistics. Data is stored in a local SQLite database by default, and the core study flow works without a network connection or an LLM.

The project provides a web interface, an HTTP API, a structured CLI, and a local stdio MCP server. Agents such as Hermes and OpenClaw use MCP to call the same business services. Authentication, message delivery, and scheduled jobs for Telegram, WhatsApp, WeChat, Feishu, and similar channels remain the responsibility of the Agent Gateway.

## Features

- FSRS 6 is the only review scheduler.
- New cards show Chinese and English definitions, US and UK phonetics, and bilingual examples.
- Review cards hide Chinese definitions and example translations until a rating is submitted.
- `request_id + review_count` prevents duplicate ratings caused by retries, stale buttons, or delayed messages.
- SQLite, the local web app, and the CLI do not depend on an LLM.
- MCP returns platform-neutral presentation data. Channels can use native buttons or cards when available and numbered text otherwise.

## How learning works

A complete study cycle looks like this:

1. **Add vocabulary:** enter words manually or import them in bulk with Chinese and English definitions, US and UK phonetics, and bilingual examples. An LLM can optionally fill missing content.
2. **Build a study queue:** when a session starts, the application selects due review cards first and fills the remaining slots with new cards. Cards due within the last seven days are prioritized, followed by older overdue cards, then cards that have never been studied.
3. **Learn new cards:** a new card displays all definitions, phonetics, and examples. Choose `Easy` if you know it or `Again` if you do not. The first rating creates its FSRS state.
4. **Recall review cards:** the front hides the Chinese definition and example translations while showing the word, phonetics, English definition, and English examples. Rate your recall as `Easy`, `Good`, `Hard`, or `Again`; the complete answer is revealed after submission.
5. **Schedule the next review:** FSRS 6 updates the card's difficulty, stability, retrievability, and next due time, and the application stores the review log. The card returns to a future queue when it becomes due.

Each rating request is idempotent through `request_id`, while `review_count` rejects stale actions. This prevents a retry, an old button, or a delayed message from rating the same card twice. The UI labels cards with stability above 90 days as `mature`; this is only a display status, and FSRS remains the sole source of review timing.

## Scheduling algorithm: FSRS 6

[FSRS (Free Spaced Repetition Scheduler)](https://github.com/open-spaced-repetition/free-spaced-repetition-scheduler) is the project's only spaced-repetition algorithm. Instead of using a fixed schedule such as days 1, 3, 7, and 14, it maintains an individual memory state for every card. Its main concepts are:

- **Difficulty:** how hard the card is for the learner.
- **Stability:** the time scale over which memory remains at roughly 90% recall probability.
- **Retrievability:** the estimated probability of recalling the card now, which decays over time.

Every rating changes this state. In general, `Again` brings a card back sooner, `Hard` produces a shorter interval, `Good` uses the normal interval, and `Easy` produces a longer interval. The exact interval is calculated from the card's history, elapsed time, and active FSRS configuration. A small amount of fuzzing may be applied so many cards do not become due on the same day.

Vocab Coach uses the FSRS 6 implementation from the Python `fsrs` package. On first startup, it stores the default parameters, desired retention, learning steps, and maximum interval in `fsrs_configs`. Per-card state lives in `fsrs_states`, and before/after values for each rating are recorded in `reviews`. The web app, CLI, HTTP API, and MCP server all call the same services under `vocab_coach/services/`; none maintains a separate scheduling algorithm.

## Run locally

Requirements: Python 3.12–3.14 and [uv](https://docs.astral.sh/uv/).

```bash
git clone --depth 1 --single-branch --branch main https://github.com/JungleLiu-LHJ/vocab-coach.git
cd vocab-coach
uv sync
cp .env.example .env
uv run vocab-coach serve
```

Open <http://127.0.0.1:8000>. The default database is `data/vocab.db`. On first startup, the application runs Alembic migrations and creates the default FSRS configuration automatically.

You can also start Uvicorn directly and choose the bind address:

```bash
uv run uvicorn vocab_coach.main:app --host 0.0.0.0 --port 8000
```

Install the optional dependency to use the MCP server and Agent integrations:

```bash
uv sync --extra agent
uv run vocab-coach-mcp
```

## One-command Hermes / OpenClaw integration

On macOS or Linux, with Git, `uv`, and Hermes or OpenClaw already installed, run this when no local checkout exists:

```bash
curl -fsSL https://raw.githubusercontent.com/JungleLiu-LHJ/vocab-coach/main/scripts/install-agent.sh | sh -s -- --agent auto
```

From an existing checkout, run:

```bash
./scripts/install-agent.sh --agent auto
```

`--agent` accepts `auto`, `hermes`, `openclaw`, or `both`. The installer:

1. Installs the application under `${VOCAB_COACH_HOME:-${XDG_DATA_HOME:-$HOME/.local/share}/vocab-coach}`.
2. Keeps application code, `.env`, and SQLite data separate so updates preserve existing data.
3. Installs the optional MCP dependency and the complete `vocab-coach` Skill.
4. Registers the local stdio MCP server with detected Agents using absolute paths.
5. Runs the database doctor, MCP discovery, and connection checks.

Restart the Agent after installation. Example requests include:

```text
Start my vocabulary review.
Show today's learning statistics.
Look up serendipity.
Extract 20 unfamiliar words from this page and add them to my vocabulary.
Send a review card to this Telegram conversation every day at 8 PM.
```

### Agent interaction flow

```text
User message
  -> Hermes/OpenClaw recognizes the vocab-coach Skill
  -> Calls local vocab_coach_* MCP tools
  -> Vocab Coach queries SQLite and runs FSRS
  -> Returns text + actions + fallback_text
  -> Agent Gateway sends native buttons/cards or numbered text
```

Only one active card is retained per chat session. New cards use `Easy/Again`; review cards always use `Easy/Good/Hard/Again`. If a channel cannot display all four actions, it must fall back to numbered text without merging or changing FSRS ratings.

| Channel | Preferred presentation | Fallback |
| --- | --- | --- |
| Telegram | Inline buttons | Numbered text |
| Feishu/Lark | Interactive cards and buttons | Markdown or plain text |
| WhatsApp | Native interaction when all choices fit | Numbered text |
| WeChat/Weixin | Plain text | Plain text |
| Other channels | Native presentation declared by the Agent | Numbered text |

The channel must already be configured and healthy in Hermes or OpenClaw. Vocab Coach does not read or store channel tokens, contacts, groups, or scheduled jobs.

### MCP tools

| Tool | Purpose |
| --- | --- |
| `vocab_coach_doctor` | Initialize and validate the database, migrations, and version |
| `vocab_coach_import` | Atomically import structured vocabulary; existing words are skipped by default |
| `vocab_coach_lookup` | Read definitions, FSRS state, and review history |
| `vocab_coach_next_card` | Get one due or new card |
| `vocab_coach_review` | Idempotently submit an FSRS rating and reveal the answer |
| `vocab_coach_stats` | Read today's statistics in a specified time zone |

All MCP tools return `schema_version` and `status`. Successful responses contain `data`; failures contain a structured `error`. Presentation-oriented tools also return `presentation.text`, `presentation.actions`, and `presentation.fallback_text`. See the [Skill tool protocol](skill/vocab-coach/references/tools.md) for complete parameters and recovery rules.

## Bulk import

The JSON root must be an array. Every entry requires complete definitions, US and UK phonetics, and at least one bilingual example:

```json
[
  {
    "word": "serendipity",
    "translation": "意外发现美好事物的机缘",
    "origin_translation": "The pleasant discovery of something valuable by chance.",
    "phonetic_us": "/ˌserənˈdɪpəti/",
    "phonetic_uk": "/ˌserənˈdɪpɪti/",
    "examples": [
      {
        "sentence": "Finding that café was pure serendipity.",
        "translation": "偶然发现那家咖啡馆真是意外之喜。"
      }
    ]
  }
]
```

Import JSON from the CLI:

```bash
uv run vocab-coach import --format json < words.json
```

CSV input uses the six columns `word,translation,origin_translation,phonetic_us,phonetic_uk,examples`, where `examples` is a JSON array. The complete batch is validated before a single transaction writes it; invalid input never produces a partial import.

## Optional LLM enrichment

An LLM is used only to fill definitions, phonetics, and examples. It does not participate in persistence, lookup, or FSRS reviews. Configure any OpenAI-compatible Chat Completions service in `.env`:

```dotenv
LLM_BASE_URL=https://api.deepseek.com
LLM_API_KEY=your-key
LLM_MODEL=deepseek-v4-flash
```

Entry, import, lookup, and review continue to work offline when this is not configured.

## CLI and API

The structured CLI does not require the web server to remain running:

```bash
uv run vocab-coach doctor
uv run vocab-coach lookup serendipity
uv run vocab-coach cards --count 1 --channel wechat
uv run vocab-coach review CARD_ID good \
  --request-id 550e8400-e29b-41d4-a716-446655440000 \
  --expected-review-count 3 \
  --channel wechat
uv run vocab-coach stats --timezone-offset-minutes -480
```

After starting the HTTP server, open <http://127.0.0.1:8000/docs> for the complete OpenAPI specification. Main endpoints:

- `GET /api/sessions/cards`
- `POST /api/cards/{card_id}/reviews`
- `POST /api/vocabulary`
- `GET /api/vocabulary/lookup`
- `POST /api/vocabulary/import`
- `GET /api/stats/today`

## Development and verification

```bash
uv sync --extra agent
uv run pytest
uv build
```

Database model changes must include an Alembic migration. Apply migrations with:

```bash
uv run alembic upgrade head
```
