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
} from './types.js';

// ── 计时器注册表（按 userId 区分）────────────────────────────────────────────
const timers = new Map<string, ReturnType<typeof setTimeout>>();

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

function scheduleNextForUser(ctx: OpenClawContext, config: UserConfig): void {
  const userId = ctx.user.id;
  const existing = timers.get(userId);
  if (existing) clearTimeout(existing);

  const timer = scheduler.scheduleNext(config, () => {
    triggerPush(ctx).catch((err) => {
      console.error(`[vocab-coach] push error for user ${userId}:`, err);
    });
  });
  timers.set(userId, timer);
}

/** 解析按钮点击消息中内嵌的 action JSON 字符串 */
function parseAction(raw: string): ActionPayload | null {
  try {
    const parsed = JSON.parse(raw) as { wordId?: unknown; rating?: unknown };
    const validRatings: FeedbackRating[] = ['know', 'fuzzy', 'forgot', 'master'];
    if (
      typeof parsed.wordId === 'number' &&
      typeof parsed.rating === 'string' &&
      validRatings.includes(parsed.rating as FeedbackRating)
    ) {
      return { wordId: parsed.wordId, rating: parsed.rating as FeedbackRating };
    }
  } catch {
    // 不是 action payload，忽略
  }
  return null;
}

// ── 核心逻辑 ──────────────────────────────────────────────────────────────────

async function handleLoad(ctx: OpenClawContext): Promise<void> {
  await vocab.ensureCached(ctx);
  const progress = await storage.loadProgress(ctx, ctx.user.id);
  scheduleNextForUser(ctx, progress.config);
}

async function handleAction(ctx: OpenClawContext, payload: ActionPayload): Promise<void> {
  const userId = ctx.user.id;
  const progress = await storage.loadProgress(ctx, userId);

  const existing = progress.weights[payload.wordId] ?? srs.newState();
  const newState = srs.applyRating(existing, payload.rating, Date.now());
  progress.weights[payload.wordId] = newState;

  if (srs.isMastered(newState) && !progress.mastered.includes(payload.wordId)) {
    progress.mastered.push(payload.wordId);
  }

  // 自动升级：每掌握 10 个词升一级
  const newLevel = Math.min(10, 1 + Math.floor(progress.mastered.length / 10));
  if (newLevel > progress.level) {
    progress.level = newLevel;
  }

  await storage.saveProgress(ctx, userId, progress);
  await ctx.gateway.send(card.buildAckMessage(payload.rating, progress.config.nativeLang));
  scheduleNextForUser(ctx, progress.config);
}

async function triggerPush(ctx: OpenClawContext): Promise<void> {
  const userId = ctx.user.id;
  const progress = await storage.loadProgress(ctx, userId);
  const vocabList = await vocab.ensureCached(ctx);

  const word = vocab.selectNextWord(progress, vocabList);
  const lang = progress.config.nativeLang ?? 'zh';

  if (!word) {
    await ctx.gateway.send(card.allDoneMessage(lang));
    scheduleNextForUser(ctx, progress.config);
    return;
  }

  const isReview = word.id in progress.weights;
  const reviewCount = progress.weights[word.id]?.reviews ?? 0;
  const content = await generator.generateContent(ctx, word, progress.level, lang);

  await ctx.gateway.send(card.build(word, content, isReview, reviewCount, lang));

  progress.lastPushTime = Date.now();
  await storage.saveProgress(ctx, userId, progress);
  scheduleNextForUser(ctx, progress.config);
}

// ── OpenClaw 插件入口 ──────────────────────────────────────────────────────────
//
// OpenClaw 在插件加载时调用一次 register(api)。
// 订阅两个钩子：
//   gateway:startup  — 每个用户会话连接时触发 → 启动调度器
//   message:received — 每条入站消息触发 → 处理按钮点击
//
export function register(api: OpenClawPluginAPI): void {
  // 钩子 1：用户会话启动（网关连接 / bot 启动）
  api.on('gateway:startup', async (payload: OpenClawHookPayload) => {
    const userId = payload.senderId ?? 'default';
    const ctx = makeCtx(api, userId, payload.timezone);
    await handleLoad(ctx);
  });

  // 钩子 2：入站消息 — 处理 /vocab 斜杠命令或按钮点击 action payload
  api.on('message:received', async (payload: OpenClawHookPayload) => {
    const userId = payload.senderId ?? 'default';
    const ctx = makeCtx(api, userId, payload.timezone);

    // /vocab 命令 → 立即推送
    if (payload.text?.trim() === '/vocab') {
      await triggerPush(ctx);
      return;
    }

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
  await handleLoad(ctx);
}

export async function onMessageReceived(
  payload: OpenClawHookPayload,
  api: OpenClawPluginAPI,
): Promise<void> {
  if (!payload.action) return;
  const action = parseAction(payload.action);
  if (!action) return;

  const userId = payload.senderId ?? 'default';
  const ctx = makeCtx(api, userId, payload.timezone);
  await handleAction(ctx, action);
}
