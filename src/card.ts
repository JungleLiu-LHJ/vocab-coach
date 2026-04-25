import type { VocabWord, GeneratedContent, ActionPayload, FeedbackRating } from './types.js';

// ── 多语言 UI 字符串 ───────────────────────────────────────────────────────────

interface CardStrings {
  newWord: string;
  review: string;
  examples: string;
  related: string;
  forms: string;
  recallPrompt: string;
  revealDef: string;
  btnKnow: string;
  btnFuzzy: string;
  btnForgot: string;
  btnMaster: string;
  btnRemember: string;
  replyHint: string;
  ackKnow: string;
  ackFuzzy: string;
  ackForgot: string;
  ackMaster: string;
  allDone: string;
}

const STRINGS: Record<string, CardStrings> = {
  zh: {
    newWord: '📚 新单词',
    review: '📚 复习',
    examples: '**例句**',
    related: '**关联词**',
    forms: '**相关形态**',
    recallPrompt: '你还记得这个词吗？',
    revealDef: '显示释义',
    btnKnow: '认识 ✓',
    btnFuzzy: '模糊 ~',
    btnForgot: '不知道 ✗',
    btnMaster: '完全认识 ⭐',
    btnRemember: '记得 ✓',
    replyHint: '回复 1=认识，2=模糊，3=不知道，4=掌握',
    ackKnow: '✅ 好的，几天后再复习！',
    ackFuzzy: '🔄 收到，稍后再来一遍。',
    ackForgot: '📖 没关系，马上再推一次！',
    ackMaster: '⭐ 已标记为完全掌握，此单词不再推送！',
    allDone: '🎉 今日词汇已全部掌握！',
  },
  en: {
    newWord: '📚 New Word',
    review: '📚 Review',
    examples: '**Examples**',
    related: '**Related**',
    forms: '**Word Forms**',
    recallPrompt: 'Can you recall this word?',
    revealDef: 'Show definition',
    btnKnow: 'Know ✓',
    btnFuzzy: 'Vague ~',
    btnForgot: "Don't know ✗",
    btnMaster: 'Mastered ⭐',
    btnRemember: 'Remember ✓',
    replyHint: 'Reply 1=Know, 2=Vague, 3=Forgot, 4=Mastered',
    ackKnow: '✅ Got it! Reviewing again in a few days.',
    ackFuzzy: "🔄 OK, we'll revisit this soon.",
    ackForgot: "📖 No worries! We'll push this again shortly.",
    ackMaster: '⭐ Marked as mastered — this word will no longer be pushed!',
    allDone: "🎉 All words for today are mastered!",
  },
  ja: {
    newWord: '📚 新しい単語',
    review: '📚 復習',
    examples: '**例文**',
    related: '**関連語**',
    forms: '**関連形態**',
    recallPrompt: 'この単語を覚えていますか？',
    revealDef: '意味を表示',
    btnKnow: '知っている ✓',
    btnFuzzy: 'あいまい ~',
    btnForgot: 'わからない ✗',
    btnMaster: '完全に覚えた ⭐',
    btnRemember: '覚えている ✓',
    replyHint: '返信: 1=知っている 2=あいまい 3=わからない 4=完全習得',
    ackKnow: '✅ 了解！数日後に復習します。',
    ackFuzzy: '🔄 わかりました。もうすぐまた復習します。',
    ackForgot: '📖 大丈夫！すぐにもう一度送ります。',
    ackMaster: '⭐ 完全習得としてマーク済み。この単語は今後送りません！',
    allDone: '🎉 今日の単語はすべて習得済みです！',
  },
  ko: {
    newWord: '📚 새 단어',
    review: '📚 복습',
    examples: '**예문**',
    related: '**관련 단어**',
    forms: '**관련 형태**',
    recallPrompt: '이 단어를 기억하세요?',
    revealDef: '뜻 보기',
    btnKnow: '알아요 ✓',
    btnFuzzy: '흐릿해요 ~',
    btnForgot: '몰라요 ✗',
    btnMaster: '완전히 알아요 ⭐',
    btnRemember: '기억해요 ✓',
    replyHint: '답장: 1=알아요 2=흐릿해요 3=몰라요 4=완전히 알아요',
    ackKnow: '✅ 알겠어요! 며칠 후 다시 복습합니다.',
    ackFuzzy: '🔄 알겠어요. 곧 다시 보내드릴게요.',
    ackForgot: '📖 괜찮아요! 곧 다시 보내드릴게요.',
    ackMaster: '⭐ 완전 습득으로 표시됨. 이 단어는 더 이상 전송되지 않습니다!',
    allDone: '🎉 오늘의 단어를 모두 습득했습니다!',
  },
};

// 未知语言回退到英文
function t(lang: string): CardStrings {
  const code = lang.split('-')[0];
  return STRINGS[code] ?? STRINGS['en'];
}

// ── 飞书互动卡片构建器 ────────────────────────────────────────────────────────

function feishuButton(
  label: string,
  scopeId: string,
  wordId: number,
  rating: FeedbackRating,
  type: 'primary' | 'default' | 'danger' = 'default',
): Record<string, unknown> {
  const payload: ActionPayload = { scopeId, wordId, rating };
  const isGroup = scopeId.startsWith('channel:');
  return {
    tag: 'button',
    text: { tag: 'plain_text', content: label },
    type,
    // Use OpenClaw's native Feishu quick-action envelope so the channel plugin
    // dispatches `q` back as a synthetic command.
    value: {
      oc: 'ocf1',
      k: 'quick',
      a: 'vocab.feedback',
      q: JSON.stringify(payload),
      c: {
        e: Date.now() + 7 * 24 * 60 * 60 * 1000,
        t: isGroup ? 'group' : 'p2p',
      },
    },
  };
}

export function buildFeishuNewWordCard(
  word: VocabWord,
  content: GeneratedContent,
  scopeId: string,
  lang: string = 'zh',
): Record<string, unknown> {
  const s = t(lang);
  // 优先用 LLM 生成的音标，其次用数据集原有音标
  const phonetic = (content.phonetic || word.phonetic) ? ` ${content.phonetic || word.phonetic}` : '';

  // 词性放在词形旁边：ultimatum  n.
  const posStr = content.partOfSpeech ? `  *${content.partOfSpeech}*` : '';
  const lines: string[] = [
    `**${word.w}**${phonetic}${posStr}`,
    `${word.lv} · ${word.tag.toUpperCase()}`,
    '',
  ];

  // 母语释义（LLM 生成，兜底用数据集原始释义）
  const def = content.nativeDef || word.def;
  if (def) lines.push(`**${def}**`);

  // 英文释义（LLM 生成）
  if (content.englishDef) lines.push(`*${content.englishDef}*`);

  // 例句
  if (content.examples.length > 0) {
    lines.push('', s.examples);
    content.examples.forEach((ex, i) => lines.push(`${i + 1}. ${ex}`));
  }

  // 词形变化
  if (content.forms.length > 0) {
    lines.push('', `${s.forms} ｜ ` + content.forms.join(' · '));
  }

  // 关联词
  if (content.related.length > 0) {
    lines.push('', `${s.related} ｜ ` + content.related.join(' · '));
  }

  // 记忆技巧
  if (content.mnemonic) {
    lines.push('', `💡 ${content.mnemonic}`);
  }

  lines.push('', `> ${s.replyHint}`);

  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: s.newWord },
      template: 'blue',
    },
    elements: [
      { tag: 'div', text: { tag: 'lark_md', content: lines.join('\n') } },
      { tag: 'hr' },
      {
        tag: 'action',
        actions: [
          feishuButton(s.btnKnow, scopeId, word.id, 'know', 'primary'),
          feishuButton(s.btnFuzzy, scopeId, word.id, 'fuzzy', 'default'),
          feishuButton(s.btnForgot, scopeId, word.id, 'forgot', 'danger'),
          feishuButton(s.btnMaster, scopeId, word.id, 'master', 'default'),
        ],
      },
    ],
  };
}

export function buildFeishuReviewCard(
  word: VocabWord,
  reviewCount: number,
  scopeId: string,
  lang: string = 'zh',
): Record<string, unknown> {
  const s = t(lang);
  return {
    config: { wide_screen_mode: true },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `${s.review} (${reviewCount})\n\n**${word.w}**\n\n${s.recallPrompt}\n\n> ${s.replyHint}`,
        },
      },
      {
        tag: 'action',
        actions: [
          feishuButton(s.btnRemember, scopeId, word.id, 'fuzzy', 'primary'),
          feishuButton(s.btnForgot, scopeId, word.id, 'forgot', 'danger'),
          feishuButton(s.btnMaster, scopeId, word.id, 'master', 'default'),
        ],
      },
    ],
  };
}

function actionButton(label: string, scopeId: string, wordId: number, rating: FeedbackRating): string {
  const payload: ActionPayload = { scopeId, wordId, rating };
  // OpenClaw 按钮语法：[标签](action:数据)
  return `[${label}](action:${JSON.stringify(payload)})`;
}

function revealButton(label: string, scopeId: string, wordId: number): string {
  return `[${label}](action:${JSON.stringify({ scopeId, wordId, rating: 'fuzzy' })})`;
}

export function buildNewWordCard(
  word: VocabWord,
  content: GeneratedContent,
  scopeId: string,
  lang: string = 'zh',
): string {
  const s = t(lang);
  const parts: string[] = [s.newWord, ''];

  // 单词标题行（含词性）
  // 优先用 LLM 生成的音标，其次用数据集原有音标
  const phonetic = (content.phonetic || word.phonetic) ? ` ${content.phonetic || word.phonetic}` : '';
  const posStr = content.partOfSpeech ? `  *${content.partOfSpeech}*` : '';
  parts.push(`**${word.w}**${phonetic}${posStr}  ·  ${word.lv} · ${word.tag.toUpperCase()}`);
  parts.push('');

  // 母语释义（LLM 生成，兜底用数据集原始释义）
  const def = content.nativeDef || word.def;
  if (def) {
    parts.push(`**${def}**`);
  }

  // 英文释义（LLM 生成）
  if (content.englishDef) {
    parts.push(`*${content.englishDef}*`);
  }

  if (def || content.englishDef) parts.push('');

  // 例句（3句，统一编号）
  if (content.examples.length > 0) {
    parts.push(s.examples);
    content.examples.forEach((ex, i) => parts.push(`${i + 1}. ${ex}`));
    parts.push('');
  }

  // 词形变化
  if (content.forms.length > 0) {
    parts.push(`${s.forms} ｜ ` + content.forms.join(' · '));
    parts.push('');
  }

  // 记忆技巧
  if (content.mnemonic) {
    parts.push(`💡 ${content.mnemonic}`);
    parts.push('');
  }

  // 反馈按钮
  parts.push(
    [
      actionButton(s.btnKnow, scopeId, word.id, 'know'),
      actionButton(s.btnFuzzy, scopeId, word.id, 'fuzzy'),
      actionButton(s.btnForgot, scopeId, word.id, 'forgot'),
      actionButton(s.btnMaster, scopeId, word.id, 'master'),
    ].join('  '),
  );

  return parts.join('\n');
}

export function buildReviewCard(
  word: VocabWord,
  reviewCount: number,
  scopeId: string,
  lang: string = 'zh',
): string {
  const s = t(lang);
  const parts: string[] = [`${s.review}  (×${reviewCount})`, ''];

  parts.push(`**${word.w}**`);
  parts.push('');
  parts.push(s.recallPrompt);
  parts.push('');

  parts.push(
    [
      revealButton(s.revealDef, scopeId, word.id),
      actionButton(s.btnForgot, scopeId, word.id, 'forgot'),
      actionButton(s.btnMaster, scopeId, word.id, 'master'),
    ].join('  '),
  );

  return parts.join('\n');
}

export function build(
  word: VocabWord,
  content: GeneratedContent,
  scopeId: string,
  isReview: boolean,
  reviewCount: number = 0,
  lang: string = 'zh',
): string {
  return isReview
    ? buildReviewCard(word, reviewCount, scopeId, lang)
    : buildNewWordCard(word, content, scopeId, lang);
}

export function buildAckMessage(rating: FeedbackRating, lang: string = 'zh'): string {
  const s = t(lang);
  const messages: Record<FeedbackRating, string> = {
    know: s.ackKnow,
    fuzzy: s.ackFuzzy,
    forgot: s.ackForgot,
    master: s.ackMaster,
  };
  return messages[rating];
}

export function allDoneMessage(lang: string = 'zh'): string {
  return t(lang).allDone;
}
