import { describe, it, expect } from 'vitest';
import { selectNextWord } from '../src/vocab.js';
import { newState, applyRating } from '../src/srs.js';
import type { UserProgress, VocabWord } from '../src/types.js';

const NOW = 1_700_000_000_000;
const ONE_DAY_MS = 86_400_000;

const SAMPLE_VOCAB: VocabWord[] = [
  { id: 1, w: 'resilient',  lv: 'B2', tag: 'ielts', def: 'able to recover quickly' },
  { id: 2, w: 'ephemeral',  lv: 'C1', tag: 'ielts', def: 'lasting for a very short time' },
  { id: 3, w: 'hello',      lv: 'A1', tag: 'ielts', def: 'a greeting' },
  { id: 4, w: 'ubiquitous', lv: 'C2', tag: 'ielts', def: 'present everywhere' },
  { id: 5, w: 'bank',       lv: 'A1', tag: 'cet4',  def: 'a financial institution' },
  { id: 6, w: 'aware',      lv: 'B1', tag: 'ielts', def: 'having knowledge of something' },
];

function makeProgress(overrides: Partial<UserProgress> = {}): UserProgress {
  return {
    level: 8, // B2 ceiling
    mastered: [],
    weights: {},
    lastPushTime: 0,
    config: {
      activeHours: [9, 22],
      timezone: 'UTC',
      dailyTarget: 5,
      vocabTags: ['ielts'],
    },
    ...overrides,
  };
}

describe('selectNextWord', () => {
  it('returns a new word when no reviews are due', () => {
    const progress = makeProgress();
    const word = selectNextWord(progress, SAMPLE_VOCAB, NOW);
    expect(word).not.toBeNull();
    expect(word!.tag).toBe('ielts');
  });

  it('filters out mastered words', () => {
    const progress = makeProgress({ mastered: [1, 3] });
    const word = selectNextWord(progress, SAMPLE_VOCAB, NOW);
    expect(word).not.toBeNull();
    expect([1, 3]).not.toContain(word!.id);
  });

  it('filters words above CEFR ceiling', () => {
    // level 4 → A2 ceiling (order 2), so B2, C1, C2 words excluded
    const progress = makeProgress({ level: 4 });
    const word = selectNextWord(progress, SAMPLE_VOCAB, NOW);
    // Only A1 ielts word (id=3) passes; A1 has order=1 ≤ ceiling=2
    expect(word).not.toBeNull();
    expect(word!.id).toBe(3);
  });

  it('filters by vocabTags', () => {
    const progress = makeProgress({
      config: {
        activeHours: [9, 22],
        timezone: 'UTC',
        dailyTarget: 5,
        vocabTags: ['cet4'],
      },
    });
    const word = selectNextWord(progress, SAMPLE_VOCAB, NOW);
    // Only id=5 matches cet4 and is within level 8 (B2) ceiling
    expect(word!.id).toBe(5);
  });

  it('returns null when all eligible words are mastered', () => {
    // Mastering all ielts words within B2 ceiling (ids 1, 3)
    const progress = makeProgress({ mastered: [1, 3] });
    // level 4 → only id=3 was eligible and now it's mastered
    const p = { ...progress, level: 4, mastered: [3] };
    const word = selectNextWord(p, SAMPLE_VOCAB, NOW);
    expect(word).toBeNull();
  });

  it('prefers due reviews over new words', () => {
    // Set up word 3 as overdue for review
    const overdueState = { ...newState(NOW - ONE_DAY_MS * 2), next: NOW - 1000 };
    const progress = makeProgress({
      weights: { 3: overdueState },
    });
    const word = selectNextWord(progress, SAMPLE_VOCAB, NOW);
    expect(word!.id).toBe(3);
  });

  it('picks most overdue word when multiple are due', () => {
    const moreOverdue = { ...newState(NOW), next: NOW - 2 * ONE_DAY_MS };
    const lessOverdue = { ...newState(NOW), next: NOW - ONE_DAY_MS };
    const progress = makeProgress({
      weights: {
        1: moreOverdue, // id=1 is more overdue
        3: lessOverdue,
      },
    });
    const word = selectNextWord(progress, SAMPLE_VOCAB, NOW);
    expect(word!.id).toBe(1);
  });

  it('does not return non-due review words as priority over new words', () => {
    // word 3 was seen but not yet due; all other words are new
    const notDue = { ...newState(NOW), next: NOW + ONE_DAY_MS };
    const progress = makeProgress({
      level: 8,
      weights: { 3: notDue },
    });
    const word = selectNextWord(progress, SAMPLE_VOCAB, NOW);
    // Should pick a new word (not id=3) since none are due — order is now random
    expect(word).not.toBeNull();
    expect(word!.id).not.toBe(3);
  });
});
