import type { OpenClawContext, UserProgress, VocabWord } from './types.js';
// 内置 IELTS 词汇表（11,287 词，B2–C1，标签 'ielts'）
// esbuild 在构建时会将此 JSON 内联，首次运行无需网络请求
import BUNDLED_VOCAB from '../data/ielts-vocab.json';

const VOCAB_CACHE_KEY = 'vocab_cache';

// CEFR 等级排序，用于上限比较
const CEFR_ORDER: Record<string, number> = {
  A1: 1,
  A2: 2,
  B1: 3,
  B2: 4,
  C1: 5,
  C2: 6,
};

// 将技能等级（1–10）映射到 CEFR 上限
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

  // 优先检查持久化存储（支持运行时覆盖/更新）
  const stored = await ctx.storage.get(VOCAB_CACHE_KEY);
  if (stored) {
    cachedVocab = JSON.parse(stored) as VocabWord[];
    return cachedVocab;
  }

  // 回退到 esbuild 构建时内联的 IELTS 词汇表
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

  // 筛选候选词：未掌握、在 CEFR 上限内、匹配标签
  const eligible = vocab.filter((word) => {
    if (masteredSet.has(word.id)) return false;
    if (CEFR_ORDER[word.lv] !== undefined && CEFR_ORDER[word.lv] > ceiling) return false;
    if (vocabTags.length > 0 && !vocabTags.includes(word.tag)) return false;
    return true;
  });

  if (eligible.length === 0) return null;

  // 优先推送到期复习词（最早逾期的）
  const dueReviews = eligible.filter(
    (word) => word.id in progress.weights && progress.weights[word.id].next <= now,
  );

  if (dueReviews.length > 0) {
    // 返回最长逾期的词
    return dueReviews.reduce((earliest, word) =>
      progress.weights[word.id].next < progress.weights[earliest.id].next ? word : earliest,
    );
  }

  // 无到期复习 → 随机选一个尚未接触的新词（避免总从字母 a 开始）
  const newWords = eligible.filter((word) => !(word.id in progress.weights));
  if (newWords.length > 0) {
    return newWords[Math.floor(Math.random() * newWords.length)];
  }

  // 所有候选词均在进行中但尚未到期 → 选最快到期的
  const inProgress = eligible.filter((word) => word.id in progress.weights);
  if (inProgress.length > 0) {
    return inProgress.reduce((earliest, word) =>
      progress.weights[word.id].next < progress.weights[earliest.id].next ? word : earliest,
    );
  }

  return null;
}
