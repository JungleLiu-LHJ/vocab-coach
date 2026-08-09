# Chat interaction protocol

## Card lifecycle

1. Fetch exactly one card for an interactive chat turn.
2. Send the channel-specific rendered card and store its ID, kind, and review count in the
   current conversation state.
3. Accept a rating only while that card is active.
4. Submit the rating once with a UUID request ID.
5. For review cards, send the revealed Chinese answer returned by the review command.
6. Wait for `0`, `下一张`, or a Next button before fetching another card. Accept `暂停`, `继续`,
   and `结束` as session controls.

## Visibility rules

- New card: show word, phonetics, English definition, Chinese translation, English examples,
  and example translations. Choices are `1 认识` and `2 不认识`.
- Review card before rating: show word, phonetics, English definition, and English examples.
  Never show the main Chinese translation or any example translation.
- Review card after rating: show the returned Chinese translation and translated examples.

## Channel choices

- WeChat: use plain text. Accept ASCII/full-width digits, Chinese numerals, and rating words.
- Telegram: use the returned Markdown and four callback buttons for reviews.
- WhatsApp: use two buttons for new cards. For reviews use three buttons: `1 Easy`,
  `2/3 记得` (submit `good`), and `4 Again`.
- Any channel without structured choices: show the same numbered options as text.

Callback data has the form `vocab:CARD_ID:REVIEW_COUNT:GRADE`. Reject a callback if it does
not match the active card. Do not infer that an unrelated numeric chat message is a rating.
