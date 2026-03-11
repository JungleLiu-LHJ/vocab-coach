import type { VocabWord, GeneratedContent, ActionPayload, FeedbackRating } from './types.js';

// ── Feishu Interactive Card builders ──────────────────────────────────────────

function feishuButton(
  label: string,
  wordId: number,
  rating: FeedbackRating,
  type: 'primary' | 'default' | 'danger' = 'default',
): Record<string, unknown> {
  return {
    tag: 'button',
    text: { tag: 'plain_text', content: label },
    type,
    // Feishu requires flat string values; wordId stored as string, parsed back in parseAction
    value: { wordId: String(wordId), rating },
  };
}

export function buildFeishuNewWordCard(
  word: VocabWord,
  content: GeneratedContent,
): Record<string, unknown> {
  const phonetic = word.phonetic ? ` ${word.phonetic}` : '';

  const lines: string[] = [
    `**${word.w}**${phonetic}`,
    `${word.lv} · ${word.tag.toUpperCase()}`,
    '',
  ];

  // Chinese + English definitions
  if (word.def) lines.push(`🇨🇳 **${word.def}**`);
  if (content.englishDef) lines.push(`🇬🇧 ${content.englishDef}`);

  // Example sentences
  if (content.examples.length > 0) {
    lines.push('', '**例句**');
    content.examples.forEach((ex, i) => {
      const label = i === content.examples.length - 1 ? '🌐 时事' : `${i + 1}.`;
      lines.push(`${label} ${ex}`);
    });
  }

  // Related words
  if (content.related.length > 0) {
    lines.push('', `**关联词** ｜ ` + content.related.join(' · '));
  }

  // Mnemonic
  if (content.mnemonic) {
    lines.push('', `💡 ${content.mnemonic}`);
  }

  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: '📚 新单词' },
      template: 'blue',
    },
    elements: [
      { tag: 'div', text: { tag: 'lark_md', content: lines.join('\n') } },
      { tag: 'hr' },
      {
        tag: 'action',
        actions: [
          feishuButton('认识 ✓', word.id, 'know', 'primary'),
          feishuButton('模糊 ~', word.id, 'fuzzy', 'default'),
          feishuButton('忘记 ✗', word.id, 'forgot', 'danger'),
          feishuButton('完全认识 ⭐', word.id, 'master', 'default'),
        ],
      },
    ],
  };
}

export function buildFeishuReviewCard(
  word: VocabWord,
  reviewCount: number,
): Record<string, unknown> {
  return {
    config: { wide_screen_mode: true },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `📚 **复习** (第 ${reviewCount} 次)\n\n**${word.w}**\n\n你还记得这个词吗？`,
        },
      },
      {
        tag: 'action',
        actions: [
          feishuButton('记得 ✓', word.id, 'fuzzy', 'primary'),
          feishuButton('忘了 ✗', word.id, 'forgot', 'danger'),
          feishuButton('完全认识 ⭐', word.id, 'master', 'default'),
        ],
      },
    ],
  };
}

function actionButton(label: string, wordId: number, rating: FeedbackRating): string {
  const payload: ActionPayload = { wordId, rating };
  // OpenClaw button syntax: [Label](action:data)
  return `[${label}](action:${JSON.stringify(payload)})`;
}

function revealButton(wordId: number): string {
  return `[显示释义](action:${JSON.stringify({ wordId, rating: 'fuzzy' })})`;
}

export function buildNewWordCard(word: VocabWord, content: GeneratedContent): string {
  const parts: string[] = ['📚 New Word', ''];

  // Word header
  const phonetic = word.phonetic ? ` ${word.phonetic}` : '';
  parts.push(`**${word.w}**${phonetic}  ·  ${word.lv} · ${word.tag.toUpperCase()}`);
  parts.push('');

  // Definition
  if (word.def) {
    parts.push(word.def);
    parts.push('');
  }

  // Example sentence
  if (content.example) {
    parts.push(`> "${content.example}"`);
    parts.push('');
  }

  // Mnemonic
  if (content.mnemonic) {
    parts.push(`💡 ${content.mnemonic}`);
    parts.push('');
  }

  // Feedback buttons
  parts.push(
    [
      actionButton('认识 ✓', word.id, 'know'),
      actionButton('模糊 ~', word.id, 'fuzzy'),
      actionButton('忘记 ✗', word.id, 'forgot'),
      actionButton('完全认识 ⭐', word.id, 'master'),
    ].join('  '),
  );

  return parts.join('\n');
}

export function buildReviewCard(word: VocabWord, reviewCount: number): string {
  const parts: string[] = [`📚 Review  (×${reviewCount} seen)`, ''];

  parts.push(`**${word.w}**`);
  parts.push('');
  parts.push('Can you recall this word?');
  parts.push('');

  parts.push(
    [
      revealButton(word.id),
      actionButton('忘记 ✗', word.id, 'forgot'),
      actionButton('完全认识 ⭐', word.id, 'master'),
    ].join('  '),
  );

  return parts.join('\n');
}

export function build(
  word: VocabWord,
  content: GeneratedContent,
  isReview: boolean,
  reviewCount: number = 0,
): string {
  return isReview
    ? buildReviewCard(word, reviewCount)
    : buildNewWordCard(word, content);
}

export function buildAckMessage(rating: FeedbackRating): string {
  const messages: Record<FeedbackRating, string> = {
    know: '✅ Great! Scheduling next review in a few days.',
    fuzzy: '🔄 Got it. We\'ll review this again soon.',
    forgot: '📖 No worries! We\'ll revisit this word shortly.',
    master: '⭐ 已标记为完全掌握，此单词不再推送！',
  };
  return messages[rating];
}
