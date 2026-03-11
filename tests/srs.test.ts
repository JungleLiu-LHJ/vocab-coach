import { describe, it, expect } from 'vitest';
import { newState, applyRating, isMastered, MASTERY_THRESHOLD } from '../src/srs.js';

const NOW = 1_700_000_000_000; // fixed timestamp for determinism
const MS_PER_DAY = 86_400_000;

describe('newState', () => {
  it('creates initial FSRS state', () => {
    const state = newState(NOW);
    expect(state.s).toBe(1);
    expect(state.d).toBe(5);
    expect(state.reviews).toBe(0);
    expect(state.lapses).toBe(0);
    expect(state.next).toBe(NOW + MS_PER_DAY);
  });
});

describe('applyRating', () => {
  it('know: multiplies stability by 2.5 and decreases difficulty', () => {
    const state = newState(NOW);
    const next = applyRating(state, 'know', NOW);
    expect(next.s).toBeCloseTo(2.5);
    expect(next.d).toBeCloseTo(4.7);
    expect(next.reviews).toBe(1);
    expect(next.lapses).toBe(0);
    expect(next.next).toBeCloseTo(NOW + 2.5 * MS_PER_DAY);
  });

  it('fuzzy: multiplies stability by 1.5 and keeps difficulty unchanged', () => {
    const state = newState(NOW);
    const next = applyRating(state, 'fuzzy', NOW);
    expect(next.s).toBeCloseTo(1.5);
    expect(next.d).toBeCloseTo(5);
    expect(next.reviews).toBe(1);
    expect(next.lapses).toBe(0);
  });

  it('forgot: applies 0.1 multiplier (clamped to min 1) and increases difficulty', () => {
    const state = newState(NOW);
    const next = applyRating(state, 'forgot', NOW);
    // 1 * 0.1 = 0.1 → clamped to minimum of 1
    expect(next.s).toBe(1);
    expect(next.d).toBeCloseTo(5.8);
    expect(next.lapses).toBe(1);
  });

  it('forgot clamps stability to minimum of 1', () => {
    const state = newState(NOW);
    const next = applyRating(state, 'forgot', NOW);
    expect(next.s).toBe(1); // 1 * 0.1 = 0.1 → clamped to 1
  });

  it('know clamps difficulty to minimum of 1', () => {
    const lowDiffState = { ...newState(NOW), d: 1 };
    const next = applyRating(lowDiffState, 'know', NOW);
    expect(next.d).toBe(1);
  });

  it('forgot clamps difficulty to maximum of 10', () => {
    const highDiffState = { ...newState(NOW), d: 9.5 };
    const next = applyRating(highDiffState, 'forgot', NOW);
    expect(next.d).toBe(10);
  });

  it('accumulates reviews across multiple ratings', () => {
    let state = newState(NOW);
    state = applyRating(state, 'know', NOW);
    state = applyRating(state, 'fuzzy', NOW);
    state = applyRating(state, 'forgot', NOW);
    expect(state.reviews).toBe(3);
    expect(state.lapses).toBe(1);
  });
});

describe('isMastered', () => {
  it('returns false for low stability', () => {
    const state = newState(NOW);
    expect(isMastered(state)).toBe(false);
  });

  it('returns true when stability reaches threshold', () => {
    const state = { ...newState(NOW), s: MASTERY_THRESHOLD };
    expect(isMastered(state)).toBe(true);
  });

  it('returns true when stability exceeds threshold', () => {
    const state = { ...newState(NOW), s: MASTERY_THRESHOLD + 5 };
    expect(isMastered(state)).toBe(true);
  });

  it('mastery threshold is 21 days', () => {
    expect(MASTERY_THRESHOLD).toBe(21);
  });

  it('reaches mastery after repeated know ratings', () => {
    let state = newState(NOW);
    // After enough know ratings: 1 * 2.5^n >= 21 → n >= log(21)/log(2.5) ≈ 3.9 → 4 times
    for (let i = 0; i < 4; i++) {
      state = applyRating(state, 'know', NOW);
    }
    expect(isMastered(state)).toBe(true);
  });
});
