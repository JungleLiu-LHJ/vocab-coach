/**
 * Vocab Coach — OpenClaw Plugin
 *
 * Entry point loaded directly by OpenClaw's jiti runtime (no build step).
 * Exports a default OpenClawPluginDefinition that OpenClaw calls register() on.
 *
 * Supports all built-in OpenClaw channels:
 *   telegram, whatsapp, discord, slack, signal, imessage, line
 */
import type {
  OpenClawPluginApi,
  OpenClawPluginDefinition,
  OpenClawPluginConfigSchema,
  OpenClawPluginService,
  OpenClawPluginServiceContext,
  PluginHookMessageReceivedEvent,
  PluginHookMessageContext,
  PluginHookGatewayStartEvent,
  PluginHookGatewayContext,
} from 'openclaw/plugin-sdk';

import * as storage from './src/storage.js';
import * as vocab from './src/vocab-fs.js';
import * as srs from './src/srs.js';
import * as scheduler from './src/scheduler.js';
import * as card from './src/card.js';
import * as generator from './src/generator.js';
import type { FeedbackRating, UserConfig, UserRoute } from './src/types.js';

// ── Feishu HTTP client (no external dep) ──────────────────────────────────
interface FeishuConfig {
  appId: string;
  appSecret: string;
}

let feishuTokenCache: { token: string; expiresAt: number } | null = null;
// Credentials cached from command/message ctx (fallback when api.config is plugin-scoped)
let globalFeishuCfg: { appId: string; appSecret: string } | null = null;

async function getFeishuToken(cfg: FeishuConfig): Promise<string> {
  if (feishuTokenCache && Date.now() < feishuTokenCache.expiresAt) {
    return feishuTokenCache.token;
  }
  const res = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: cfg.appId, app_secret: cfg.appSecret }),
  });
  const data = await res.json() as { tenant_access_token: string; expire: number };
  feishuTokenCache = { token: data.tenant_access_token, expiresAt: Date.now() + (data.expire - 60) * 1000 };
  return feishuTokenCache.token;
}

function resolveFeishuConfig(api: OpenClawPluginApi): FeishuConfig {
  // Helper to extract feishu credentials from any config-shaped object
  function extractFromConfig(cfg: Record<string, unknown> | undefined): FeishuConfig | null {
    if (!cfg) return null;
    // Direct plugin-level keys
    if (cfg.feishuAppId && cfg.feishuAppSecret) {
      return { appId: cfg.feishuAppId as string, appSecret: cfg.feishuAppSecret as string };
    }
    // Global config: channels.feishu.{appId,appSecret}
    const feishu = (cfg.channels as Record<string, unknown> | undefined)?.feishu as { appId?: string; appSecret?: string; accounts?: Record<string, { appId?: string; appSecret?: string }> } | undefined;
    if (feishu?.appId && feishu?.appSecret) {
      return { appId: feishu.appId, appSecret: feishu.appSecret };
    }
    // Global config: channels.feishu.accounts.default
    const acct = feishu?.accounts?.default ?? Object.values(feishu?.accounts ?? {})[0];
    if (acct?.appId && acct?.appSecret) {
      return { appId: acct.appId, appSecret: acct.appSecret };
    }
    return null;
  }

  // 1. api.config (may be plugin config or full openclaw config depending on runtime)
  const fromApiConfig = extractFromConfig(api.config as Record<string, unknown>);
  if (fromApiConfig) return fromApiConfig;

  // 2. api.openclawConfig (unofficial but some runtimes expose it)
  const fromOpenclawConfig = extractFromConfig((api as unknown as { openclawConfig?: Record<string, unknown> }).openclawConfig);
  if (fromOpenclawConfig) return fromOpenclawConfig;

  // 3. Cached from command/message ctx (set whenever ctx carries full openclaw config)
  if (globalFeishuCfg) return globalFeishuCfg;

  throw new Error('[vocab-coach] feishu appId/appSecret not configured — set feishuAppId/feishuAppSecret in plugin config');
}

/** Cache feishu credentials from any ctx that carries the full openclaw config. */
function cacheFeishuCfgFromCtx(rawCtx: unknown): void {
  if (globalFeishuCfg) return; // already cached
  const cfg = (rawCtx as Record<string, unknown> | undefined)?.config as Record<string, unknown> | undefined;
  const feishu = (cfg?.channels as Record<string, unknown> | undefined)?.feishu as { appId?: string; appSecret?: string } | undefined;
  if (feishu?.appId && feishu?.appSecret) {
    globalFeishuCfg = { appId: feishu.appId, appSecret: feishu.appSecret };
  }
}

/** Strip OpenClaw internal namespace prefixes like "user:", "feishu:", etc. */
function stripFeishuIdPrefix(id: string): string {
  // e.g. "user:ou_abc" → "ou_abc", "feishu:ou_abc" → "ou_abc"
  const colon = id.indexOf(':');
  if (colon !== -1 && !id.startsWith('oc_') && !id.startsWith('ou_')) {
    return id.slice(colon + 1);
  }
  return id;
}

function resolveFeishuReceiveIdType(to: string): string {
  const t = to.trim();
  if (t.startsWith('oc_')) return 'chat_id';
  if (t.startsWith('ou_')) return 'open_id';
  if (t.includes('@')) return 'email';
  return 'open_id';
}

async function sendFeishuCard(to: string, cardJson: Record<string, unknown>, api: OpenClawPluginApi): Promise<void> {
  const cleanTo = stripFeishuIdPrefix(to);
  const cfg = resolveFeishuConfig(api);
  const token = await getFeishuToken(cfg);
  const receiveIdType = resolveFeishuReceiveIdType(cleanTo);
  const res = await fetch(`https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=${receiveIdType}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ receive_id: cleanTo, msg_type: 'interactive', content: JSON.stringify(cardJson) }),
  });
  const data = await res.json() as { code: number; msg: string };
  if (data.code !== 0) throw new Error(`Feishu send failed: ${data.code} ${data.msg}`);
}

async function sendFeishuText(to: string, text: string, api: OpenClawPluginApi): Promise<void> {
  const cleanTo = stripFeishuIdPrefix(to);
  const cfg = resolveFeishuConfig(api);
  const token = await getFeishuToken(cfg);
  const receiveIdType = resolveFeishuReceiveIdType(cleanTo);
  const res = await fetch(`https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=${receiveIdType}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ receive_id: cleanTo, msg_type: 'text', content: JSON.stringify({ text }) }),
  });
  const data = await res.json() as { code: number; msg: string };
  if (data.code !== 0) throw new Error(`Feishu send failed: ${data.code} ${data.msg}`);
}

// ── Per-user timer registry ────────────────────────────────────────────────
const timers = new Map<string, ReturnType<typeof setTimeout>>();
let globalStateDir = '';
let globalApi: OpenClawPluginApi | null = null;

// ── Multi-channel send helper ──────────────────────────────────────────────
async function sendToUser(
  route: UserRoute,
  content: string,
  api: OpenClawPluginApi,
): Promise<void> {
  const { channelId, to, accountId } = route;
  try {
    switch (channelId) {
      case 'telegram':
        await api.runtime.channel.telegram.sendMessageTelegram(to, content, { accountId });
        break;
      case 'whatsapp':
        // verbose is a required param for WhatsApp
        await api.runtime.channel.whatsapp.sendMessageWhatsApp(to, content, { verbose: false, accountId });
        break;
      case 'discord':
        await api.runtime.channel.discord.sendMessageDiscord(to, content, { accountId });
        break;
      case 'slack':
        await api.runtime.channel.slack.sendMessageSlack(to, content, { accountId });
        break;
      case 'signal':
        await api.runtime.channel.signal.sendMessageSignal(to, content, { accountId });
        break;
      case 'imessage':
        await api.runtime.channel.imessage.sendMessageIMessage(to, content, { accountId });
        break;
      case 'line':
        // pushMessageLine is the proactive (non-reply) variant
        await api.runtime.channel.line.pushMessageLine(to, content, { accountId });
        break;
      case 'feishu':
        await sendFeishuText(to, content, api);
        break;
      default:
        api.logger.warn(`[vocab-coach] unsupported channel "${channelId}" — cannot push to ${to}`);
    }
  } catch (err) {
    api.logger.error(`[vocab-coach] send failed on ${channelId} to ${to}: ${String(err)}`);
  }
}

// ── Action payload parsing ─────────────────────────────────────────────────
interface ActionPayload { wordId: number; rating: FeedbackRating }

function parseAction(content: string): ActionPayload | null {
  try {
    const parsed = JSON.parse(content.trim()) as { wordId?: unknown; rating?: unknown };
    const validRatings: FeedbackRating[] = ['know', 'fuzzy', 'forgot', 'master'];
    // wordId may arrive as number (non-Feishu) or string (Feishu flat value map)
    const rawId = parsed.wordId;
    const wordId = typeof rawId === 'number' ? rawId : parseInt(String(rawId ?? ''), 10);
    if (
      !isNaN(wordId) &&
      typeof parsed.rating === 'string' &&
      validRatings.includes(parsed.rating as FeedbackRating)
    ) {
      return { wordId, rating: parsed.rating as FeedbackRating };
    }
  } catch { /* not an action payload */ }
  return null;
}

// ── Core push logic ────────────────────────────────────────────────────────
async function triggerPush(
  userId: string,
  route: UserRoute,
  api: OpenClawPluginApi,
): Promise<void> {
  const progress = await storage.loadProgress(globalStateDir, userId);
  const vocabList = await vocab.getVocab();

  const word = vocab.selectNextWord(progress, vocabList);
  if (!word) {
    await sendToUser(route, '🎉 今天的单词已全部掌握！', api);
    scheduleNext(userId, route, progress.config, api);
    return;
  }

  const isReview = word.id in progress.weights;
  const reviewCount = progress.weights[word.id]?.reviews ?? 0;

  // Generate rich content via LLM (falls back to static if agent unavailable)
  const content = isReview
    ? { englishDef: '', examples: [], related: [], mnemonic: '' }
    : await generator.generateContent(api, word, progress.level);

  if (route.channelId === 'feishu') {
    // Feishu: send interactive card with tappable buttons
    const feishuCard = isReview
      ? card.buildFeishuReviewCard(word, reviewCount)
      : card.buildFeishuNewWordCard(word, content);
    await sendFeishuCard(route.to, feishuCard, api);
  } else {
    const message = card.build(word, content, isReview, reviewCount);
    await sendToUser(route, message, api);
  }

  progress.lastPushTime = Date.now();
  await storage.saveProgress(globalStateDir, userId, progress);
  scheduleNext(userId, route, progress.config, api);
}

function scheduleNext(
  userId: string,
  route: UserRoute,
  config: UserConfig,
  api: OpenClawPluginApi,
): void {
  const existing = timers.get(userId);
  if (existing) clearTimeout(existing);

  const timer = scheduler.scheduleNext(config, () => {
    triggerPush(userId, route, api).catch((err) => {
      api.logger.error(`[vocab-coach] push error for ${userId}: ${String(err)}`);
    });
  });
  timers.set(userId, timer);
}

// ── Migration: old userId=channelId:from → new userId=channelId:conversationId ─
async function migrateToConversationIds(
  stateDir: string,
  logger: { info(s: string): void },
): Promise<void> {
  const routes = await storage.loadRoutes(stateDir);
  const newRoutes: Record<string, UserRoute> = {};
  let migrated = 0;
  for (const [oldId, route] of Object.entries(routes)) {
    const newId = `${route.channelId}:${stripFeishuIdPrefix(route.to)}`;
    if (oldId !== newId) {
      const progress = await storage.loadProgress(stateDir, oldId);
      await storage.saveProgress(stateDir, newId, progress);
      migrated++;
    }
    newRoutes[`${route.channelId}:${stripFeishuIdPrefix(route.to)}`] = route;
  }
  if (migrated > 0) {
    await storage.saveRoutes(stateDir, newRoutes);
    logger.info(`[vocab-coach] migrated ${migrated} record(s) to conversation-based IDs`);
  }
}

// ── Resolve userId + route from a command ctx (no conversationId in ctx) ──
async function resolveUserIdFromCtx(
  ctx: unknown,
): Promise<{ userId: string; route: UserRoute | null; channelId: string; rawFrom: string }> {
  const c = ctx as Record<string, unknown>;
  const channelId = ((c.channelId ?? c.channel) as string) || '';
  const rawFrom = stripFeishuIdPrefix((c.from ?? c.senderId ?? '') as string);
  const fallback = { userId: `${channelId}:${rawFrom}`, route: null, channelId, rawFrom };
  if (!globalStateDir || !rawFrom || !channelId) return fallback;

  // Look up the stored route to find the correct conversationId
  const routes = await storage.loadRoutes(globalStateDir);
  for (const [uid, r] of Object.entries(routes)) {
    if (r.from === rawFrom && r.channelId === channelId) {
      return { userId: uid, route: r, channelId, rawFrom };
    }
  }
  return fallback;
}

// ── Plugin definition ──────────────────────────────────────────────────────
const vocabCoachPlugin: OpenClawPluginDefinition = {
  id: 'vocab-coach',
  name: 'Vocab Coach',
  description: 'Adaptive IELTS spaced-repetition vocabulary via multi-channel proactive push',

  // Config schema — no Zod dependency, use simple validate()
  configSchema: {
    validate(value: unknown) {
      if (typeof value !== 'object' || value === null) {
        return { ok: false as const, errors: ['Config must be an object'] };
      }
      return { ok: true as const };
    },
  } satisfies OpenClawPluginConfigSchema,

  register(api: OpenClawPluginApi): void {
    globalApi = api;

    // ── Service: initializes stateDir, loads vocab, migrates legacy IDs ───
    const service: OpenClawPluginService = {
      id: 'vocab-coach-scheduler',
      async start(ctx: OpenClawPluginServiceContext) {
        globalStateDir = ctx.stateDir;
        await vocab.ensureLoaded();
        await migrateToConversationIds(ctx.stateDir, ctx.logger);
        ctx.logger.info('[vocab-coach] service started, vocab loaded');
      },
      async stop(_ctx: OpenClawPluginServiceContext) {
        for (const timer of timers.values()) clearTimeout(timer);
        timers.clear();
      },
    };
    api.registerService(service);

    // ── Hook: gateway starts — re-arm timers for all known users ──────────
    api.on(
      'gateway_start',
      async (_event: PluginHookGatewayStartEvent, _ctx: PluginHookGatewayContext) => {
        if (!globalStateDir) return;
        try {
          const routes = await storage.loadRoutes(globalStateDir);
          const userIds = Object.keys(routes);
          for (const userId of userIds) {
            if (!timers.has(userId)) {
              const progress = await storage.loadProgress(globalStateDir, userId);
              scheduleNext(userId, routes[userId], progress.config, api);
            }
          }
          api.logger.info(
            `[vocab-coach] gateway started — re-armed ${userIds.length} user(s) across ${new Set(userIds.map(id => id.split(':')[0])).size} channel(s)`,
          );
        } catch (err) {
          api.logger.warn(`[vocab-coach] gateway_start route restore failed: ${String(err)}`);
        }
      },
    );

    // ── Hook: inbound message — arm scheduler + handle button taps ─────────
    api.on(
      'message_received',
      async (event: PluginHookMessageReceivedEvent, ctx: PluginHookMessageContext) => {
        cacheFeishuCfgFromCtx(ctx);
        const { channelId, accountId, conversationId } = ctx;
        const from = event.from;
        if (!from) return;

        // userId keyed by conversationId: groups share one entity, DMs are per-user
        const to = conversationId ?? from;
        const userId = `${channelId}:${stripFeishuIdPrefix(to)}`;
        const route: UserRoute = { channelId, to, from, ...(accountId ? { accountId } : {}) };

        // Persist route so gateway_start can re-arm timers after a restart
        await storage.saveRoute(globalStateDir, userId, route);

        // Ensure this user has a progress record with correct defaults
        const progress = await storage.loadProgress(globalStateDir, userId);
        if (!progress.config.timezone || progress.config.timezone === Intl.DateTimeFormat().resolvedOptions().timeZone) {
          // First time: seed config from plugin-level settings
          progress.config = storage.seedConfig(api.pluginConfig, undefined);
          await storage.saveProgress(globalStateDir, userId, progress);
        }

        // Check if the message is a feedback button tap (JSON action payload)
        const action = parseAction(event.content);
        if (action) {
          if (action.rating === 'master') {
            // Immediately retire the word — never schedule again
            if (!progress.mastered.includes(action.wordId)) {
              progress.mastered.push(action.wordId);
            }
            delete progress.weights[action.wordId];
          } else {
            const existing = progress.weights[action.wordId] ?? srs.newState();
            const newState = srs.applyRating(existing, action.rating, Date.now());
            progress.weights[action.wordId] = newState;

            if (srs.isMastered(newState) && !progress.mastered.includes(action.wordId)) {
              progress.mastered.push(action.wordId);
            }
          }

          const newLevel = Math.min(10, 1 + Math.floor(progress.mastered.length / 10));
          if (newLevel > progress.level) progress.level = newLevel;

          await storage.saveProgress(globalStateDir, userId, progress);
          await sendToUser(route, card.buildAckMessage(action.rating), api);
        }

        // (Re-)arm the scheduler for this user if not already running
        if (!timers.has(userId)) {
          scheduleNext(userId, route, progress.config, api);

          // First-ever message → push a word immediately so the user sees feedback right away
          if (progress.lastPushTime === 0) {
            void triggerPush(userId, route, api);
          }
        }
      },
    );

    // ── Command: /vocab — trigger an immediate push on demand ──────────────
    api.registerCommand({
      name: 'vocab',
      description: '立即推送一个单词 | Get a vocabulary word now',
      acceptsArgs: false,
      requireAuth: false,
      async handler(ctx) {
        cacheFeishuCfgFromCtx(ctx);
        if (!globalStateDir) return { text: '插件服务尚未就绪，请稍候重试。' };
        const { userId, route: storedRoute, channelId, rawFrom } = await resolveUserIdFromCtx(ctx);
        if (!rawFrom || !channelId) return { text: '无法确定用户 ID，请先发送一条消息。' };
        const route = storedRoute ?? {
          channelId, to: stripFeishuIdPrefix((ctx as Record<string,unknown>).to as string ?? rawFrom),
          from: rawFrom, ...(ctx.accountId ? { accountId: ctx.accountId } : {}),
        };
        try {
          await triggerPush(userId, route, api);
          return { text: '✅ 已发送今日单词！' };
        } catch (err) {
          api.logger.error(`[vocab-coach] /vocab failed: ${String(err)}`);
          return { text: `❌ 发送失败：${String(err)}` };
        }
      },
    });

    // ── Command: /vocab-set — per-user config ──────────────────────────────
    // Usage: /vocab-set target 10 | /vocab-set hours 8 22 | /vocab-set source cet4
    api.registerCommand({
      name: 'vocab-set',
      description: '配置个人学习参数 | /vocab-set target 10 | /vocab-set hours 8 22 | /vocab-set source cet4|ielts|toefl|gre',
      acceptsArgs: true,
      requireAuth: false,
      async handler(ctx) {
        cacheFeishuCfgFromCtx(ctx);
        if (!globalStateDir) return { text: '插件服务尚未就绪。' };
        const { userId, route: storedRoute } = await resolveUserIdFromCtx(ctx);
        if (!storedRoute) return { text: '请先发送一条消息初始化会话。' };

        const body = ((ctx as Record<string,unknown>).commandBody as string ?? '');
        const args = body.replace(/^\/vocab-set\s*/i, '').trim().split(/\s+/);
        const [key, ...vals] = args;

        const progress = await storage.loadProgress(globalStateDir, userId);
        const cfg = progress.config;
        const VALID_SOURCES = ['ielts', 'toefl', 'cet4', 'cet6', 'gre'];

        switch (key?.toLowerCase()) {
          case 'target': {
            const n = parseInt(vals[0] ?? '', 10);
            if (isNaN(n) || n < 1 || n > 50) return { text: '❌ target 需为 1-50 之间的整数，例如：/vocab-set target 10' };
            cfg.dailyTarget = n;
            break;
          }
          case 'hours': {
            const start = parseInt(vals[0] ?? '', 10);
            const end = parseInt(vals[1] ?? '', 10);
            if (isNaN(start) || isNaN(end) || start < 0 || end > 23 || start >= end)
              return { text: '❌ 格式：/vocab-set hours <开始小时> <结束小时>，例如：/vocab-set hours 8 22' };
            cfg.activeHours = [start, end];
            break;
          }
          case 'source': {
            const src = vals[0]?.toLowerCase() ?? '';
            if (!VALID_SOURCES.includes(src))
              return { text: `❌ 词库可选：${VALID_SOURCES.join(' / ')}，例如：/vocab-set source cet4` };
            cfg.vocabTags = [src];
            break;
          }
          case 'pause':
            cfg.activeHours = [0, 0];
            break;
          case 'resume':
            cfg.activeHours = [9, 22];
            break;
          default:
            return { text: '用法：\n• /vocab-set target 10\n• /vocab-set hours 8 22\n• /vocab-set source ielts|toefl|cet4|cet6|gre\n• /vocab-set pause\n• /vocab-set resume' };
        }

        await storage.saveProgress(globalStateDir, userId, progress);
        // Re-arm timer with new config
        scheduleNext(userId, storedRoute, cfg, api);
        return { text: `✅ 已更新！当前配置：\n每日目标 ${cfg.dailyTarget} 词 · 推送时间 ${cfg.activeHours[0]}:00-${cfg.activeHours[1]}:00 · 词库 ${cfg.vocabTags[0]}` };
      },
    });

    // ── Command: /vocab-status — show progress & config ────────────────────
    api.registerCommand({
      name: 'vocab-status',
      description: '查看学习进度和当前配置',
      acceptsArgs: false,
      requireAuth: false,
      async handler(ctx) {
        cacheFeishuCfgFromCtx(ctx);
        if (!globalStateDir) return { text: '插件服务尚未就绪。' };
        const { userId } = await resolveUserIdFromCtx(ctx);
        const progress = await storage.loadProgress(globalStateDir, userId);
        const cfg = progress.config;
        const reviewed = Object.keys(progress.weights).length;
        const lastPush = progress.lastPushTime
          ? new Date(progress.lastPushTime).toLocaleString('zh-CN', { timeZone: cfg.timezone || 'Asia/Shanghai' })
          : '从未';
        const paused = cfg.activeHours[0] === 0 && cfg.activeHours[1] === 0;
        return {
          text: [
            `📊 **学习进度**`,
            `• 已掌握：${progress.mastered.length} 词`,
            `• 已复习：${reviewed} 词`,
            `• 技能等级：Lv.${progress.level}`,
            `• 上次推送：${lastPush}`,
            ``,
            `⚙️ **当前配置**`,
            `• 每日目标：${cfg.dailyTarget} 词`,
            `• 推送时段：${paused ? '已暂停' : `${cfg.activeHours[0]}:00 - ${cfg.activeHours[1]}:00`}`,
            `• 词库：${cfg.vocabTags[0] ?? 'ielts'}`,
            ``,
            `用 /vocab-set 修改配置`,
          ].join('\n'),
        };
      },
    });
  },
};

export default vocabCoachPlugin;
