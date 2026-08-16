# MCP tool contract

All tools return a versioned envelope:

```json
{
  "schema_version": "1",
  "status": "ok",
  "data": {},
  "presentation": {}
}
```

On failure, `status` is `error` and `error` contains `type` and `detail`. Presentation is included
only when there is something user-facing to send.

## Tools

### `vocab_coach_doctor()`

Initialize migrations and validate the local database. Call on first use, after installation, or
after an MCP/database failure. Do not expose the database URL unless it helps diagnose a local
setup problem.

### `vocab_coach_import(items, strict_existing=false)`

Pass `items` as an array of complete records:

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

Every field is required and every word needs at least one translated example. Normalized
duplicates inside the batch are invalid. Existing database words are returned in
`skipped_existing` unless `strict_existing=true`, which rejects the batch.

### `vocab_coach_lookup(word, history_limit=50)`

Use for words and phrases, including values with spaces or slashes. `history_limit` must be
between 0 and 100.

### `vocab_coach_next_card()`

Fetch exactly one card. Keep these fields until the interaction finishes:

- `data.id`
- `data.kind`
- `data.review_count`
- `presentation.actions[].id`
- `presentation.actions[].value`

`presentation.text` is suitable as a native card body. `presentation.fallback_text` includes the
complete numbered reply instructions. Action IDs have the form
`vocab:CARD_ID:REVIEW_COUNT:GRADE`; reject an action that does not match the active card.

### `vocab_coach_review(card_id, grade, request_id, expected_review_count)`

Use the active card ID and review count. `grade` is one of `easy`, `good`, `hard`, `again`;
new-card presentations expose only `easy` and `again`. Generate a UUID of at most 64 characters
for `request_id` and preserve it for an exact retry.

The successful response contains `revealed_answer` and an answer `presentation`. Send the answer
before offering the next card.

### `vocab_coach_stats(timezone_offset_minutes=0)`

Pass UTC minus local time in minutes, between `-840` and `840`, matching JavaScript
`Date.getTimezoneOffset()`. For Asia/Shanghai use `-480`.

## Error handling

| Error type | Agent action |
| --- | --- |
| `validation_error` | Correct the arguments once; do not retry unchanged input |
| `not_found` | Report the missing word/card and ask only if another target is needed |
| `review_conflict` | Drop the stale active card and fetch the current card |
| `empty_queue` | Tell the user there are no due or new cards |
| `internal_error` | Call doctor once, then report the persistent error |

Never parse a numeric rating without an active card. Never generate a new UUID to bypass a
`review_conflict`.
