---
name: vocab-coach
description: Operate the local-first Vocab Coach through its MCP tools. Use when a user asks to collect or import vocabulary from a topic, exam, file, or webpage; look up a word or phrase; start or continue an FSRS study session; submit a rating; view study statistics; or schedule vocabulary delivery through Hermes, OpenClaw, Telegram, WhatsApp, WeChat/Weixin, Feishu/Lark, or another Agent-managed channel.
---

# Vocab Coach

Use the `vocab_coach_*` MCP tools as the only interface to vocabulary data and FSRS scheduling.
Use the host Agent for browsing, channel delivery, credentials, and schedules. Never reproduce
the study algorithm or write directly to the SQLite database.

## Ensure the tools are ready

If `vocab_coach_doctor` is available, call it on first use or after an MCP failure. Do not run
shell setup on every invocation.

If the tools are absent, run the installer from an existing checkout:

```bash
./scripts/install-agent.sh --agent auto
```

If there is no checkout, run:

```bash
curl -fsSL https://raw.githubusercontent.com/JungleLiu-LHJ/vocab-coach/main/scripts/install-agent.sh | sh -s -- --agent auto
```

Restart the host Agent after installation, then call `vocab_coach_doctor`. Do not request or edit
Telegram, WhatsApp, WeChat, or Feishu credentials; the user configures channels in Hermes or
OpenClaw.

## Route user requests

- Import or collect words: research with the Agent's own tools, normalize the records, then call
  `vocab_coach_import` once with the complete batch.
- Look up a word or phrase: call `vocab_coach_lookup`.
- Start, continue, or request the next card: follow the review state machine below.
- Show today's progress: call `vocab_coach_stats` with UTC minus local time in minutes, matching
  JavaScript `Date.getTimezoneOffset()`.
- Schedule delivery: use the host Agent's persistent scheduler; never store schedules in Vocab
  Coach.

Read [references/tools.md](references/tools.md) before the first import or review tool call. Read
[references/hermes.md](references/hermes.md) or [references/openclaw.md](references/openclaw.md)
when operating on that runtime. Read [references/channels.md](references/channels.md) before
choosing native buttons/cards.

## Import vocabulary

Build every record with `word`, Chinese `translation`, English `origin_translation`, US and UK
IPA, and at least one bilingual example. Preview or summarize the proposed source and selection
rule when useful, but do not ask for per-word confirmation after the user has given a clear
import rule.

Call `vocab_coach_import` with the whole batch. Invalid input rejects the whole new batch;
existing normalized words are skipped by default. Report the imported count, skipped count, and
skipped words. Keep scraping and source-specific extraction outside Vocab Coach.

## Run one-card-at-a-time reviews

Maintain at most one active card in the current Agent conversation.

1. Call `vocab_coach_next_card` only when there is no unanswered active card.
2. Save `card_id`, `card_kind`, `review_count`, and every returned action `id` and `value` in the
   current conversation context.
3. Send `presentation.text` with native actions only when the current channel can represent the
   complete action set. Otherwise send `presentation.fallback_text`.
4. Accept a rating only when it matches the active card. Never interpret a standalone number as
   a rating when no card is active.
5. Generate one UUID `request_id`, then call `vocab_coach_review` with the active `card_id`, action
   `value`, UUID, and exact `review_count`.
6. On success, send the returned answer presentation. Mark the card inactive and wait for `0`,
   “下一张”, `next`, or a native Next action before fetching another card.

For a new card, show the bilingual content and offer only `Easy/Again`. For a review card, never
show the main Chinese translation or example translations before scoring; always preserve the
four actions `Easy/Good/Hard/Again`. Do not merge grades to fit a channel's button limit.

Reuse the same UUID only when retrying the exact same card and grade after an uncertain transport
failure. On `review_conflict`, discard the old interaction, explain briefly that it expired, and
fetch the current card. Never retry a stale choice with a fresh UUID.

On `empty_queue`, say there are no due or new cards. On `validation_error`, correct the tool input
once. On `not_found`, report the missing word/card. On `internal_error`, run doctor and report the
error if it persists.

## Deliver scheduled cards

Before creating a schedule, obtain the target channel/chat, IANA timezone, local delivery time,
and card count. Create the schedule in Hermes/OpenClaw and have each run call this Skill, send one
card, and stop.

Do not block a scheduled run waiting for a rating. Use non-blocking native callbacks only when the
Agent exposes them; otherwise send numbered text. Process a later reply only when the same Agent
conversation still contains the active card.
