import type { VocabWord, GeneratedContent } from './types.js';

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

// 从 subagent session 消息中提取最后一条 assistant 的文本
function extractAssistantText(messages: unknown[]): string {
  // 从后往前找最后一条 assistant 消息
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i] as Record<string, unknown>;
    if (msg?.role !== 'assistant') continue;
    const content = msg.content;
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      // Claude 格式：[{ type: 'text', text: '...' }, ...]
      const text = content
        .filter((b: unknown) => (b as Record<string, unknown>)?.type === 'text')
        .map((b: unknown) => (b as Record<string, unknown>).text)
        .join('');
      if (text) return text;
    }
  }
  return '';
}

// subagent API 的最小类型
type SubagentRuntime = {
  run(params: { sessionKey: string; message: string; deliver?: boolean }): Promise<{ runId: string }>;
  waitForRun(params: { runId: string; timeoutMs?: number }): Promise<{ status: string; error?: string }>;
  getSessionMessages(params: { sessionKey: string; limit?: number }): Promise<{ messages: unknown[] }>;
  deleteSession(params: { sessionKey: string; deleteTranscript?: boolean }): Promise<void>;
};

export async function generateContent(
  subagent: SubagentRuntime,
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

Required JSON fields:
- "nativeDef": Clear definition in ${native}, 1-2 sentences.
- "englishDef": Clear English definition, 1 concise sentence (like a dictionary entry).
- "phonetic": IPA phonetic transcription in slashes, e.g. "/ˈʌltɪmətəm/". Include primary stress mark.
- "partOfSpeech": Part of speech abbreviation, e.g. "n.", "v.", "adj.", "adv.", "n./v." if multiple.
- "forms": Array of 2-4 related word forms with ${native} gloss, e.g. ${glossExample}. Include plural/verb forms/derived words.
- "examples": Array of exactly 3 English sentences showing everyday or academic usage. IMPORTANT: Do NOT write news headlines, current events, or sentences mentioning specific years, analysts, reports, or recent events. Use timeless, natural contexts: personal life, school, work, nature, travel, etc.
- "related": Array of 2-3 related English words, each with a short ${native} gloss, e.g. ${glossExample}.
- "mnemonic": One vivid memory trick in ${native} using etymology or imagery, ≤20 words.

Output format (strict — nothing before or after this object):
{"nativeDef":"...","englishDef":"...","phonetic":"...","partOfSpeech":"...","forms":["...","..."],"examples":["...","...","..."],"related":["...","..."],"mnemonic":"..."}`;

  const sessionKey = `vocab-coach-gen-${word.id}-${Date.now()}`;

  try {
    const { runId } = await subagent.run({ sessionKey, message: prompt, deliver: false, idempotencyKey: sessionKey });
    const result = await subagent.waitForRun({ runId, timeoutMs: 30000 });
    if (result.status !== 'ok') throw new Error(`subagent 失败: ${result.error ?? result.status}`);

    const { messages } = await subagent.getSessionMessages({ sessionKey, limit: 10 });
    const raw = extractAssistantText(messages);
    if (!raw) throw new Error('未找到 assistant 响应');

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
  } finally {
    // 清理临时 session，忽略清理失败
    subagent.deleteSession({ sessionKey, deleteTranscript: true }).catch(() => {});
  }
}
