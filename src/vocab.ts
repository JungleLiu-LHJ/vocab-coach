import type { OpenClawContext, ScopeProgressSnapshot, VocabWord } from './types.js';
// 内置 IELTS 词汇表（11,287 词，B2–C1，标签 'ielts'）
// esbuild 在构建时会将此 JSON 内联，首次运行无需网络请求
import BUNDLED_VOCAB from '../data/ielts-vocab.json';

const VOCAB_CACHE_KEY_PREFIX = 'vocab_cache';

// 不同目标语言的等级体系映射；技能等级 1–10 → 该语言的标签
// CEFR (en/fr/de/es/...): A1 < A2 < B1 < B2 < C1 < C2
// JLPT (ja): N5 < N4 < N3 < N2 < N1（数字越小越难，order 越大）
// HSK (zh): 1 < 2 < 3 < 4 < 5 < 6
interface LevelSystem {
  // 标签 → 数值 order，order 越大代表越难；未列在表里的标签视为 undefined（始终通过）
  order: Record<string, number>;
  // 用户技能等级 (1–10) 映射到当前最大可推送的 order 值
  ceiling: (skillLevel: number) => number;
}

const EN_LEVELS: LevelSystem = {
  order: { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 },
  ceiling: (lv) => {
    if (lv <= 2) return 1;
    if (lv <= 4) return 2;
    if (lv <= 6) return 3;
    if (lv <= 8) return 4;
    if (lv === 9) return 5;
    return 6;
  },
};

const JA_LEVELS: LevelSystem = {
  order: { N5: 1, N4: 2, N3: 3, N2: 4, N1: 5 },
  ceiling: (lv) => {
    if (lv <= 2) return 1;
    if (lv <= 4) return 2;
    if (lv <= 6) return 3;
    if (lv <= 8) return 4;
    return 5;
  },
};

const ZH_LEVELS: LevelSystem = {
  order: { '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6 },
  ceiling: (lv) => {
    if (lv <= 2) return 1;
    if (lv <= 4) return 2;
    if (lv <= 6) return 3;
    if (lv <= 8) return 4;
    if (lv === 9) return 5;
    return 6;
  },
};

// 主语言 → LevelSystem；BCP 47 子标签忽略（zh-CN → zh）
function levelSystemFor(targetLang: string): LevelSystem {
  const main = targetLang.split('-')[0];
  if (main === 'ja') return JA_LEVELS;
  if (main === 'zh') return ZH_LEVELS;
  // 其余拉丁语系默认回落到 CEFR
  return EN_LEVELS;
}

// 按目标语言区分缓存，避免一份 IELTS 词表污染 ja/zh 用户
const cachedVocab = new Map<string, VocabWord[]>();

export async function ensureCached(
  ctx: OpenClawContext,
  targetLang: string = 'en',
): Promise<VocabWord[]> {
  const key = targetLang.split('-')[0];
  const cached = cachedVocab.get(key);
  if (cached) return cached;

  // 优先检查持久化存储（支持运行时覆盖/更新）；按目标语言分键
  const storageKey = `${VOCAB_CACHE_KEY_PREFIX}:${key}`;
  const stored = await ctx.storage.get(storageKey);
  if (stored) {
    const parsed = JSON.parse(stored) as VocabWord[];
    cachedVocab.set(key, parsed);
    return parsed;
  }

  // 仅 'en' 有内置词表；其他语言在外部上传词表前返回空数组
  if (key === 'en') {
    const bundled = BUNDLED_VOCAB as VocabWord[];
    cachedVocab.set(key, bundled);
    return bundled;
  }

  cachedVocab.set(key, []);
  return [];
}

export function selectNextWord(
  progress: ScopeProgressSnapshot,
  vocab: VocabWord[],
  now: number = Date.now(),
): VocabWord | null {
  const masteredSet = new Set(progress.mastered);
  const levels = levelSystemFor(progress.config.targetLang ?? 'en');
  const ceiling = levels.ceiling(progress.level);
  const vocabSource = progress.config.vocabSource;

  // 筛选候选词：未掌握、在等级上限内、匹配标签
  const eligible = vocab.filter((word) => {
    if (masteredSet.has(word.id)) return false;
    const order = levels.order[word.lv];
    if (order !== undefined && order > ceiling) return false;
    if (vocabSource && word.tag !== vocabSource) return false;
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
