import type { OpenClawContext, VocabWord, GeneratedContent } from './types.js';

// ── 英语 CEFR 标签（用于 prompt 中的等级提示） ────────────
const CEFR_LABELS: Record<number, string> = {
  1: 'A1 (Beginner)',
  2: 'A2 (Elementary)',
  3: 'B1 (Intermediate)',
  4: 'B2 (Upper-Intermediate)',
  5: 'C1 (Advanced)',
  6: 'C2 (Proficient)',
};

function cefrLabel(skillLevel: number): string {
  if (skillLevel <= 2) return CEFR_LABELS[1];
  if (skillLevel <= 4) return CEFR_LABELS[2];
  if (skillLevel <= 6) return CEFR_LABELS[3];
  if (skillLevel <= 8) return CEFR_LABELS[4];
  if (skillLevel === 9) return CEFR_LABELS[5];
  return CEFR_LABELS[6];
}

// BCP 47 语言标签 → 全称（用于 LLM 提示词）
const LANG_NAMES: Record<string, string> = {
  zh: 'Chinese',
  en: 'English',
  ja: 'Japanese',
  ko: 'Korean',
  fr: 'French',
  de: 'German',
  es: 'Spanish',
  pt: 'Portuguese',
  ar: 'Arabic',
  ru: 'Russian',
};

function langName(code: string): string {
  return LANG_NAMES[code.split('-')[0]] ?? code;
}

// 每个目标语言用的"发音"字段说明（英语=IPA，中文=拼音，日语=假名/罗马字，...）
function pronunciationHint(targetLang: string): string {
  const code = targetLang.split('-')[0];
  switch (code) {
    case 'zh':
      return 'Hanyu Pinyin with tone marks, e.g. "nǐ hǎo"';
    case 'ja':
      return 'Hiragana reading followed by romaji in parentheses, e.g. "べんきょう (benkyou)"';
    case 'ko':
      return 'Revised Romanization, e.g. "annyeong"';
    case 'en':
    default:
      return 'IPA phonetic transcription in slashes with primary stress mark, e.g. "/ˈʌltɪmətəm/"';
  }
}

function levelLabel(targetLang: string, skillLevel: number): string {
  if (targetLang.startsWith('en')) return cefrLabel(skillLevel);
  // 其它语言暂时只返回一个模糊的等级说明
  if (skillLevel <= 3) return 'Beginner';
  if (skillLevel <= 7) return 'Intermediate';
  return 'Advanced';
}

// LLM 调用失败时的静态兜底内容（3个例句）
function staticFallback(word: VocabWord): GeneratedContent {
  const w = word.w;
  return {
    nativeDef: word.def ?? '',
    englishDef: '',
    phonetic: word.phonetic ?? '',
    partOfSpeech: '',
    forms: [],
    examples: [
      `She used the word ${w} correctly in her essay.`,
      `The teacher asked students to write a sentence using ${w}.`,
      `He looked up the meaning of ${w} in the dictionary.`,
    ],
    related: [],
    mnemonic: '',
  };
}

export async function generateContent(
  ctx: OpenClawContext,
  word: VocabWord,
  userLevel: number,
  nativeLang: string = 'zh',
  targetLang: string = 'en',
): Promise<GeneratedContent> {
  const native = langName(nativeLang);
  const target = langName(targetLang);
  const defHint = word.def ? ` (${native} meaning: ${word.def})` : '';
  const glossExample = nativeLang === 'zh'
    ? '["accelerate (加速)", "momentum (动力)"]'
    : `["accelerate (speed up)", "momentum (driving force)"]`;

  const prompt = `You are a vocabulary flashcard generator for a ${target} learner. Output ONLY a single JSON object — no thinking, no explanation, no markdown fences.

Word (in ${target}): "${word.w}"${defHint}
User's native language: ${native}
User level: ${levelLabel(targetLang, userLevel)}

Required JSON fields:
- "nativeDef": Clear definition in ${native}, 1-2 sentences.
- "englishDef": Clear definition in ${target} if ${target} is not English, otherwise a concise English dictionary-style sentence.
- "phonetic": ${pronunciationHint(targetLang)}.
- "partOfSpeech": Part of speech abbreviation, e.g. "n.", "v.", "adj.", "adv.", "n./v." if multiple.
- "forms": Array of 2-4 related word forms with ${native} gloss, e.g. ${glossExample}. Include plural/verb forms/derived words where applicable.
- "examples": Array of exactly 3 sentences in ${target} showing everyday or academic usage. IMPORTANT: Do NOT write news headlines, current events, or sentences mentioning specific years, analysts, reports, or recent events. Use timeless, natural contexts: personal life, school, work, nature, travel, etc.
- "related": Array of 2-3 related ${target} words, each with a short ${native} gloss, e.g. ${glossExample}.
- "mnemonic": One vivid memory trick in ${native} using etymology or imagery, ≤20 words.

Output format (strict — nothing before or after this object):
{"nativeDef":"...","englishDef":"...","phonetic":"...","partOfSpeech":"...","forms":["...","..."],"examples":["...","...","..."],"related":["...","..."],"mnemonic":"..."}`;

  try {
    const raw = await ctx.agent.complete(prompt);
    if (!raw) throw new Error('agent 返回空响应');

    // 提取 JSON 对象，兼容模型在输出前加思考过程或代码围栏的情况
    const match = raw.match(/\{[\s\S]*"nativeDef"[\s\S]*\}/);
    if (!match) throw new Error(`响应中未找到 nativeDef JSON，原始内容: ${raw.slice(0, 200)}`);
    const parsed = JSON.parse(match[0]) as Partial<GeneratedContent>;
    return {
      nativeDef: typeof parsed.nativeDef === 'string' ? parsed.nativeDef : (word.def ?? ''),
      englishDef: typeof parsed.englishDef === 'string' ? parsed.englishDef : '',
      phonetic: typeof parsed.phonetic === 'string' ? parsed.phonetic : (word.phonetic ?? ''),
      partOfSpeech: typeof parsed.partOfSpeech === 'string' ? parsed.partOfSpeech : '',
      forms: Array.isArray(parsed.forms) ? parsed.forms : [],
      examples: Array.isArray(parsed.examples) && parsed.examples.length > 0
        ? parsed.examples
        : staticFallback(word).examples,
      related: Array.isArray(parsed.related) ? parsed.related : [],
      mnemonic: typeof parsed.mnemonic === 'string' ? parsed.mnemonic : '',
    };
  } catch (err) {
    console.error('[vocab-coach] generateContent 失败，使用静态兜底:', err);
    return staticFallback(word);
  }
}
