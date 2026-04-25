import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { nextWaitMs, isInActiveWindow, msUntilWindowStart, EXHAUSTED_BACKOFF_MS } from '../src/scheduler.js';
import type { ScopeConfig } from '../src/types.js';

const BASE_CONFIG: ScopeConfig = {
  activeHoursStart: 9,
  activeHoursEnd: 22,
  timezone: 'UTC',
  dailyTarget: 5,
  vocabSource: 'ielts',
  nativeLang: 'zh',
  targetLang: 'en',
  paused: false,
};

describe('nextWaitMs', () => {
  it('returns a positive number', () => {
    const wait = nextWaitMs(BASE_CONFIG);
    expect(wait).toBeGreaterThan(0);
  });

  it('is deterministic when Math.random is mocked', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const windowMs = (22 - 9) * 3_600_000;
    const meanInterval = windowMs / 5;
    const expected = -Math.log(0.5) * meanInterval;
    expect(nextWaitMs(BASE_CONFIG)).toBeCloseTo(expected);
    vi.restoreAllMocks();
  });

  it('scales with dailyTarget: more targets → shorter intervals', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const few = nextWaitMs({ ...BASE_CONFIG, dailyTarget: 2 });
    const many = nextWaitMs({ ...BASE_CONFIG, dailyTarget: 10 });
    expect(few).toBeGreaterThan(many);
    vi.restoreAllMocks();
  });

  it('scales with window size: wider window → longer mean interval', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const narrow = nextWaitMs({ ...BASE_CONFIG, activeHoursStart: 9, activeHoursEnd: 11 });
    const wide = nextWaitMs({ ...BASE_CONFIG, activeHoursStart: 8, activeHoursEnd: 22 });
    expect(wide).toBeGreaterThan(narrow);
    vi.restoreAllMocks();
  });

  it('clamps to MIN_WAIT_MS when Math.random returns near 1 (raw → 0)', () => {
    // -log(1 - 1e-9) ≈ 1e-9, raw 趋近 0 ms — 必须被钳到最小值
    vi.spyOn(Math, 'random').mockReturnValue(1 - 1e-9);
    const wait = nextWaitMs(BASE_CONFIG);
    expect(wait).toBeGreaterThanOrEqual(30_000);
    vi.restoreAllMocks();
  });

  it('clamps to MAX_WAIT_MULT × meanInterval when Math.random returns near 0 (long tail)', () => {
    // -log(very small) → very large；窗口 13h / dailyTarget 5 → meanInterval ≈ 156min
    // 4× 上限 ≈ 624 min；任何超过该值的指数尾巴都应被截断
    vi.spyOn(Math, 'random').mockReturnValue(1e-10);
    const wait = nextWaitMs(BASE_CONFIG);
    const windowMs = (22 - 9) * 3_600_000;
    const meanInterval = windowMs / 5;
    expect(wait).toBeLessThanOrEqual(4 * meanInterval);
    vi.restoreAllMocks();
  });
});

describe('EXHAUSTED_BACKOFF_MS', () => {
  it('is 1 hour', () => {
    expect(EXHAUSTED_BACKOFF_MS).toBe(60 * 60_000);
  });
});

describe('isInActiveWindow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns true during active hours', () => {
    // 2pm UTC
    vi.setSystemTime(new Date('2024-01-15T14:00:00Z'));
    expect(isInActiveWindow(BASE_CONFIG)).toBe(true);
  });

  it('returns false before active hours', () => {
    // 7am UTC
    vi.setSystemTime(new Date('2024-01-15T07:00:00Z'));
    expect(isInActiveWindow(BASE_CONFIG)).toBe(false);
  });

  it('returns false at or after end hour (22:00)', () => {
    vi.setSystemTime(new Date('2024-01-15T22:00:00Z'));
    expect(isInActiveWindow(BASE_CONFIG)).toBe(false);
  });

  it('returns true at the start hour boundary (9:00)', () => {
    vi.setSystemTime(new Date('2024-01-15T09:00:00Z'));
    expect(isInActiveWindow(BASE_CONFIG)).toBe(true);
  });

  it('returns false at 23:59', () => {
    vi.setSystemTime(new Date('2024-01-15T23:59:00Z'));
    expect(isInActiveWindow(BASE_CONFIG)).toBe(false);
  });
});

describe('msUntilWindowStart', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns positive ms when currently before start hour', () => {
    // 7am UTC, window starts at 9am
    vi.setSystemTime(new Date('2024-01-15T07:00:00Z'));
    const wait = msUntilWindowStart(BASE_CONFIG);
    expect(wait).toBeGreaterThan(0);
    // Should be approximately 2 hours
    expect(wait).toBeCloseTo(2 * 3_600_000, -3); // within ~1s
  });

  it('returns positive ms when currently after end hour (next day)', () => {
    // 23:00 UTC, window starts at 9am next day → ~10 hours
    vi.setSystemTime(new Date('2024-01-15T23:00:00Z'));
    const wait = msUntilWindowStart(BASE_CONFIG);
    expect(wait).toBeGreaterThan(0);
  });
});
