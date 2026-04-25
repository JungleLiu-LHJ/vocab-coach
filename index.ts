import type {
  OpenClawPluginApi,
  OpenClawPluginCommandDefinition,
  OpenClawPluginConfigSchema,
  OpenClawPluginDefinition,
  OpenClawPluginService,
  OpenClawPluginServiceContext,
  PluginCommandContext,
  PluginHookGatewayContext,
  PluginHookGatewayStartEvent,
  PluginHookMessageContext,
  PluginHookMessageReceivedEvent,
} from 'openclaw/plugin-sdk';

import * as card from './src/card.js';
import { VocabDatabase } from './src/db/database.js';
import * as generator from './src/generator.js';
import { PushLogRepository } from './src/repository/push-log.repository.js';
import { UserRepository } from './src/repository/user.repository.js';
import { WordProgressRepository } from './src/repository/word-progress.repository.js';
import * as scheduler from './src/scheduler.js';
import { resolveLearningScope, seedScopeConfig } from './src/scope.js';
import * as srs from './src/srs.js';
import * as vocab from './src/vocab.js';
import type {
  ActionPayload,
  FeedbackRating,
  LearningScope,
  OpenClawContext,
  ScopeConfig,
  ScopeProgress,
  ScopeProgressSnapshot,
  VocabWord,
} from './src/types.js';

let globalStateDir = '';
const timers = new Map<string, ReturnType<typeof setTimeout>>();

interface FeishuConfig {
  appId: string;
  appSecret: string;
}

let feishuTokenCache: { token: string; expiresAt: number } | null = null;
let globalFeishuCfg: FeishuConfig | null = null;

function getRepositories() {
  const db = VocabDatabase.getInstance(globalStateDir || process.cwd());
  return {
    db,
    userRepo: new UserRepository(db),
    wordRepo: new WordProgressRepository(db),
    pushLogRepo: new PushLogRepository(db),
  };
}

function stripChannelPrefix(id: string): string {
  const colon = id.indexOf(':');
  if (colon !== -1 && !id.startsWith('oc_') && !id.startsWith('ou_')) {
    return id.slice(colon + 1);
  }
  return id;
}

function resolveFeishuConfig(api: OpenClawPluginApi): FeishuConfig {
  const pluginConfig = api.pluginConfig as Record<string, unknown> | undefined;
  if (pluginConfig?.feishuAppId && pluginConfig?.feishuAppSecret) {
    return {
      appId: String(pluginConfig.feishuAppId),
      appSecret: String(pluginConfig.feishuAppSecret),
    };
  }

  const channels = api.config.channels as Record<string, unknown> | undefined;
  const feishu = channels?.feishu as { appId?: string; appSecret?: string } | undefined;
  if (feishu?.appId && feishu?.appSecret) {
    return { appId: feishu.appId, appSecret: feishu.appSecret };
  }

  if (globalFeishuCfg) return globalFeishuCfg;
  throw new Error('[vocab-coach] feishu appId/appSecret not configured');
}

function cacheFeishuConfig(ctx: { config?: Record<string, unknown> | undefined }): void {
  if (globalFeishuCfg) return;
  const channels = ctx.config?.channels as Record<string, unknown> | undefined;
  const feishu = channels?.feishu as { appId?: string; appSecret?: string } | undefined;
  if (feishu?.appId && feishu?.appSecret) {
    globalFeishuCfg = { appId: feishu.appId, appSecret: feishu.appSecret };
  }
}

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
  feishuTokenCache = {
    token: data.tenant_access_token,
    expiresAt: Date.now() + (data.expire - 60) * 1000,
  };
  return feishuTokenCache.token;
}

function resolveFeishuReceiveIdType(targetId: string): string {
  if (targetId.startsWith('oc_')) return 'chat_id';
  if (targetId.startsWith('ou_')) return 'open_id';
  if (targetId.includes('@')) return 'email';
  return 'open_id';
}

async function sendFeishuText(targetId: string, text: string, api: OpenClawPluginApi): Promise<void> {
  const receiveId = stripChannelPrefix(targetId);
  const cfg = resolveFeishuConfig(api);
  const token = await getFeishuToken(cfg);
  const res = await fetch(
    `https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=${resolveFeishuReceiveIdType(receiveId)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        receive_id: receiveId,
        msg_type: 'text',
        content: JSON.stringify({ text }),
      }),
    },
  );

  const data = await res.json() as { code: number; msg: string };
  if (data.code !== 0) {
    throw new Error(`Feishu send failed: ${data.code} ${data.msg}`);
  }
}

async function sendFeishuCard(targetId: string, payload: Record<string, unknown>, api: OpenClawPluginApi): Promise<void> {
  const receiveId = stripChannelPrefix(targetId);
  const cfg = resolveFeishuConfig(api);
  const token = await getFeishuToken(cfg);
  const res = await fetch(
    `https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=${resolveFeishuReceiveIdType(receiveId)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        receive_id: receiveId,
        msg_type: 'interactive',
        content: JSON.stringify(payload),
      }),
    },
  );

  const data = await res.json() as { code: number; msg: string };
  if (data.code !== 0) {
    throw new Error(`Feishu send failed: ${data.code} ${data.msg}`);
  }
}

async function sendToScope(scope: ScopeProgress, content: string | Record<string, unknown>, api: OpenClawPluginApi): Promise<void> {
  const targetId = scope.targetId;
  const accountId = scope.accountId;

  try {
    switch (scope.channelId) {
      case 'telegram':
        await api.runtime.channel.telegram.sendMessageTelegram(targetId, String(content), { accountId });
        break;
      case 'whatsapp':
        await api.runtime.channel.whatsapp.sendMessageWhatsApp(targetId, String(content), { verbose: false, accountId });
        break;
      case 'discord':
        await api.runtime.channel.discord.sendMessageDiscord(targetId, String(content), { accountId });
        break;
      case 'slack':
        await api.runtime.channel.slack.sendMessageSlack(targetId, String(content), { accountId });
        break;
      case 'signal':
        await api.runtime.channel.signal.sendMessageSignal(targetId, String(content), { accountId });
        break;
      case 'imessage':
        await api.runtime.channel.imessage.sendMessageIMessage(targetId, String(content), { accountId });
        break;
      case 'line':
        await api.runtime.channel.line.pushMessageLine(targetId, String(content), { accountId });
        break;
      case 'feishu':
        if (typeof content === 'string') {
          await sendFeishuText(targetId, content, api);
        } else {
          await sendFeishuCard(targetId, content, api);
        }
        break;
      default:
        api.logger.warn(`[vocab-coach] unsupported channel "${scope.channelId}"`);
    }
  } catch (error) {
    api.logger.error(`[vocab-coach] send failed on ${scope.channelId} to ${targetId}: ${String(error)}`);
  }
}

function parseShortcutRating(raw: string): FeedbackRating | null {
  const text = raw.trim().toLowerCase();
  if (!text) return null;

  const shortcuts = new Map<string, FeedbackRating>([
    ['1', 'know'],
    ['认识', 'know'],
    ['知道', 'know'],
    ['记得', 'know'],
    ['know', 'know'],
    ['2', 'fuzzy'],
    ['模糊', 'fuzzy'],
    ['不确定', 'fuzzy'],
    ['有点印象', 'fuzzy'],
    ['fuzzy', 'fuzzy'],
    ['3', 'forgot'],
    ['不知道', 'forgot'],
    ['忘了', 'forgot'],
    ['不认识', 'forgot'],
    ['forgot', 'forgot'],
    ['4', 'master'],
    ['掌握', 'master'],
    ['完全认识', 'master'],
    ['已掌握', 'master'],
    ['master', 'master'],
  ]);

  return shortcuts.get(text) ?? null;
}

function parseAction(raw: string): ActionPayload | null {
  try {
    const parsed = JSON.parse(raw.trim()) as { scopeId?: unknown; wordId?: unknown; rating?: unknown };
    const wordId =
      typeof parsed.wordId === 'number' ? parsed.wordId : Number.parseInt(String(parsed.wordId ?? ''), 10);
    const validRatings: FeedbackRating[] = ['know', 'fuzzy', 'forgot', 'master'];

    if (
      typeof parsed.scopeId === 'string' &&
      Number.isFinite(wordId) &&
      typeof parsed.rating === 'string' &&
      validRatings.includes(parsed.rating as FeedbackRating)
    ) {
      return {
        scopeId: parsed.scopeId,
        wordId,
        rating: parsed.rating as FeedbackRating,
      };
    }
  } catch {
    return null;
  }

  return null;
}

function buildSnapshot(scope: ScopeProgress, wordRepo: WordProgressRepository): ScopeProgressSnapshot {
  return {
    scopeId: scope.scopeId,
    level: scope.level,
    mastered: wordRepo.getMasteredWordIds(scope.scopeId),
    weights: wordRepo.getWeights(scope.scopeId),
    lastPushTime: scope.lastPushTime,
    config: scope.config,
  };
}

function clearScopeTimer(scopeId: string): void {
  const timer = timers.get(scopeId);
  if (timer) clearTimeout(timer);
  timers.delete(scopeId);
}

function msUntilNextDay(config: ScopeConfig): number {
  const tz = config.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const now = new Date();
  const currentHour = Number.parseInt(
    now.toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: tz }),
    10,
  );
  const minutesIntoHour = now.getMinutes() * 60_000 + now.getSeconds() * 1000 + now.getMilliseconds();
  return (24 - currentHour + config.activeHoursStart) * 3_600_000 - minutesIntoHour;
}

async function getWordList(api: OpenClawPluginApi, scope: ScopeProgress): Promise<VocabWord[]> {
  const ctx: OpenClawContext = {
    storage: {
      async get() {
        return null;
      },
      async set() {
        return undefined;
      },
    },
    gateway: {
      async send() {
        return undefined;
      },
    },
    agent: {},
    user: { id: scope.targetId, timezone: scope.config.timezone },
    config: {
      activeHoursStart: scope.config.activeHoursStart,
      activeHoursEnd: scope.config.activeHoursEnd,
      dailyTarget: scope.config.dailyTarget,
      vocabSource: scope.config.vocabSource,
      nativeLang: scope.config.nativeLang,
    },
    stateDir: globalStateDir,
  };

  return vocab.ensureCached(ctx);
}

async function triggerPush(scopeId: string, api: OpenClawPluginApi): Promise<void> {
  const { userRepo, wordRepo, pushLogRepo } = getRepositories();
  const scope = userRepo.getByScopeId(scopeId);
  if (!scope) {
    clearScopeTimer(scopeId);
    return;
  }

  if (scope.config.paused) {
    clearScopeTimer(scopeId);
    return;
  }

  const todayCount = pushLogRepo.getTodayCount(scopeId);
  if (todayCount >= scope.config.dailyTarget) {
    scheduleScope(scope, api);
    return;
  }

  const words = await getWordList(api, scope);
  const snapshot = buildSnapshot(scope, wordRepo);
  const word = vocab.selectNextWord(snapshot, words);
  if (!word) {
    await sendToScope(scope, card.allDoneMessage(scope.config.nativeLang), api);
    scheduleScope(scope, api);
    return;
  }

  const existing = snapshot.weights[word.id];
  const isReview = Boolean(existing);
  const reviewCount = existing?.reviews ?? 0;
  const content = await generator.generateContent(
    api.runtime.subagent as unknown as Parameters<typeof generator.generateContent>[0],
    word,
    scope.level,
    scope.config.nativeLang,
  );

  if (scope.channelId === 'feishu') {
    const payload = isReview
      ? card.buildFeishuReviewCard(word, reviewCount, scope.scopeId, scope.config.nativeLang)
      : card.buildFeishuNewWordCard(word, content, scope.scopeId, scope.config.nativeLang);
    await sendToScope(scope, payload, api);
  } else {
    const message = card.build(word, content, scope.scopeId, isReview, reviewCount, scope.config.nativeLang);
    await sendToScope(scope, message, api);
  }

  pushLogRepo.logPush(scope.scopeId, word.id, isReview ? 'review' : 'new');
  userRepo.updateLastPushTime(scope.scopeId, Date.now());
  const refreshed = userRepo.getByScopeId(scope.scopeId);
  if (refreshed) scheduleScope(refreshed, api);
}

function scheduleScope(scope: ScopeProgress, api: OpenClawPluginApi): void {
  clearScopeTimer(scope.scopeId);
  if (scope.config.paused) return;

  const { pushLogRepo } = getRepositories();
  const todayCount = pushLogRepo.getTodayCount(scope.scopeId);
  const delay =
    todayCount >= scope.config.dailyTarget
      ? msUntilNextDay(scope.config)
      : scheduler.isInActiveWindow(scope.config)
        ? scheduler.nextWaitMs(scope.config)
        : scheduler.msUntilWindowStart(scope.config);

  const timer = setTimeout(() => {
    triggerPush(scope.scopeId, api).catch((error) => {
      api.logger.error(`[vocab-coach] scheduled push failed for ${scope.scopeId}: ${String(error)}`);
      clearScopeTimer(scope.scopeId);
    });
  }, delay);

  timers.set(scope.scopeId, timer);
}

function inferScopeFromCommand(ctx: PluginCommandContext, api: OpenClawPluginApi): LearningScope {
  const channelId = ctx.channelId ?? ctx.channel;
  const fromId = stripChannelPrefix(ctx.from ?? ctx.senderId ?? '');
  const targetId = stripChannelPrefix(ctx.to ?? fromId);
  const { userRepo } = getRepositories();

  const directScopeId = `direct:${channelId}:${fromId}`;
  const channelScopeId = `channel:${channelId}:${targetId}`;

  if (ctx.to && targetId !== fromId) {
    const existingChannel = userRepo.getByScopeId(channelScopeId);
    if (existingChannel) {
      return {
        scopeId: existingChannel.scopeId,
        scopeType: existingChannel.scopeType,
        channelId: existingChannel.channelId,
        conversationId: existingChannel.conversationId,
        fromId: existingChannel.fromId,
        targetId: existingChannel.targetId,
        accountId: existingChannel.accountId,
      };
    }
  }

  const existingDirect = userRepo.getByScopeId(directScopeId);
  if (existingDirect) {
    return {
      scopeId: existingDirect.scopeId,
      scopeType: existingDirect.scopeType,
      channelId: existingDirect.channelId,
      conversationId: existingDirect.conversationId,
      fromId: existingDirect.fromId,
      targetId: existingDirect.targetId,
      accountId: existingDirect.accountId,
    };
  }

  const isDirect = !ctx.to || targetId === fromId;
  return {
    scopeId: isDirect ? directScopeId : channelScopeId,
    scopeType: isDirect ? 'direct' : 'channel',
    channelId,
    conversationId: isDirect ? undefined : targetId,
    fromId,
    targetId: isDirect ? fromId : targetId,
    accountId: ctx.accountId,
  };
}

function ensureScope(scope: LearningScope, api: OpenClawPluginApi, timezone?: string): ScopeProgress {
  const { userRepo } = getRepositories();
  const existing = userRepo.getByScopeId(scope.scopeId);
  if (existing) return userRepo.upsertScope(scope, existing.config);
  return userRepo.upsertScope(scope, seedScopeConfig(api.pluginConfig, timezone));
}

async function handleFeedback(scopeId: string, wordId: number, rating: FeedbackRating, api: OpenClawPluginApi): Promise<void> {
  const { userRepo, wordRepo, pushLogRepo } = getRepositories();
  const scope = userRepo.getByScopeId(scopeId);
  if (!scope) return;

  const current = wordRepo.getByWord(scopeId, wordId);
  const state = srs.applyRating(
    current
      ? {
          s: current.stability,
          d: current.difficulty,
          next: current.next_review,
          reviews: current.reviews,
          lapses: current.lapses,
        }
      : srs.newState(),
    rating,
    Date.now(),
  );
  const mastered = srs.isMastered(state) || rating === 'master';
  wordRepo.saveState(scopeId, wordId, state, mastered);
  pushLogRepo.logFeedback(scopeId, wordId, rating);

  const masteredCount = wordRepo.getMasteredWordIds(scopeId).length;
  const nextLevel = Math.min(10, 1 + Math.floor(masteredCount / 10));
  if (nextLevel > scope.level) userRepo.updateLevel(scopeId, nextLevel);

  await sendToScope(scope, card.buildAckMessage(rating, scope.config.nativeLang), api);
  const refreshed = userRepo.getByScopeId(scopeId);
  if (refreshed) scheduleScope(refreshed, api);
}

function buildStatusMessage(scope: ScopeProgress, todayCount: number): string {
  const { wordRepo } = getRepositories();
  const stats = wordRepo.getStats(scope.scopeId, Date.now());
  return [
    `📊 Vocabulary Status (${scope.scopeType})`,
    `• source: ${scope.config.vocabSource}`,
    `• daily target: ${scope.config.dailyTarget}`,
    `• active hours: ${scope.config.activeHoursStart}-${scope.config.activeHoursEnd}`,
    `• timezone: ${scope.config.timezone}`,
    `• paused: ${scope.config.paused ? 'yes' : 'no'}`,
    `• level: ${scope.level}`,
    `• today pushes: ${todayCount}`,
    `• mastered: ${stats.masteredWords}`,
    `• due: ${stats.dueWords}`,
    `• tracked: ${stats.totalWords}`,
  ].join('\n');
}

function parseConfigCommand(args: string, current: ScopeConfig): ScopeConfig | null {
  const parts = args.trim().split(/\s+/).filter(Boolean);
  const [key, ...vals] = parts;
  const next = { ...current };

  switch (key?.toLowerCase()) {
    case 'target': {
      const value = Number.parseInt(vals[0] ?? '', 10);
      if (!Number.isFinite(value) || value < 1 || value > 50) return null;
      next.dailyTarget = value;
      return next;
    }
    case 'hours': {
      const start = Number.parseInt(vals[0] ?? '', 10);
      const end = Number.parseInt(vals[1] ?? '', 10);
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > 24 || start >= end) {
        return null;
      }
      next.activeHoursStart = start;
      next.activeHoursEnd = end;
      return next;
    }
    case 'source': {
      const source = vals[0] ?? '';
      if (!['ielts', 'toefl', 'cet4', 'cet6', 'gre'].includes(source)) return null;
      next.vocabSource = source;
      return next;
    }
    case 'pause':
      next.paused = true;
      return next;
    case 'resume':
      next.paused = false;
      return next;
    default:
      return null;
  }
}

const vocabCoachPlugin: OpenClawPluginDefinition = {
  id: 'vocab-coach',
  name: 'Vocab Coach',
  version: '0.3.0',
  description: 'Adaptive scoped SQLite vocabulary coach for OpenClaw',
  configSchema: {
    validate(value: unknown) {
      if (typeof value !== 'object' || value === null) {
        return { ok: false as const, errors: ['Config must be an object'] };
      }
      return { ok: true as const };
    },
  } satisfies OpenClawPluginConfigSchema,
  register(api: OpenClawPluginApi): void {
    const service: OpenClawPluginService = {
      id: 'vocab-coach-sqlite',
      async start(ctx: OpenClawPluginServiceContext) {
        globalStateDir = ctx.stateDir;
        cacheFeishuConfig({ config: api.config as Record<string, unknown> });
        VocabDatabase.getInstance(globalStateDir);
        ctx.logger.info('[vocab-coach] sqlite service started');
      },
      async stop() {
        for (const timer of timers.values()) clearTimeout(timer);
        timers.clear();
      },
    };
    api.registerService(service);

    api.on('gateway_start', async (_event: PluginHookGatewayStartEvent, _ctx: PluginHookGatewayContext) => {
      const { userRepo } = getRepositories();
      for (const scope of userRepo.getActiveScopes()) {
        scheduleScope(scope, api);
      }
    });

    api.on('message_received', async (event: PluginHookMessageReceivedEvent, ctx: PluginHookMessageContext) => {
      const fromId = stripChannelPrefix(event.from);
      if (!fromId) return;

      const payload = {
        type: 'message:received' as const,
        senderId: fromId,
        channelId: ctx.channelId,
        conversationId: ctx.conversationId ? stripChannelPrefix(ctx.conversationId) : undefined,
        accountId: ctx.accountId,
        isDirect: !ctx.conversationId || stripChannelPrefix(ctx.conversationId) === fromId,
        text: event.content,
        action: event.content,
        timestamp: event.timestamp ?? Date.now(),
      };

      const action = parseAction(event.content);
      if (action) {
        await handleFeedback(action.scopeId, action.wordId, action.rating, api);
        return;
      }

      const scope = ensureScope(resolveLearningScope(payload), api);
      const shortcutRating = parseShortcutRating(event.content);
      if (shortcutRating) {
        const { pushLogRepo } = getRepositories();
        const latest = pushLogRepo.getLatestPushedWord(scope.scopeId);
        if (latest) {
          await handleFeedback(scope.scopeId, latest.wordId, shortcutRating, api);
          return;
        }
      }

      if (!timers.has(scope.scopeId)) {
        scheduleScope(scope, api);
      }
    });

    const vocabCommand: OpenClawPluginCommandDefinition = {
      name: 'vocab',
      description: '立即推送一个单词',
      acceptsArgs: false,
      requireAuth: false,
      async handler(ctx: PluginCommandContext) {
        cacheFeishuConfig({ config: ctx.config as Record<string, unknown> });
        const scope = ensureScope(inferScopeFromCommand(ctx, api), api);
        await triggerPush(scope.scopeId, api);
        return { text: '✅ 已发送单词卡片。' };
      },
    };
    api.registerCommand(vocabCommand);

    api.registerCommand({
      name: 'vocab-set',
      description: '配置当前学习空间',
      acceptsArgs: true,
      requireAuth: false,
      async handler(ctx: PluginCommandContext) {
        const scopeRef = inferScopeFromCommand(ctx, api);
        const scope = ensureScope(scopeRef, api);
        const args = ctx.args ?? ctx.commandBody.replace(/^\/vocab-set\s*/i, '');
        const nextConfig = parseConfigCommand(args, scope.config);
        if (!nextConfig) {
          return {
            text: '用法：/vocab-set target 10 | /vocab-set hours 8 22 | /vocab-set source ielts|toefl|cet4|cet6|gre | /vocab-set pause | /vocab-set resume',
          };
        }

        const { userRepo } = getRepositories();
        userRepo.updateConfig(scope.scopeId, nextConfig);
        const refreshed = userRepo.getByScopeId(scope.scopeId);
        if (refreshed) scheduleScope(refreshed, api);
        return { text: '✅ 当前学习空间配置已更新。' };
      },
    });

    api.registerCommand({
      name: 'vocab-status',
      description: '查看当前学习空间状态',
      acceptsArgs: false,
      requireAuth: false,
      async handler(ctx: PluginCommandContext) {
        const scopeRef = inferScopeFromCommand(ctx, api);
        const scope = ensureScope(scopeRef, api);
        const { pushLogRepo } = getRepositories();
        return { text: buildStatusMessage(scope, pushLogRepo.getTodayCount(scope.scopeId)) };
      },
    });
  },
};

export default vocabCoachPlugin;
