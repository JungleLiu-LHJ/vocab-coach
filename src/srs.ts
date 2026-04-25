import type { FSRSState, FeedbackRating } from './types.js';

export const MASTERY_THRESHOLD = 21; // 稳定性达到 21 天 → 退役该词

const MULTIPLIERS: Record<FeedbackRating, number> = {
  know: 2.5,
  fuzzy: 1.5,
  forgot: 0.1,
  master: MASTERY_THRESHOLD,
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
  const factor = MULTIPLIERS[rating];
  const newS = rating === 'master' ? MASTERY_THRESHOLD : Math.max(1, state.s * factor);
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
