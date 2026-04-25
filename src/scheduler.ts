import type { ScopeConfig } from './types.js';

export function nextWaitMs(config: ScopeConfig): number {
  const windowMs = Math.max(1, (config.activeHoursEnd - config.activeHoursStart) * 3_600_000);
  const meanIntervalMs = windowMs / config.dailyTarget;
  // 指数分布（泊松到达时间间隔）
  return -Math.log(Math.random()) * meanIntervalMs;
}

export function msUntilWindowStart(config: ScopeConfig): number {
  const tz = config.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const now = new Date();

  // 获取用户时区的当前小时
  const hourStr = now.toLocaleString('en-US', {
    hour: 'numeric',
    hour12: false,
    timeZone: tz,
  });
  const currentHour = parseInt(hourStr, 10);

  const start = config.activeHoursStart;
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

export function isInActiveWindow(config: ScopeConfig): boolean {
  const tz = config.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const now = new Date();
  const hourStr = now.toLocaleString('en-US', {
    hour: 'numeric',
    hour12: false,
    timeZone: tz,
  });
  const currentHour = parseInt(hourStr, 10);
  return currentHour >= config.activeHoursStart && currentHour < config.activeHoursEnd;
}

// 调度下一次推送回调，遵守活跃时间窗口。
// `triggerPush` 是到达推送时间时调用的回调。
export function scheduleNext(
  config: ScopeConfig,
  triggerPush: () => void,
): ReturnType<typeof setTimeout> {
  if (isInActiveWindow(config)) {
    const wait = nextWaitMs(config);
    return setTimeout(triggerPush, wait);
  } else {
    const wait = msUntilWindowStart(config);
    return setTimeout(triggerPush, wait);
  }
}
