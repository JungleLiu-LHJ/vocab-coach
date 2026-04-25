import * as card from './card.js';
import { VocabDatabase } from './db/database.js';
import * as generator from './generator.js';
import * as scheduler from './scheduler.js';
import { resolveLearningScope, seedScopeConfig } from './scope.js';
import * as srs from './srs.js';
import * as vocab from './vocab.js';
import { PushLogRepository } from './repository/push-log.repository.js';
import { UserRepository } from './repository/user.repository.js';
import { WordProgressRepository } from './repository/word-progress.repository.js';
import type {
  ActionPayload,
  FeedbackRating,
  OpenClawContext,
  OpenClawHookPayload,
  OpenClawPluginAPI,
  ScopeConfig,
  ScopeProgress,
  ScopeProgressSnapshot,
} from './types.js';

const timers = new Map<string, ReturnType<typeof setTimeout>>();

function resolveStateDir(source: { stateDir?: string }): string {
  return source.stateDir ?? process.cwd();
}

function getRepositories(source: { stateDir?: string }) {
  const db = VocabDatabase.getInstance(resolveStateDir(source));
  return {
    db,
    userRepo: new UserRepository(db),
    wordRepo: new WordProgressRepository(db),
    pushLogRepo: new PushLogRepository(db),
  };
}

function parseAction(raw: string): ActionPayload | null {
  try {
    const parsed = JSON.parse(raw) as { scopeId?: unknown; wordId?: unknown; rating?: unknown };
    const validRatings: FeedbackRating[] = ['know', 'fuzzy', 'forgot', 'master'];
    const wordId =
      typeof parsed.wordId === 'number' ? parsed.wordId : Number.parseInt(String(parsed.wordId ?? ''), 10);

    if (
      typeof parsed.scopeId === 'string' &&
      Number.isFinite(wordId) &&
      typeof parsed.rating === 'string' &&
      validRatings.includes(parsed.rating as FeedbackRating)
    ) {
      return { scopeId: parsed.scopeId, wordId, rating: parsed.rating as FeedbackRating };
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
  const existing = timers.get(scopeId);
  if (existing) clearTimeout(existing);
  timers.delete(scopeId);
}

function msUntilNextWindowStart(config: ScopeConfig): number {
  const tz = config.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const now = new Date();
  const currentHour = Number.parseInt(
    now.toLocaleString('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: tz,
    }),
    10,
  );
  const minutesIntoHour =
    now.getMinutes() * 60_000 + now.getSeconds() * 1000 + now.getMilliseconds();
  const hoursUntilStart = 24 - currentHour + config.activeHoursStart;
  return hoursUntilStart * 3_600_000 - minutesIntoHour;
}

function scheduleScope(api: OpenClawPluginAPI, scope: ScopeProgress): void {
  clearScopeTimer(scope.scopeId);
  if (scope.config.paused) return;

  const { pushLogRepo } = getRepositories(api);
  const todayCount = pushLogRepo.getTodayCount(scope.scopeId);
  const delay =
    todayCount >= scope.config.dailyTarget
      ? msUntilNextWindowStart(scope.config)
      : scheduler.isInActiveWindow(scope.config)
        ? scheduler.nextWaitMs(scope.config)
        : scheduler.msUntilWindowStart(scope.config);

  const timer = setTimeout(() => {
    triggerPushForScope(api, scope.scopeId).catch(() => {
      clearScopeTimer(scope.scopeId);
    });
  }, delay);

  timers.set(scope.scopeId, timer);
}

async function ensureScope(
  api: OpenClawPluginAPI,
  payload: OpenClawHookPayload,
): Promise<ScopeProgress> {
  const { userRepo } = getRepositories(api);
  const scope = resolveLearningScope(payload);
  const existing = userRepo.getByScopeId(scope.scopeId);
  if (existing) return userRepo.upsertScope(scope, existing.config);
  return userRepo.upsertScope(scope, seedScopeConfig(api.config, payload.timezone));
}

function parseConfigCommand(text: string, current: ScopeConfig): ScopeConfig | null {
  const parts = text.trim().split(/\s+/);
  if (parts[0] !== '/vocab-set' || parts.length < 2) return null;

  const nextConfig = { ...current };
  switch (parts[1]) {
    case 'target': {
      const value = Number.parseInt(parts[2] ?? '', 10);
      if (!Number.isFinite(value) || value < 1 || value > 50) return null;
      nextConfig.dailyTarget = value;
      return nextConfig;
    }
    case 'hours': {
      const start = Number.parseInt(parts[2] ?? '', 10);
      const end = Number.parseInt(parts[3] ?? '', 10);
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > 24 || start >= end) {
        return null;
      }
      nextConfig.activeHoursStart = start;
      nextConfig.activeHoursEnd = end;
      return nextConfig;
    }
    case 'source': {
      const source = parts[2] ?? '';
      if (!['ielts', 'toefl', 'cet4', 'cet6', 'gre'].includes(source)) return null;
      nextConfig.vocabSource = source;
      return nextConfig;
    }
    case 'pause':
      nextConfig.paused = true;
      return nextConfig;
    case 'resume':
      nextConfig.paused = false;
      return nextConfig;
    default:
      return null;
  }
}

function buildStatusMessage(scope: ScopeProgress, stats: {
  totalWords: number;
  masteredWords: number;
  dueWords: number;
  newWords: number;
}, todayCount: number): string {
  return [
    `Vocabulary Status (${scope.scopeType})`,
    `source: ${scope.config.vocabSource}`,
    `daily target: ${scope.config.dailyTarget}`,
    `active hours: ${scope.config.activeHoursStart}-${scope.config.activeHoursEnd}`,
    `timezone: ${scope.config.timezone}`,
    `paused: ${scope.config.paused ? 'yes' : 'no'}`,
    `level: ${scope.level}`,
    `today pushes: ${todayCount}`,
    `mastered: ${stats.masteredWords}`,
    `due: ${stats.dueWords}`,
    `tracked: ${stats.totalWords}`,
    `new seen-once-less: ${stats.newWords}`,
  ].join('\n');
}

async function triggerPushForScope(api: OpenClawPluginAPI, scopeId: string): Promise<void> {
  const { userRepo, wordRepo, pushLogRepo } = getRepositories(api);
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
    scheduleScope(api, scope);
    return;
  }

  const ctx: OpenClawContext = {
    storage: api.storage,
    gateway: api.gateway,
    agent: api.agent,
    user: { id: scope.targetId, timezone: scope.config.timezone },
    config: api.config,
    stateDir: api.stateDir,
  };

  const words = await vocab.ensureCached(ctx);
  const snapshot = buildSnapshot(scope, wordRepo);
  const word = vocab.selectNextWord(snapshot, words);
  const lang = scope.config.nativeLang;

  if (!word) {
    await api.gateway.send(card.allDoneMessage(lang), scope.targetId);
    scheduleScope(api, scope);
    return;
  }

  const existing = snapshot.weights[word.id];
  const isReview = Boolean(existing);
  const reviewCount = existing?.reviews ?? 0;
  const content = await generator.generateContent(api.agent, word, scope.level, lang);
  const message = card.build(word, content, scope.scopeId, isReview, reviewCount, lang);

  await api.gateway.send(message, scope.targetId);
  pushLogRepo.logPush(scope.scopeId, word.id, isReview ? 'review' : 'new');
  userRepo.updateLastPushTime(scope.scopeId, Date.now());

  const refreshed = userRepo.getByScopeId(scope.scopeId);
  if (refreshed) scheduleScope(api, refreshed);
}

async function handleAction(api: OpenClawPluginAPI, payload: ActionPayload): Promise<void> {
  const { userRepo, wordRepo, pushLogRepo } = getRepositories(api);
  const scope = userRepo.getByScopeId(payload.scopeId);
  if (!scope) return;

  const current = wordRepo.getByWord(scope.scopeId, payload.wordId);
  const nextState = srs.applyRating(
    current
      ? {
          s: current.stability,
          d: current.difficulty,
          next: current.next_review,
          reviews: current.reviews,
          lapses: current.lapses,
        }
      : srs.newState(),
    payload.rating,
    Date.now(),
  );

  const mastered = srs.isMastered(nextState) || payload.rating === 'master';
  wordRepo.saveState(scope.scopeId, payload.wordId, nextState, mastered);
  pushLogRepo.logFeedback(scope.scopeId, payload.wordId, payload.rating);

  const masteredCount = wordRepo.getMasteredWordIds(scope.scopeId).length;
  const nextLevel = Math.min(10, 1 + Math.floor(masteredCount / 10));
  if (nextLevel > scope.level) userRepo.updateLevel(scope.scopeId, nextLevel);

  await api.gateway.send(card.buildAckMessage(payload.rating, scope.config.nativeLang), scope.targetId);

  const refreshed = userRepo.getByScopeId(scope.scopeId);
  if (refreshed) scheduleScope(api, refreshed);
}

async function handleCommand(api: OpenClawPluginAPI, payload: OpenClawHookPayload): Promise<boolean> {
  const text = payload.text?.trim();
  if (!text) return false;

  const { userRepo, wordRepo, pushLogRepo } = getRepositories(api);
  const scope = await ensureScope(api, payload);

  if (text === '/vocab') {
    await triggerPushForScope(api, scope.scopeId);
    return true;
  }

  if (text === '/vocab-status') {
    const stats = wordRepo.getStats(scope.scopeId, Date.now());
    const todayCount = pushLogRepo.getTodayCount(scope.scopeId);
    await api.gateway.send(buildStatusMessage(scope, stats, todayCount), scope.targetId);
    return true;
  }

  if (!text.startsWith('/vocab-set')) return false;

  const nextConfig = parseConfigCommand(text, scope.config);
  if (!nextConfig) {
    await api.gateway.send('Invalid vocab config command.', scope.targetId);
    return true;
  }

  userRepo.updateConfig(scope.scopeId, nextConfig);
  const refreshed = userRepo.getByScopeId(scope.scopeId);
  if (refreshed) scheduleScope(api, refreshed);
  await api.gateway.send('Vocabulary config updated.', scope.targetId);
  return true;
}

export function register(api: OpenClawPluginAPI): void {
  getRepositories(api);

  api.on('gateway:startup', async () => {
    const { userRepo } = getRepositories(api);
    for (const scope of userRepo.getActiveScopes()) {
      scheduleScope(api, scope);
    }
  });

  api.on('message:received', async (payload: OpenClawHookPayload) => {
    if (await handleCommand(api, payload)) return;
    if (!payload.action) return;

    const action = parseAction(payload.action);
    if (!action) return;
    await handleAction(api, action);
  });
}

export async function onLoad(ctx: OpenClawContext): Promise<void> {
  const api: OpenClawPluginAPI = {
    storage: ctx.storage,
    gateway: ctx.gateway,
    agent: ctx.agent,
    config: ctx.config,
    stateDir: ctx.stateDir,
    on: () => undefined,
  };
  const { userRepo } = getRepositories(api);
  for (const scope of userRepo.getActiveScopes()) {
    scheduleScope(api, scope);
  }
}

export async function onAction(ctx: OpenClawContext, payload: ActionPayload): Promise<void> {
  const api: OpenClawPluginAPI = {
    storage: ctx.storage,
    gateway: ctx.gateway,
    agent: ctx.agent,
    config: ctx.config,
    stateDir: ctx.stateDir,
    on: () => undefined,
  };
  await handleAction(api, payload);
}

export async function onGatewayStartup(
  _payload: OpenClawHookPayload,
  api: OpenClawPluginAPI,
): Promise<void> {
  const { userRepo } = getRepositories(api);
  for (const scope of userRepo.getActiveScopes()) {
    scheduleScope(api, scope);
  }
}

export async function onMessageReceived(
  payload: OpenClawHookPayload,
  api: OpenClawPluginAPI,
): Promise<void> {
  if (await handleCommand(api, payload)) return;
  if (!payload.action) return;
  const action = parseAction(payload.action);
  if (!action) return;
  await handleAction(api, action);
}
