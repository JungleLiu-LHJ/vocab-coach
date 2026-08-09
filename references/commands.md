# Command reference

Run commands from the installed checkout with `uv run vocab-coach`.

## Vocabulary JSON

Pass an array of complete records:

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

Every field shown above is required, and every word needs at least one example with a Chinese
translation. Words are de-duplicated case-insensitively after trimming and collapsing spaces.

Import from stdin and skip database duplicates:

```bash
uv run vocab-coach import --format json < words.json
```

Use `--strict-existing` only when any existing word should reject the whole batch. Invalid
records always reject the whole batch.

## Study and lookup

```bash
uv run vocab-coach lookup serendipity
uv run vocab-coach cards --count 1 --channel wechat
uv run vocab-coach stats --timezone-offset-minutes -480
```

`cards` returns raw structured cards and a `rendered` array when `--channel` is present. Keep
the card `id`, `kind`, and `review_count` until the user responds. It selects due cards first
and then fills the requested count with new cards. An empty queue returns `"cards": []` and
`"rendered": []`; tell the user there are no due or new words.

Import output contains `imported_count`, `skipped_existing_count`, `skipped_existing`, and
`cards`. A cards response contains `cards`, `requested_count`, and optional `rendered`.

Submit one review:

```bash
uv run vocab-coach review CARD_ID good \
  --request-id UUID \
  --expected-review-count 3 \
  --channel telegram
```

Reuse the same request ID only to retry the exact same card and grade. Exit code `3` means the
request ID conflicts or the card version is stale. Exit code `4` means the card or word is not
found. Import validation uses exit code `2`.

Review output contains the FSRS result, `revealed_answer`, and optional `rendered_answer`.

Run the web/API server only when requested:

```bash
uv run vocab-coach serve --host 127.0.0.1 --port 8000
```
