import type { OpenClawContext, UserProgress, VocabWord } from './types.js';
// 内置 IELTS 词汇表（11,287 词，B2–C1，标签 'ielts'）
// esbuild 在构建时会将此 JSON 内联，首次运行无需网络请求
import BUNDLED_VOCAB from '../data/ielts-vocab.json';

// ── 每个目标语言的等级体系 ────────────────────────────────

interface LevelSystem {
  order: Record<string, number>;
  /** 把技能等级（1-10）映射到该语言的最高可见等级序号 */
  ceiling(skillLevel: number): number;
}

// 英语 CEFR
const CEFR_ORDER: Record<string, number> = {
  A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6,
};

const EN_LEVELS: LevelSystem = {
  order: CEFR_ORDER,
  ceiling(skillLevel) {
    if (skillLevel <= 2) return CEFR_ORDER['A1'];
    if (skillLevel <= 4) return CEFR_ORDER['A2'];
    if (skillLevel <= 6) return CEFR_ORDER['B1'];
    if (skillLevel <= 8) return CEFR_ORDER['B2'];
    if (skillLevel === 9) return CEFR_ORDER['C1'];
    return CEFR_ORDER['C2'];
  },
};

// 日语 JLPT（N5 最简单，N1 最难 → 数值越小越难，这里反转为"越大越难"的标准序）
const JLPT_ORDER: Record<string, number> = {
  N5: 1, N4: 2, N3: 3, N2: 4, N1: 5,
};

const JA_LEVELS: LevelSystem = {
  order: JLPT_ORDER,
  ceiling(skillLevel) {
    if (skillLevel <= 2) return JLPT_ORDER['N5'];
    if (skillLevel <= 4) return JLPT_ORDER['N4'];
    if (skillLevel <= 6) return JLPT_ORDER['N3'];
    if (skillLevel <= 8) return JLPT_ORDER['N2'];
    return JLPT_ORDER['N1'];
  },
};

// 中文 HSK 1-6
const HSK_ORDER: Record<string, number> = {
  HSK1: 1, HSK2: 2, HSK3: 3, HSK4: 4, HSK5: 5, HSK6: 6,
};

const ZH_LEVELS: LevelSystem = {
  order: HSK_ORDER,
  ceiling(skillLevel) {
    if (skillLevel <= 2) return HSK_ORDER['HSK1'];
    if (skillLevel <= 4) return HSK_ORDER['HSK2'];
    if (skillLevel <= 6) return HSK_ORDER['HSK3'];
    if (skillLevel <= 8) return HSK_ORDER['HSK4'];
    if (skillLevel === 9) return HSK_ORDER['HSK5'];
    return HSK_ORDER['HSK6'];
  },
};

const LEVEL_SYSTEMS: Record<string, LevelSystem> = {
  en: EN_LEVELS,
  ja: JA_LEVELS,
  zh: ZH_LEVELS,
};

function getLevelSystem(targetLang: string): LevelSystem | null {
  return LEVEL_SYSTEMS[targetLang.split('-')[0]] ?? null;
}

// ── 词库缓存（按目标语言命名空间） ────────────────────────

function vocabCacheKey(targetLang: string): string {
  return `vocab_cache:${targetLang}`;
}

// 每目标语言一份内存缓存
const cachedVocab = new Map<string, VocabWord[]>();

export async function ensureCached(ctx: OpenClawContext, targetLang: string = 'en'): Promise<VocabWord[]> {
  const cached = cachedVocab.get(targetLang);
  if (cached) return cached;

  // 优先检查持久化存储（支持运行时注入自定义词库）
  const stored = await ctx.storage.get(vocabCacheKey(targetLang));
  if (stored) {
    const parsed = JSON.parse(stored) as VocabWord[];
    cachedVocab.set(targetLang, parsed);
    return parsed;
  }

  // 回退：目前只有 en 打包了 IELTS 词表，其它语言返回空列表
  if (targetLang === 'en') {
    const list = BUNDLED_VOCAB as VocabWord[];
    cachedVocab.set(targetLang, list);
    return list;
  }

  cachedVocab.set(targetLang, []);
  return [];
}

export function selectNextWord(
  progress: UserProgress,
  vocab: VocabWord[],
  now: number = Date.now(),
): VocabWord | null {
  const masteredSet = new Set(progress.mastered);
  const targetLang = progress.config.targetLang ?? 'en';
  const levelSystem = getLevelSystem(targetLang);
  const ceiling = levelSystem?.ceiling(progress.level);
  const { vocabTags } = progress.config;

  // 筛选候选词：未掌握、在等级上限内（若该语言有等级体系）、匹配标签
  const eligible = vocab.filter((word) => {
    if (masteredSet.has(word.id)) return false;
    if (levelSystem && ceiling !== undefined) {
      const lvOrder = levelSystem.order[word.lv];
      if (lvOrder !== undefined && lvOrder > ceiling) return false;
    }
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
