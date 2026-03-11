import type { OpenClawContext, UserProgress, VocabWord } from './types.js';
// Bundled IELTS vocabulary (11,287 words, B2–C1, tagged 'ielts')
// esbuild will inline this JSON at build time — no network call needed on first run.
import BUNDLED_VOCAB from '../data/ielts-vocab.json';

const VOCAB_CACHE_KEY = 'vocab_cache';

// CEFR level ordering for ceiling comparisons
const CEFR_ORDER: Record<string, number> = {
  A1: 1,
  A2: 2,
  B1: 3,
  B2: 4,
  C1: 5,
  C2: 6,
};

// Map skill level (1–10) to a CEFR ceiling
function cefrCeiling(skillLevel: number): number {
  if (skillLevel <= 2) return CEFR_ORDER['A1'];
  if (skillLevel <= 4) return CEFR_ORDER['A2'];
  if (skillLevel <= 6) return CEFR_ORDER['B1'];
  if (skillLevel <= 8) return CEFR_ORDER['B2'];
  if (skillLevel === 9) return CEFR_ORDER['C1'];
  return CEFR_ORDER['C2'];
}

let cachedVocab: VocabWord[] | null = null;

export async function ensureCached(ctx: OpenClawContext): Promise<VocabWord[]> {
  if (cachedVocab) return cachedVocab;

  // Check persistent storage first (allows runtime override / updates)
  const stored = await ctx.storage.get(VOCAB_CACHE_KEY);
  if (stored) {
    cachedVocab = JSON.parse(stored) as VocabWord[];
    return cachedVocab;
  }

  // Fall back to the bundled IELTS vocabulary (inlined at build time by esbuild)
  cachedVocab = BUNDLED_VOCAB as VocabWord[];
  return cachedVocab;
}

export function selectNextWord(
  progress: UserProgress,
  vocab: VocabWord[],
  now: number = Date.now(),
): VocabWord | null {
  const masteredSet = new Set(progress.mastered);
  const ceiling = cefrCeiling(progress.level);
  const { vocabTags } = progress.config;

  // Filter eligible words: not mastered, within CEFR ceiling, matching tags
  const eligible = vocab.filter((word) => {
    if (masteredSet.has(word.id)) return false;
    if (CEFR_ORDER[word.lv] !== undefined && CEFR_ORDER[word.lv] > ceiling) return false;
    if (vocabTags.length > 0 && !vocabTags.includes(word.tag)) return false;
    return true;
  });

  if (eligible.length === 0) return null;

  // Prefer due reviews (earliest next timestamp that is overdue)
  const dueReviews = eligible.filter(
    (word) => word.id in progress.weights && progress.weights[word.id].next <= now,
  );

  if (dueReviews.length > 0) {
    // Return the most overdue word
    return dueReviews.reduce((earliest, word) =>
      progress.weights[word.id].next < progress.weights[earliest.id].next ? word : earliest,
    );
  }

  // No due reviews → pick a new word not yet encountered (random to avoid always starting at 'a')
  const newWords = eligible.filter((word) => !(word.id in progress.weights));
  if (newWords.length > 0) {
    return newWords[Math.floor(Math.random() * newWords.length)];
  }

  // All eligible words are in progress but not yet due → pick next-due
  const inProgress = eligible.filter((word) => word.id in progress.weights);
  if (inProgress.length > 0) {
    return inProgress.reduce((earliest, word) =>
      progress.weights[word.id].next < progress.weights[earliest.id].next ? word : earliest,
    );
  }

  return null;
}
