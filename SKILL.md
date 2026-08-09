---
name: vocab-coach
description: Install and operate the local-first Vocab Coach from an agent. Use when a user wants to collect or import vocabulary from a topic, exam, file, or webpage; look up words; start or continue an FSRS review session; read study statistics; or schedule vocabulary delivery through an agent-managed WeChat, Telegram, WhatsApp, or other chat channel.
---

# Vocab Coach

Keep vocabulary data and FSRS scheduling in Vocab Coach. Use the agent's own browsing,
channel, and scheduling capabilities for research and delivery.

## Set up the local app

Use `${VOCAB_COACH_HOME:-${XDG_DATA_HOME:-$HOME/.local/share}/vocab-coach}/app` as the
default checkout. If it is missing, clone the public repository and run the installer:

```bash
mkdir -p "${VOCAB_COACH_HOME:-${XDG_DATA_HOME:-$HOME/.local/share}/vocab-coach}"
git clone https://github.com/JungleLiu-LHJ/vocab-coach.git \
  "${VOCAB_COACH_HOME:-${XDG_DATA_HOME:-$HOME/.local/share}/vocab-coach}/app"
"${VOCAB_COACH_HOME:-${XDG_DATA_HOME:-$HOME/.local/share}/vocab-coach}/app/scripts/install.sh"
```

Do not overwrite an existing `.env` or database. Run the installer with `--update` only
when the checkout is clean and the user asked to update. Use the command prefix:

```bash
cd "${VOCAB_COACH_HOME:-${XDG_DATA_HOME:-$HOME/.local/share}/vocab-coach}/app"
uv run vocab-coach
```

Run `uv run vocab-coach doctor` after setup or when commands fail.

## Import vocabulary

Research words with the agent's own tools according to the user's rule. For example, gather
IELTS vocabulary or extract vocabulary from a specified webpage. Build complete JSON with a
Chinese translation, English definition, US and UK IPA, and translated examples. Do not put
scraping or source-specific behavior into Vocab Coach.

Pipe the JSON array to `uv run vocab-coach import --format json`. Existing words are skipped;
invalid input aborts the entire new batch. Report sources, imported count, and skipped words.
Do not require per-word confirmation when the user's import rule is already clear.

Read [references/commands.md](references/commands.md) for the exact schema and CLI contract.

## Run a review

Maintain only one active card per chat session. Fetch one card with the target channel, send
the returned `rendered[0]` text and choices, then wait for the user's rating. Never treat a
number as a rating when no card is active.

For a new card, show the bilingual content and accept only `1=easy` or `2=again`. For a review
card, send no Chinese text before rating and use `1=easy`, `2=good`, `3=hard`, `4=again`.
WhatsApp uses `1=easy`, `2 or 3=good`, `4=again`.

Submit the card ID, grade, a new UUID request ID, and the card's `review_count`. Send
`rendered_answer` after a successful review, then wait for `0`, `下一张`, or a native Next
button. On a conflict, discard the stale choice and fetch the current card instead of retrying
with a new request ID.

Read [references/interactions.md](references/interactions.md) before formatting or parsing a
channel interaction.

## Configure delivery

Before creating a schedule, ask for the target channel/chat, timezone, delivery time, and card
count. Use the agent platform's native persistent scheduler and home-channel delivery. Do not
store channel tokens or schedules in Vocab Coach. Read [references/platforms.md](references/platforms.md)
for channel limitations and safe fallbacks.
