import type { FSRSState, FeedbackRating } from './types.js';

export const MASTERY_THRESHOLD = 21; // 稳定性达到 21 天 → 退役该词

// 仅针对"记忆程度"类评级 — master 走单独的退役路径，不参与稳定性计算
const MULTIPLIERS: Record<Exclude<FeedbackRating, 'master'>, number> = {
  know: 2.5,
  fuzzy: 1.5,
  forgot: 0.1,
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function newState(now: number = Date.now()): FSRSState {
  return {
    s: 1,
    d: 5,
    next: now + MS_PER_DAY,
    reviews: 0,
    lapses: 0,
  };
}

export function applyRating(
  state: FSRSState,
  rating: FeedbackRating,
  now: number = Date.now(),
): FSRSState {
  // master 等同于直接退役该词，索引表里不应再出现；调用方应走 mastered 路径。
  // 这里给一个安全兜底：直接把稳定性拔高到阈值以上，避免意外的 NaN。
  if (rating === 'master') {
    return {
      s: Math.max(state.s, MASTERY_THRESHOLD),
      d: state.d,
      next: now + MASTERY_THRESHOLD * MS_PER_DAY,
      reviews: state.reviews + 1,
      lapses: state.lapses,
    };
  }

  const factor = MULTIPLIERS[rating];
  const newS = Math.max(1, state.s * factor);
  const newD =
    rating === 'know'
      ? Math.max(1, state.d - 0.3)
      : rating === 'forgot'
        ? Math.min(10, state.d + 0.8)
        : state.d;

  return {
    s: newS,
    d: newD,
    next: now + newS * MS_PER_DAY,
    reviews: state.reviews + 1,
    lapses: state.lapses + (rating === 'forgot' ? 1 : 0),
  };
}

export function isMastered(state: FSRSState): boolean {
  return state.s >= MASTERY_THRESHOLD;
}
