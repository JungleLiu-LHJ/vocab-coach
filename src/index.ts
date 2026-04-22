import * as storage from './storage.js';
import * as vocab from './vocab.js';
import * as srs from './srs.js';
import * as scheduler from './scheduler.js';
import * as generator from './generator.js';
import * as card from './card.js';
import type {
  OpenClawContext,
  OpenClawPluginAPI,
  OpenClawHookPayload,
  ActionPayload,
  FeedbackRating,
  UserConfig,
  UserProgress,
  UserRoute,
} from './types.js';

// ── 计时器注册表（按 userId 区分）────────────────────────────────────────────
const timers = new Map<string, ReturnType<typeof setTimeout>>();

// ── 每用户互斥锁：串行化 load → mutate → save，防止双击按钮造成覆盖写 ────
const userLocks = new Map<string, Promise<unknown>>();

async function withUserLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const prev = userLocks.get(userId) ?? Promise.resolve();
  const current = prev.then(() => fn(), () => fn());
  // 记录当前任务；无论成功失败都清理，避免内存无限增长
  userLocks.set(userId, current);
  try {
    return await current;
  } finally {
    if (userLocks.get(userId) === current) {
      userLocks.delete(userId);
    }
  }
}

// ── 工具函数 ──────────────────────────────────────────────────────────────────

/** 从插件级 API 和发送者信息构建兼容 OpenClawContext 的对象 */
function makeCtx(api: OpenClawPluginAPI, userId: string, timezone?: string): OpenClawContext {
  return {
    storage: api.storage,
    gateway: {
      send: (msg: string) => api.gateway.send(msg, userId),
    },
    agent: api.agent,
    user: { id: userId, timezone },
    config: api.config,
  };
}

function scheduleNextForUser(
  ctx: OpenClawContext,
  config: UserConfig,
  overrideDelayMs?: number,
): void {
  const userId = ctx.user.id;
  const existing = timers.get(userId);
  if (existing) clearTimeout(existing);

  const timer = scheduler.scheduleNext(
    config,
    () => {
      triggerPush(ctx).catch((err) => {
        console.error(`[vocab-coach] push error for user ${userId}:`, err);
      });
    },
    overrideDelayMs,
  );
  if (timer) {
    timers.set(userId, timer);
  } else {
    timers.delete(userId);
  }
}

/** 解析按钮点击消息中内嵌的 action JSON 字符串 */
function parseAction(raw: string): ActionPayload | null {
  try {
    const parsed = JSON.parse(raw) as { wordId?: unknown; rating?: unknown };
    const validRatings: FeedbackRating[] = ['know', 'fuzzy', 'forgot', 'master'];
    // 飞书传入的 wordId 是字符串，兼容两种类型
    const wordId =
      typeof parsed.wordId === 'number'
        ? parsed.wordId
        : typeof parsed.wordId === 'string' && /^\d+$/.test(parsed.wordId)
          ? Number(parsed.wordId)
          : null;
    if (
      wordId !== null &&
      typeof parsed.rating === 'string' &&
      validRatings.includes(parsed.rating as FeedbackRating)
    ) {
      return { wordId, rating: parsed.rating as FeedbackRating };
    }
  } catch {
    // 不是 action payload，忽略
  }
  return null;
}

function saveRouteFromPayload(
  ctx: OpenClawContext,
  userId: string,
  payload: OpenClawHookPayload,
): Promise<void> {
  if (!payload.channelId) return Promise.resolve(); // 没有渠道信息则跳过
  const route: UserRoute = {
    channelId: payload.channelId,
    to: payload.conversationId ?? payload.senderId ?? userId,
    from: payload.senderId ?? userId,
    accountId: payload.accountId,
  };
  return storage.saveRoute(ctx, userId, route);
}

// ── 核心逻辑 ──────────────────────────────────────────────────────────────────

async function loadOrSeedProgress(ctx: OpenClawContext): Promise<UserProgress> {
  const existing = await storage.loadProgressIfExists(ctx, ctx.user.id);
  if (existing) return existing;
  return storage.seedProgress(ctx.config, ctx.user.timezone);
}

async function handleLoad(ctx: OpenClawContext): Promise<void> {
  await withUserLock(ctx.user.id, async () => {
    const progress = await loadOrSeedProgress(ctx);
    // 如果是首次初始化，持久化 seed 后的进度，避免重启时 level 不一致
    await storage.saveProgress(ctx, ctx.user.id, progress);
    await vocab.ensureCached(ctx, progress.config.targetLang ?? 'en');
    scheduleNextForUser(ctx, progress.config);
  });
}

async function handleAction(ctx: OpenClawContext, payload: ActionPayload): Promise<void> {
  const userId = ctx.user.id;
  await withUserLock(userId, async () => {
    const progress = await storage.loadProgress(ctx, userId);

    if (payload.rating === 'master') {
      // 直接退役该词：从 weights 移除（若存在），加入 mastered
      delete progress.weights[payload.wordId];
      if (!progress.mastered.includes(payload.wordId)) {
        progress.mastered.push(payload.wordId);
      }
    } else {
      const existing = progress.weights[payload.wordId] ?? srs.newState();
      const newState = srs.applyRating(existing, payload.rating, Date.now());
      progress.weights[payload.wordId] = newState;

      if (srs.isMastered(newState) && !progress.mastered.includes(payload.wordId)) {
        progress.mastered.push(payload.wordId);
      }
    }

    // 自动升级：每掌握 10 个词升一级
    const newLevel = Math.min(10, 1 + Math.floor(progress.mastered.length / 10));
    if (newLevel > progress.level) {
      progress.level = newLevel;
    }

    await storage.saveProgress(ctx, userId, progress);
    await ctx.gateway.send(card.buildAckMessage(payload.rating, progress.config.nativeLang));
    scheduleNextForUser(ctx, progress.config);
  });
}

async function triggerPush(ctx: OpenClawContext): Promise<void> {
  const userId = ctx.user.id;
  // 读取 + 选词 阶段加锁，避免和按钮点击并发覆盖
  const selection = await withUserLock(userId, async () => {
    const progress = await storage.loadProgress(ctx, userId);
    const targetLang = progress.config.targetLang ?? 'en';
    const vocabList = await vocab.ensureCached(ctx, targetLang);
    const word = vocab.selectNextWord(progress, vocabList);
    return { progress, word };
  });

  const { progress, word } = selection;
  const lang = progress.config.nativeLang ?? 'zh';
  const targetLang = progress.config.targetLang ?? 'en';

  if (!word) {
    await ctx.gateway.send(card.allDoneMessage(lang));
    // 词库耗尽 → 1 小时后再试一次，而不是立刻重新调度造成刷屏
    scheduleNextForUser(ctx, progress.config, scheduler.EXHAUSTED_BACKOFF_MS);
    return;
  }

  const isReview = word.id in progress.weights;
  const reviewCount = progress.weights[word.id]?.reviews ?? 0;
  const content = await generator.generateContent(ctx, word, progress.level, lang, targetLang);

  await ctx.gateway.send(card.build(word, content, isReview, reviewCount, lang));

  // 仅更新 lastPushTime，再次获取锁写回（避免长时间持锁做 LLM 调用）
  await withUserLock(userId, async () => {
    const fresh = await storage.loadProgress(ctx, userId);
    fresh.lastPushTime = Date.now();
    await storage.saveProgress(ctx, userId, fresh);
    scheduleNextForUser(ctx, fresh.config);
  });
}

// ── /vocab-set 和 /vocab-status 命令 ──────────────────────────────────────────

/** 返回本地化的命令帮助/状态信息 */
function helpMessage(): string {
  return [
    '`/vocab`                       立即推送一个单词',
    '`/vocab-set target <n>`       每日目标（1–50）',
    '`/vocab-set hours <s> <e>`    活跃时间（0–24）',
    '`/vocab-set source <tag>`     词库：ielts/toefl/cet4/cet6/gre',
    '`/vocab-set lang <code>`      目标语言：en/ja/zh/...',
    '`/vocab-set native <code>`    母语：zh/en/ja/...',
    '`/vocab-set pause`            暂停推送',
    '`/vocab-set resume`           恢复推送',
    '`/vocab-status`               查看当前设置和进度',
  ].join('\n');
}

function statusMessage(progress: UserProgress): string {
  const c = progress.config;
  const active = c.paused ? '⏸ 已暂停' : `${c.activeHours[0]}–${c.activeHours[1]} (${c.timezone})`;
  const inProgressCount = Object.keys(progress.weights).length - progress.mastered.length;
  return [
    `📊 **进度**`,
    `目标语言：${c.targetLang ?? 'en'} · 母语：${c.nativeLang}`,
    `等级：${progress.level}/10 · 已掌握：${progress.mastered.length} · 在学：${Math.max(0, inProgressCount)}`,
    `每日目标：${c.dailyTarget} · 词库：${c.vocabTags.join(',')}`,
    `活跃时间：${active}`,
  ].join('\n');
}

/**
 * 解析 /vocab-set 命令，返回修改后的 config 或错误信息。
 * 不直接修改 progress，交由调用方在锁内处理。
 */
function applyVocabSet(config: UserConfig, args: string[]): { config?: UserConfig; message: string } {
  if (args.length === 0) return { message: helpMessage() };

  const [key, ...rest] = args;
  const next: UserConfig = { ...config };

  switch (key) {
    case 'target': {
      const n = Number(rest[0]);
      if (!Number.isFinite(n) || n < 1 || n > 50) {
        return { message: '❌ target 必须是 1–50 的整数' };
      }
      next.dailyTarget = Math.floor(n);
      return { config: next, message: `✅ 每日目标 = ${next.dailyTarget}` };
    }
    case 'hours': {
      const s = Number(rest[0]);
      const e = Number(rest[1]);
      if (!Number.isFinite(s) || !Number.isFinite(e) || s < 0 || e > 24 || s >= e) {
        return { message: '❌ hours 格式：start end，要求 0 ≤ start < end ≤ 24' };
      }
      next.activeHours = [s, e];
      return { config: next, message: `✅ 活跃时间 = ${s}–${e}` };
    }
    case 'source': {
      const tag = rest[0];
      if (!tag) return { message: '❌ 请指定词库标签' };
      next.vocabTags = [tag];
      return { config: next, message: `✅ 词库 = ${tag}` };
    }
    case 'lang': {
      const code = rest[0];
      if (!code) return { message: '❌ 请指定目标语言代码（如 en / ja / zh）' };
      next.targetLang = code;
      return { config: next, message: `✅ 目标语言 = ${code}` };
    }
    case 'native': {
      const code = rest[0];
      if (!code) return { message: '❌ 请指定母语代码（如 zh / en / ja）' };
      next.nativeLang = code;
      return { config: next, message: `✅ 母语 = ${code}` };
    }
    case 'pause':
      next.paused = true;
      return { config: next, message: '⏸ 已暂停推送，发送 `/vocab-set resume` 恢复' };
    case 'resume':
      next.paused = false;
      return { config: next, message: '▶️ 已恢复推送' };
    default:
      return { message: `❌ 未知子命令：${key}\n\n${helpMessage()}` };
  }
}

async function handleCommand(ctx: OpenClawContext, text: string): Promise<boolean> {
  const trimmed = text.trim();

  // /vocab — 立即推送
  if (trimmed === '/vocab') {
    triggerPush(ctx).catch((err) => {
      console.error(`[vocab-coach] /vocab push error for user ${ctx.user.id}:`, err);
    });
    return true;
  }

  // /vocab-status — 查看进度
  if (trimmed === '/vocab-status') {
    await withUserLock(ctx.user.id, async () => {
      const progress = await storage.loadProgress(ctx, ctx.user.id);
      await ctx.gateway.send(statusMessage(progress));
    });
    return true;
  }

  // /vocab-set ... — 修改配置
  if (trimmed === '/vocab-set' || trimmed.startsWith('/vocab-set ')) {
    const args = trimmed.slice('/vocab-set'.length).trim().split(/\s+/).filter(Boolean);
    await withUserLock(ctx.user.id, async () => {
      const progress = await storage.loadProgress(ctx, ctx.user.id);
      const { config: nextConfig, message } = applyVocabSet(progress.config, args);
      if (nextConfig) {
        progress.config = nextConfig;
        await storage.saveProgress(ctx, ctx.user.id, progress);
        // 配置变化（活跃窗口 / 暂停 / 目标语言）都应重排调度器
        scheduleNextForUser(ctx, nextConfig);
      }
      await ctx.gateway.send(message);
    });
    return true;
  }

  return false;
}

// ── OpenClaw 插件入口 ──────────────────────────────────────────────────────────
export function register(api: OpenClawPluginAPI): void {
  // 钩子 1：用户会话启动（网关连接 / bot 启动）
  api.on('gateway:startup', async (payload: OpenClawHookPayload) => {
    const userId = payload.senderId ?? 'default';
    const ctx = makeCtx(api, userId, payload.timezone);
    await saveRouteFromPayload(ctx, userId, payload);
    await handleLoad(ctx);
  });

  // 钩子 2：入站消息 — 命令 / 按钮点击
  api.on('message:received', async (payload: OpenClawHookPayload) => {
    const userId = payload.senderId ?? 'default';
    const ctx = makeCtx(api, userId, payload.timezone);

    // 每条消息都刷新一次路由（用户可能换群 / 换客户端）
    await saveRouteFromPayload(ctx, userId, payload);

    // 命令
    if (payload.text && (await handleCommand(ctx, payload.text))) {
      return;
    }

    // 按钮点击
    if (!payload.action) return;
    const action = parseAction(payload.action);
    if (!action) return;

    await handleAction(ctx, action);
  });
}

// ── 旧版 / 测试入口 ────────────────────────────────────────────────────────────
// 保留这些导出，使单元测试和手动沙箱运行无需完整的 OpenClaw 运行时也能直接调用

export async function onLoad(ctx: OpenClawContext): Promise<void> {
  await handleLoad(ctx);
}

export async function onAction(ctx: OpenClawContext, payload: ActionPayload): Promise<void> {
  await handleAction(ctx, payload);
}

// openclaw.plugin.json hooks map 中引用的具名钩子处理函数
export async function onGatewayStartup(
  payload: OpenClawHookPayload,
  api: OpenClawPluginAPI,
): Promise<void> {
  const userId = payload.senderId ?? 'default';
  const ctx = makeCtx(api, userId, payload.timezone);
  await saveRouteFromPayload(ctx, userId, payload);
  await handleLoad(ctx);
}

export async function onMessageReceived(
  payload: OpenClawHookPayload,
  api: OpenClawPluginAPI,
): Promise<void> {
  const userId = payload.senderId ?? 'default';
  const ctx = makeCtx(api, userId, payload.timezone);
  await saveRouteFromPayload(ctx, userId, payload);

  if (payload.text && (await handleCommand(ctx, payload.text))) return;

  if (!payload.action) return;
  const action = parseAction(payload.action);
  if (!action) return;
  await handleAction(ctx, action);
}
