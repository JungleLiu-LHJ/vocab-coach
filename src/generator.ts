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

function staticFallback(word: VocabWord): GeneratedContent {
  return {
    englishDef: '',
    examples: [
      word.def
        ? `The word "${word.w}" means: ${word.def}.`
        : `She used the word "${word.w}" correctly in her essay.`,
    ],
    related: [],
    mnemonic: '',
  };
}

export async function generateContent(
  ctx: { agent: { complete(prompt: string): Promise<string> } },
  word: VocabWord,
  userLevel: number,
): Promise<GeneratedContent> {
  const prompt = `You are a vocabulary flashcard generator. Output ONLY a single JSON object — no thinking, no explanation, no markdown fences.

Word: "${word.w}"${word.def ? ` (Chinese meaning: ${word.def})` : ''}
User CEFR level: ${cefrLabel(userLevel)}
Today's date: ${new Date().toISOString().slice(0, 10)}

Required JSON fields:
- "englishDef": Clear English definition, 1-2 sentences.
- "examples": Array of exactly 3 sentences. Sentence 1: everyday usage. Sentence 2: academic/professional context. Sentence 3: reference a real current event or trend from 2024-2025 (AI, geopolitics, climate, tech, etc.).
- "related": Array of 2-3 related English words, each with a short Chinese gloss, e.g. ["accelerate (加速)", "momentum (动力)"].
- "mnemonic": One vivid memory trick using etymology or imagery, ≤15 words.

Output format (strict — nothing before or after this object):
{"englishDef":"...","examples":["...","...","..."],"related":["...","..."],"mnemonic":"..."}`;

  try {
    const raw = await ctx.agent.complete(prompt);
    // Extract the JSON object — handle models that prepend reasoning or use code fences
    const match = raw.match(/\{[\s\S]*"englishDef"[\s\S]*\}/);
    if (!match) throw new Error('No JSON with englishDef found in response');
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
