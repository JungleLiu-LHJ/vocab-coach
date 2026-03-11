import type { OpenClawContext, VocabWord, GeneratedContent } from './types.js';

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

// LLM 调用失败时的静态兜底内容（3个例句）
function staticFallback(word: VocabWord): GeneratedContent {
  const w = word.w;
  const def = word.def ?? w;
  return {
    englishDef: '',
    examples: [
      `She explained the concept of ${w} clearly to her students.`,
      `The report highlighted the role of ${w} in driving economic growth.`,
      `Analysts in 2025 noted that ${w} (${def}) had become central to discussions on global tech policy.`,
    ],
    related: [],
    mnemonic: '',
  };
}

export async function generateContent(
  ctx: { agent: { complete(prompt: string): Promise<string> } },
  word: VocabWord,
  userLevel: number,
  nativeLang: string = 'zh',
): Promise<GeneratedContent> {
  const native = langName(nativeLang);
  const defHint = word.def ? ` (${native} meaning: ${word.def})` : '';
  const glossExample = nativeLang === 'zh'
    ? '["accelerate (加速)", "momentum (动力)"]'
    : `["accelerate (speed up)", "momentum (driving force)"]`;

  const prompt = `You are a vocabulary flashcard generator. Output ONLY a single JSON object — no thinking, no explanation, no markdown fences.

Word: "${word.w}"${defHint}
User's native language: ${native}
User CEFR level: ${cefrLabel(userLevel)}
Today's date: ${new Date().toISOString().slice(0, 10)}

Required JSON fields:
- "englishDef": Clear English definition, 1-2 sentences.
- "examples": Array of exactly 3 sentences in English. Sentence 1: everyday usage. Sentence 2: academic/professional context. Sentence 3: reference a real current event or trend from 2024-2025 (AI, geopolitics, climate, tech, etc.).
- "related": Array of 2-3 related English words, each with a short ${native} gloss, e.g. ${glossExample}.
- "mnemonic": One vivid memory trick in ${native} using etymology or imagery, ≤20 words.

Output format (strict — nothing before or after this object):
{"englishDef":"...","examples":["...","...","..."],"related":["...","..."],"mnemonic":"..."}`;

  try {
    const raw = await ctx.agent.complete(prompt);
    // 提取 JSON 对象，兼容模型在输出前加思考过程或代码围栏的情况
    const match = raw.match(/\{[\s\S]*"englishDef"[\s\S]*\}/);
    if (!match) throw new Error('响应中未找到包含 englishDef 的 JSON');
    const parsed = JSON.parse(match[0]) as Partial<GeneratedContent>;
    return {
      englishDef: typeof parsed.englishDef === 'string' && parsed.englishDef ? parsed.englishDef : '',
      examples: Array.isArray(parsed.examples) && parsed.examples.length > 0
        ? parsed.examples
        : staticFallback(word).examples,
      related: Array.isArray(parsed.related) ? parsed.related : [],
      mnemonic: typeof parsed.mnemonic === 'string' ? parsed.mnemonic : '',
    };
  } catch {
    return staticFallback(word);
  }
}
