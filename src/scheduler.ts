import type { UserConfig } from './types.js';

export function nextWaitMs(config: UserConfig): number {
  const windowMs = (config.activeHours[1] - config.activeHours[0]) * 3_600_000;
  const meanIntervalMs = windowMs / config.dailyTarget;
  // Exponential distribution (Poisson inter-arrival time)
  return -Math.log(Math.random()) * meanIntervalMs;
}

export function msUntilWindowStart(config: UserConfig): number {
  const tz = config.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const now = new Date();

  // Parse current hour in user's timezone
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
    // Already past window end; wait until start of next day's window
    hoursUntilStart = 24 - currentHour + start;
  }

  // Align to the exact start-of-hour boundary plus a small random offset
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

// Schedules the next push callback, respecting the active window.
// `triggerPush` is the callback to invoke when it's time to push.
export function scheduleNext(
  config: UserConfig,
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
