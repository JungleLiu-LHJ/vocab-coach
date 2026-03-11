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

// ── Timer registry (per userId) ───────────────────────────────────────────────
const timers = new Map<string, ReturnType<typeof setTimeout>>();

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build an OpenClawContext-compatible object from the plugin-level API + sender info. */
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

/** Parse the action JSON string embedded in a button tap message. */
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
    // not an action payload — ignore
  }
  return null;
}

// ── Core logic ────────────────────────────────────────────────────────────────

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

  // Auto-level: bump every 10 mastered words
  const newLevel = Math.min(10, 1 + Math.floor(progress.mastered.length / 10));
  if (newLevel > progress.level) {
    progress.level = newLevel;
  }

  await storage.saveProgress(ctx, userId, progress);
  await ctx.gateway.send(card.buildAckMessage(payload.rating));
  scheduleNextForUser(ctx, progress.config);
}

async function triggerPush(ctx: OpenClawContext): Promise<void> {
  const userId = ctx.user.id;
  const progress = await storage.loadProgress(ctx, userId);
  const vocabList = await vocab.ensureCached(ctx);

  const word = vocab.selectNextWord(progress, vocabList);
  if (!word) {
    await ctx.gateway.send('🎉 All words mastered for today!');
    scheduleNextForUser(ctx, progress.config);
    return;
  }

  const isReview = word.id in progress.weights;
  const reviewCount = progress.weights[word.id]?.reviews ?? 0;
  const content = await generator.generateContent(ctx, word, progress.level);

  await ctx.gateway.send(card.build(word, content, isReview, reviewCount));

  progress.lastPushTime = Date.now();
  await storage.saveProgress(ctx, userId, progress);
  scheduleNextForUser(ctx, progress.config);
}

// ── Real OpenClaw plugin entry point ──────────────────────────────────────────
//
// OpenClaw calls register(api) once when the plugin loads.
// We subscribe to two hooks:
//   gateway:startup  — fires for each connected user session → start scheduler
//   message:received — fires for every inbound message → handle button taps
//
export function register(api: OpenClawPluginAPI): void {
  // Hook 1: user session starts (gateway connects / bot starts)
  api.on('gateway:startup', async (payload: OpenClawHookPayload) => {
    const userId = payload.senderId ?? 'default';
    const ctx = makeCtx(api, userId, payload.timezone);
    await handleLoad(ctx);
  });

  // Hook 2: inbound message — handle /vocab slash command or button-tap action payload
  api.on('message:received', async (payload: OpenClawHookPayload) => {
    const userId = payload.senderId ?? 'default';
    const ctx = makeCtx(api, userId, payload.timezone);

    // /vocab slash command → immediate push
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

// ── Legacy / test-harness entry points ────────────────────────────────────────
// Kept so unit tests and manual sandbox runs can call these directly
// without needing a full OpenClaw runtime.

export async function onLoad(ctx: OpenClawContext): Promise<void> {
  await handleLoad(ctx);
}

export async function onAction(ctx: OpenClawContext, payload: ActionPayload): Promise<void> {
  await handleAction(ctx, payload);
}

// Named hook handlers referenced in openclaw.plugin.json hooks map
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
