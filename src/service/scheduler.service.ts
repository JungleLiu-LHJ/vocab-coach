import type { ScopeConfig } from '../model/types.js';

export class SchedulerService {
  private timers = new Map<string, NodeJS.Timeout>();

  /**
   * 计算下次推送的等待时间（泊松分布）
   */
  nextWaitMs(config: ScopeConfig): number {
    const windowMs = Math.max(1, (config.activeHoursEnd - config.activeHoursStart) * 3_600_000);
    const meanIntervalMs = windowMs / config.dailyTarget;
    // 指数分布（泊松到达时间间隔）
    return -Math.log(Math.random()) * meanIntervalMs;
  }

  /**
   * 计算距离窗口开始的时间
   */
  msUntilWindowStart(config: ScopeConfig): number {
    const now = new Date();
    const tz = config.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const currentHour = parseInt(now.toLocaleString('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: tz,
    }), 10);
    const [start, end] = [config.activeHoursStart, config.activeHoursEnd];

    let hoursUntilStart: number;
    if (currentHour < start) {
      hoursUntilStart = start - currentHour;
    } else {
      // 已过窗口结束时间，等到明天窗口开始
      hoursUntilStart = 24 - currentHour + start;
    }

    const minutesIntoHour = now.getMinutes() * 60_000 + now.getSeconds() * 1000 + now.getMilliseconds();
    return hoursUntilStart * 3_600_000 - minutesIntoHour;
  }

  /**
   * 判断是否在活跃窗口内
   */
  isInActiveWindow(config: ScopeConfig): boolean {
    const tz = config.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const hour = parseInt(new Date().toLocaleString('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: tz,
    }), 10);
    return hour >= config.activeHoursStart && hour < config.activeHoursEnd;
  }

  /**
   * 调度下一次推送
   */
  schedule(userId: string, config: ScopeConfig, callback: () => void): void {
    this.clearTimer(userId);

    const delay = this.isInActiveWindow(config)
      ? this.nextWaitMs(config)
      : this.msUntilWindowStart(config);

    const timer = setTimeout(() => {
      callback();
      this.timers.delete(userId);
    }, delay);

    this.timers.set(userId, timer);
  }

  /**
   * 清除定时器
   */
  clearTimer(userId: string): void {
    const existing = this.timers.get(userId);
    if (existing) {
      clearTimeout(existing);
      this.timers.delete(userId);
    }
  }

  /**
   * 停止所有定时器
   */
  async stop(): Promise<void> {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }

  /**
   * 获取定时器数量
   */
  getTimerCount(): number {
    return this.timers.size;
  }
}
