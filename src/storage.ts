import type { OpenClawContext, UserProgress, UserConfig, UserRoute } from './types.js';

// ── 存储键命名约定 ─────────────────────────────────────────
// progress:{userId}        每用户学习进度（FSRS 状态、mastered 列表、config）
// routes                   所有用户的路由映射（channelId + conversationId）
// vocab_cache:{targetLang} 每个目标语言的词库缓存

const ROUTES_KEY = 'routes';

function progressKey(userId: string): string {
  return `progress:${userId}`;
}

// ── 用户配置默认值 ────────────────────────────────────────

const DEFAULT_CONFIG: UserConfig = {
  activeHours: [9, 22],
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  dailyTarget: 5,
  vocabTags: ['ielts'],
  nativeLang: 'zh',
  targetLang: 'en',
  paused: false,
};

/**
 * 根据目标语言选一个合理的起始等级（1–10）。
 * 英语 IELTS/TOEFL 等词库集中在 B2–C1，起始等级设高一些才有候选词。
 * 其他语言暂时一律从 1 开始。
 */
function defaultStartLevel(targetLang: string): number {
  if (targetLang === 'en') return 7; // CEFR B2
  return 1;
}

export function defaultProgress(config: UserConfig = { ...DEFAULT_CONFIG }): UserProgress {
  return {
    level: defaultStartLevel(config.targetLang ?? 'en'),
    mastered: [],
    weights: {},
    lastPushTime: 0,
    config,
  };
}

// ── 学习进度 ──────────────────────────────────────────────

export async function loadProgress(
  ctx: OpenClawContext,
  userId: string,
): Promise<UserProgress> {
  const raw = await ctx.storage.get(progressKey(userId));
  if (!raw) return defaultProgress();
  try {
    const parsed = JSON.parse(raw) as UserProgress;
    // 向后兼容：补齐缺省字段，防止老记录里没有新字段
    parsed.config = { ...DEFAULT_CONFIG, ...parsed.config };
    return parsed;
  } catch {
    return defaultProgress();
  }
}

/** 仅当进度已存在时返回，用于判断是否是首次用户 */
export async function loadProgressIfExists(
  ctx: OpenClawContext,
  userId: string,
): Promise<UserProgress | null> {
  const raw = await ctx.storage.get(progressKey(userId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as UserProgress;
    parsed.config = { ...DEFAULT_CONFIG, ...parsed.config };
    return parsed;
  } catch {
    return null;
  }
}

export async function saveProgress(
  ctx: OpenClawContext,
  userId: string,
  progress: UserProgress,
): Promise<void> {
  await ctx.storage.set(progressKey(userId), JSON.stringify(progress));
}

// ── 路由 ──────────────────────────────────────────────────

export async function loadRoutes(ctx: OpenClawContext): Promise<Record<string, UserRoute>> {
  const raw = await ctx.storage.get(ROUTES_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, UserRoute>;
  } catch {
    return {};
  }
}

export async function saveRoute(
  ctx: OpenClawContext,
  userId: string,
  route: UserRoute,
): Promise<void> {
  const routes = await loadRoutes(ctx);
  const existing = routes[userId];
  // 仅在路由内容实际变化时才写回，避免每条消息都写存储
  if (
    existing &&
    existing.channelId === route.channelId &&
    existing.to === route.to &&
    existing.from === route.from &&
    existing.accountId === route.accountId
  ) {
    return;
  }
  routes[userId] = route;
  await ctx.storage.set(ROUTES_KEY, JSON.stringify(routes));
}

export async function loadRoute(
  ctx: OpenClawContext,
  userId: string,
): Promise<UserRoute | null> {
  const routes = await loadRoutes(ctx);
  return routes[userId] ?? null;
}

// ── 从插件级配置生成用户初始配置 ──────────────────────────

export function seedConfig(
  pluginConfig: OpenClawContext['config'] | undefined,
  timezone?: string,
): UserConfig {
  const cfg = pluginConfig ?? {};
  return {
    activeHours: [
      Number(cfg.activeHoursStart ?? 9),
      Number(cfg.activeHoursEnd ?? 22),
    ],
    timezone: timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    dailyTarget: Number(cfg.dailyTarget ?? 5),
    vocabTags: [String(cfg.vocabSource ?? 'ielts')],
    nativeLang: String(cfg.nativeLang ?? 'zh'),
    targetLang: String(cfg.targetLang ?? 'en'),
    paused: false,
  };
}

/** 从插件配置和时区创建首个用户的完整进度对象 */
export function seedProgress(
  pluginConfig: OpenClawContext['config'] | undefined,
  timezone?: string,
): UserProgress {
  const config = seedConfig(pluginConfig, timezone);
  const startLevel =
    typeof pluginConfig?.startLevel === 'number'
      ? pluginConfig.startLevel
      : defaultStartLevel(config.targetLang ?? 'en');
  return {
    level: startLevel,
    mastered: [],
    weights: {},
    lastPushTime: 0,
    config,
  };
}
