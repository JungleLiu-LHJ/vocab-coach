import type { UserConfig } from './types.js';

// 指数分布长尾可能产生极端大的等待（对应 random → 0），
// 也可能在 random → 1 时接近 0 造成瞬时连发。两头都需要裁剪。
const MIN_WAIT_MS = 30_000;           // 下限 30 秒，避免用户刚点完立刻再收到
const MAX_WAIT_MULT = 4;              // 上限 = 4 × 平均间隔（相当于 ~98 百分位）

export function nextWaitMs(config: UserConfig): number {
  const windowMs = (config.activeHours[1] - config.activeHours[0]) * 3_600_000;
  const meanIntervalMs = windowMs / config.dailyTarget;
  // 指数分布（泊松到达时间间隔）
  const raw = -Math.log(Math.random()) * meanIntervalMs;
  return Math.min(MAX_WAIT_MULT * meanIntervalMs, Math.max(MIN_WAIT_MS, raw));
}

export function msUntilWindowStart(config: UserConfig): number {
  const tz = config.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const now = new Date();

  // 获取用户时区的当前小时
  const hourStr = now.toLocaleString('en-US', {
    hour: 'numeric',
    hour12: false,
    timeZone: tz,
  });
  const currentHour = parseInt(hourStr, 10);

  const [start] = config.activeHours;
  let hoursUntilStart: number;

  if (currentHour < start) {
    hoursUntilStart = start - currentHour;
  } else {
    // 已过窗口结束时间，等到明天窗口开始
    hoursUntilStart = 24 - currentHour + start;
  }

  // 对齐到整点边界，加一个小随机偏移
  const minutesIntoHour = now.getMinutes() * 60_000 + now.getSeconds() * 1000 + now.getMilliseconds();
  return hoursUntilStart * 3_600_000 - minutesIntoHour;
}

export function isInActiveWindow(config: UserConfig): boolean {
  const tz = config.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const now = new Date();
  const hourStr = now.toLocaleString('en-US', {
    hour: 'numeric',
    hour12: false,
    timeZone: tz,
  });
  const currentHour = parseInt(hourStr, 10);
  return currentHour >= config.activeHours[0] && currentHour < config.activeHours[1];
}

/** 词库耗尽 / 全部到期时的退避延迟（1 小时） */
export const EXHAUSTED_BACKOFF_MS = 60 * 60_000;

// 调度下一次推送回调，遵守活跃时间窗口。
// `triggerPush` 是到达推送时间时调用的回调。
// 如果用户已暂停或传入自定义延迟，使用对应策略。
export function scheduleNext(
  config: UserConfig,
  triggerPush: () => void,
  overrideDelayMs?: number,
): ReturnType<typeof setTimeout> | null {
  if (config.paused) return null;

  if (typeof overrideDelayMs === 'number') {
    return setTimeout(triggerPush, overrideDelayMs);
  }
  if (isInActiveWindow(config)) {
    const wait = nextWaitMs(config);
    return setTimeout(triggerPush, wait);
  } else {
    const wait = msUntilWindowStart(config);
    return setTimeout(triggerPush, wait);
  }
}
