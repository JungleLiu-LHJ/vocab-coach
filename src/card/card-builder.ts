/**
 * 卡片构建器抽象
 * 支持多频道：飞书/WhatsApp/Telegram/Discord 等
 */

import type { FeedbackRating } from '../model/types.js';

/**
 * 卡片内容
 */
export interface CardContent {
  scopeId?: string;
  word: string;
  phonetic?: string;
  partOfSpeech?: string;
  nativeDef: string;
  englishDef?: string;
  examples: string[];
  related: string[];
  forms?: string[];
  mnemonic?: string;
  wordId: number;
  reviewCount?: number;
}

/**
 * 卡片构建器接口
 */
export interface CardBuilder {
  /**
   * 构建新单词卡片
   */
  buildNewWord(content: CardContent): string | Record<string, unknown>;
  
  /**
   * 构建复习卡片
   */
  buildReview(content: CardContent, reviewCount: number): string | Record<string, unknown>;
  
  /**
   * 构建确认消息
   */
  buildAckMessage(rating: FeedbackRating): string;
  
  /**
   * 构建全部完成消息
   */
  buildAllDoneMessage(): string;
}

/**
 * 多语言字符串
 */
const STRINGS: Record<string, Record<string, string>> = {
  zh: {
    newWord: '📚 新单词',
    review: '📚 复习',
    examples: '**例句**',
    related: '**关联词**',
    forms: '**相关形态**',
    recallPrompt: '你还记得这个词吗？',
    btnKnow: '认识 ✓',
    btnFuzzy: '模糊 ~',
    btnForgot: '不知道 ✗',
    btnMaster: '完全认识 ⭐',
    btnRemember: '记得 ✓',
    btnReveal: '显示释义',
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
    btnKnow: 'Know ✓',
    btnFuzzy: 'Vague ~',
    btnForgot: "Don't know ✗",
    btnMaster: 'Mastered ⭐',
    btnRemember: 'Remember ✓',
    btnReveal: 'Show definition',
    ackKnow: '✅ Got it! Reviewing again in a few days.',
    ackFuzzy: "🔄 OK, we'll revisit this soon.",
    ackForgot: "📖 No worries! We'll push this again shortly.",
    ackMaster: '⭐ Marked as mastered — this word will no longer be pushed!',
    allDone: "🎉 All words for today are mastered!",
  },
};

function t(lang: string, key: string): string {
  const code = lang.split('-')[0];
  return STRINGS[code]?.[key] || STRINGS['en'][key] || key;
}

/**
 * 生成按钮 Action 数据
 */
function createActionPayload(wordId: number, rating: FeedbackRating, scopeId: string = ''): string {
  return JSON.stringify({ scopeId, wordId, rating });
}

/**
 * 飞书互动卡片构建器
 */
export class FeishuCardBuilder implements CardBuilder {
  constructor(private lang: string = 'zh') {}

  buildNewWord(content: CardContent): Record<string, unknown> {
    const lines: string[] = [
      `**${content.word}**${content.phonetic ? ` ${content.phonetic}` : ''}${content.partOfSpeech ? `  *${content.partOfSpeech}*` : ''}`,
      '',
      `**${content.nativeDef}**`,
    ];

    if (content.englishDef) {
      lines.push(`*${content.englishDef}*`);
    }

    if (content.examples.length > 0) {
      lines.push('', t(this.lang, 'examples'));
      content.examples.forEach((ex, i) => lines.push(`${i + 1}. ${ex}`));
    }

    if (content.forms && content.forms.length > 0) {
      lines.push('', t(this.lang, 'forms'));
      lines.push(content.forms.join(' · '));
    }

    if (content.related.length > 0) {
      lines.push('', t(this.lang, 'related'));
      lines.push(content.related.join(' · '));
    }

    if (content.mnemonic) {
      lines.push('', `💡 ${content.mnemonic}`);
    }

    const encode = (value: Record<string, unknown>) => ({
      oc: 'ocf1',
      k: 'quick',
      a: 'vocab.feedback',
      q: JSON.stringify(value),
      c: {
        e: Date.now() + 7 * 24 * 60 * 60 * 1000,
        t: String(content.scopeId ?? '').startsWith('channel:') ? 'group' : 'p2p',
      },
    });
    return {
      config: { wide_screen_mode: true },
      header: {
        title: { tag: 'plain_text', content: t(this.lang, 'newWord') },
        template: 'blue',
      },
      elements: [
        { tag: 'div', text: { tag: 'lark_md', content: lines.join('\n') } },
        { tag: 'hr' },
        {
          tag: 'action',
          actions: [
            { tag: 'button', text: { tag: 'plain_text', content: t(this.lang, 'btnKnow') }, type: 'primary', value: encode({ scopeId: content.scopeId ?? '', wordId: content.wordId, rating: 'know' }) },
            { tag: 'button', text: { tag: 'plain_text', content: t(this.lang, 'btnFuzzy') }, type: 'default', value: encode({ scopeId: content.scopeId ?? '', wordId: content.wordId, rating: 'fuzzy' }) },
            { tag: 'button', text: { tag: 'plain_text', content: t(this.lang, 'btnForgot') }, type: 'danger', value: encode({ scopeId: content.scopeId ?? '', wordId: content.wordId, rating: 'forgot' }) },
            { tag: 'button', text: { tag: 'plain_text', content: t(this.lang, 'btnMaster') }, type: 'default', value: encode({ scopeId: content.scopeId ?? '', wordId: content.wordId, rating: 'master' }) },
          ],
        },
      ],
    };
  }

  buildReview(content: CardContent, reviewCount: number): Record<string, unknown> {
    const encode = (value: Record<string, unknown>) => ({
      oc: 'ocf1',
      k: 'quick',
      a: 'vocab.feedback',
      q: JSON.stringify(value),
      c: {
        e: Date.now() + 7 * 24 * 60 * 60 * 1000,
        t: String(content.scopeId ?? '').startsWith('channel:') ? 'group' : 'p2p',
      },
    });
    return {
      config: { wide_screen_mode: true },
      elements: [
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: `${t(this.lang, 'review')} (×${reviewCount})\n\n**${content.word}**\n\n${t(this.lang, 'recallPrompt')}`,
          },
        },
        {
          tag: 'action',
          actions: [
            { tag: 'button', text: { tag: 'plain_text', content: t(this.lang, 'btnReveal') }, type: 'default', value: encode({ scopeId: content.scopeId ?? '', action: 'reveal', wordId: content.wordId }) },
            { tag: 'button', text: { tag: 'plain_text', content: t(this.lang, 'btnRemember') }, type: 'primary', value: encode({ scopeId: content.scopeId ?? '', wordId: content.wordId, rating: 'fuzzy' }) },
            { tag: 'button', text: { tag: 'plain_text', content: t(this.lang, 'btnForgot') }, type: 'danger', value: encode({ scopeId: content.scopeId ?? '', wordId: content.wordId, rating: 'forgot' }) },
            { tag: 'button', text: { tag: 'plain_text', content: t(this.lang, 'btnMaster') }, type: 'default', value: encode({ scopeId: content.scopeId ?? '', wordId: content.wordId, rating: 'master' }) },
          ],
        },
      ],
    };
  }

  buildAckMessage(rating: FeedbackRating): string {
    return t(this.lang, `ack${rating.charAt(0).toUpperCase() + rating.slice(1)}`);
  }

  buildAllDoneMessage(): string {
    return t(this.lang, 'allDone');
  }
}

/**
 * 纯文本卡片构建器（WhatsApp/Telegram/Signal 等）
 */
export class TextCardBuilder implements CardBuilder {
  constructor(private lang: string = 'zh', private supportsMarkdown: boolean = true) {}

  buildNewWord(content: CardContent): string {
    const bold = (text: string) => this.supportsMarkdown ? `**${text}**` : text;
    const italic = (text: string) => this.supportsMarkdown ? `*${text}*` : text;

    const lines: string[] = [
      bold(t(this.lang, 'newWord')),
      '',
      bold(`${content.word}${content.phonetic ? ` ${content.phonetic}` : ''}`) + (content.partOfSpeech ? `  ${italic(content.partOfSpeech)}` : ''),
      '',
      bold(content.nativeDef),
    ];

    if (content.englishDef) {
      lines.push(italic(content.englishDef));
    }

    if (content.examples.length > 0) {
      lines.push('', bold(t(this.lang, 'examples')));
      content.examples.forEach((ex, i) => lines.push(`${i + 1}. ${ex}`));
    }

    if (content.forms && content.forms.length > 0) {
      lines.push('', bold(t(this.lang, 'forms')));
      lines.push(content.forms.join(' · '));
    }

    if (content.related.length > 0) {
      lines.push('', bold(t(this.lang, 'related')));
      lines.push(content.related.join(' · '));
    }

    if (content.mnemonic) {
      lines.push('', `💡 ${content.mnemonic}`);
    }

    // 按钮（Markdown action 语法）
    lines.push(
      '',
      [
        `[${t(this.lang, 'btnKnow')}](action:${createActionPayload(content.wordId, 'know', content.scopeId)})`,
        `[${t(this.lang, 'btnFuzzy')}](action:${createActionPayload(content.wordId, 'fuzzy', content.scopeId)})`,
        `[${t(this.lang, 'btnForgot')}](action:${createActionPayload(content.wordId, 'forgot', content.scopeId)})`,
        `[${t(this.lang, 'btnMaster')}](action:${createActionPayload(content.wordId, 'master', content.scopeId)})`,
      ].join('  '),
    );

    return lines.join('\n');
  }

  buildReview(content: CardContent, reviewCount: number): string {
    const bold = (text: string) => this.supportsMarkdown ? `**${text}**` : text;

    const lines: string[] = [
      bold(`${t(this.lang, 'review')}  (×${reviewCount})`),
      '',
      bold(content.word),
      '',
      t(this.lang, 'recallPrompt'),
      '',
      [
        `[${t(this.lang, 'btnReveal')}](action:${JSON.stringify({ scopeId: content.scopeId ?? '', action: 'reveal', wordId: content.wordId })})`,
        `[${t(this.lang, 'btnRemember')}](action:${createActionPayload(content.wordId, 'fuzzy', content.scopeId)})`,
        `[${t(this.lang, 'btnForgot')}](action:${createActionPayload(content.wordId, 'forgot', content.scopeId)})`,
        `[${t(this.lang, 'btnMaster')}](action:${createActionPayload(content.wordId, 'master', content.scopeId)})`,
      ].join('  '),
    ];

    return lines.join('\n');
  }

  buildAckMessage(rating: FeedbackRating): string {
    return t(this.lang, `ack${rating.charAt(0).toUpperCase() + rating.slice(1)}`);
  }

  buildAllDoneMessage(): string {
    return t(this.lang, 'allDone');
  }
}

/**
 * Discord Embed 卡片构建器
 */
export class DiscordCardBuilder implements CardBuilder {
  constructor(private lang: string = 'zh') {}

  buildNewWord(content: CardContent): Record<string, unknown> {
    const fields: Array<{ name: string; value: string; inline?: boolean }> = [];

    if (content.englishDef) {
      fields.push({ name: 'Definition', value: content.englishDef, inline: false });
    }

    if (content.examples.length > 0) {
      fields.push({
        name: t(this.lang, 'examples'),
        value: content.examples.map((ex, i) => `${i + 1}. ${ex}`).join('\n'),
        inline: false,
      });
    }

    if (content.related.length > 0) {
      fields.push({
        name: t(this.lang, 'related'),
        value: content.related.join('\n'),
        inline: true,
      });
    }

    if (content.mnemonic) {
      fields.push({ name: '💡 Memory Trick', value: content.mnemonic, inline: false });
    }

    return {
      embeds: [{
        title: `${t(this.lang, 'newWord')}: ${content.word}`,
        description: content.phonetic ? `**${content.phonetic}** ${content.partOfSpeech || ''}` : undefined,
        fields,
        color: 3447003,
        footer: { text: content.nativeDef },
      }],
      components: [
        {
          type: 1, // Action Row
          components: [
            { type: 2, label: t(this.lang, 'btnKnow'), style: 3, custom_id: JSON.stringify({ scopeId: content.scopeId ?? '', wordId: content.wordId, rating: 'know' }) },
            { type: 2, label: t(this.lang, 'btnFuzzy'), style: 1, custom_id: JSON.stringify({ scopeId: content.scopeId ?? '', wordId: content.wordId, rating: 'fuzzy' }) },
            { type: 2, label: t(this.lang, 'btnForgot'), style: 4, custom_id: JSON.stringify({ scopeId: content.scopeId ?? '', wordId: content.wordId, rating: 'forgot' }) },
            { type: 2, label: t(this.lang, 'btnMaster'), style: 1, custom_id: JSON.stringify({ scopeId: content.scopeId ?? '', wordId: content.wordId, rating: 'master' }) },
          ],
        },
      ],
    };
  }

  buildReview(content: CardContent, reviewCount: number): Record<string, unknown> {
    return {
      embeds: [{
        title: `${t(this.lang, 'review')}: ${content.word}`,
        description: t(this.lang, 'recallPrompt'),
        color: 15158332,
        footer: { text: `Review count: ${reviewCount}` },
      }],
      components: [
        {
          type: 1,
          components: [
            { type: 2, label: t(this.lang, 'btnReveal'), style: 1, custom_id: JSON.stringify({ scopeId: content.scopeId ?? '', action: 'reveal', wordId: content.wordId }) },
            { type: 2, label: t(this.lang, 'btnRemember'), style: 3, custom_id: JSON.stringify({ scopeId: content.scopeId ?? '', wordId: content.wordId, rating: 'fuzzy' }) },
            { type: 2, label: t(this.lang, 'btnForgot'), style: 4, custom_id: JSON.stringify({ scopeId: content.scopeId ?? '', wordId: content.wordId, rating: 'forgot' }) },
            { type: 2, label: t(this.lang, 'btnMaster'), style: 1, custom_id: JSON.stringify({ scopeId: content.scopeId ?? '', wordId: content.wordId, rating: 'master' }) },
          ],
        },
      ],
    };
  }

  buildAckMessage(rating: FeedbackRating): string {
    return t(this.lang, `ack${rating.charAt(0).toUpperCase() + rating.slice(1)}`);
  }

  buildAllDoneMessage(): string {
    return t(this.lang, 'allDone');
  }
}

/**
 * 工厂函数：根据频道 ID 创建卡片构建器
 */
export function createCardBuilder(channelId: string, lang: string = 'zh'): CardBuilder {
  switch (channelId) {
    case 'feishu':
      return new FeishuCardBuilder(lang);
    case 'discord':
      return new DiscordCardBuilder(lang);
    default:
      // WhatsApp, Telegram, Signal, iMessage, Line 等使用纯文本
      return new TextCardBuilder(lang, true);
  }
}
