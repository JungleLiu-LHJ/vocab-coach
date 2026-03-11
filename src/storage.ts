import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { UserProgress, UserConfig, UserRoute } from './types.js';

const DEFAULT_CONFIG: UserConfig = {
  activeHours: [9, 22],
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  dailyTarget: 5,
  vocabTags: ['ielts'],
  nativeLang: 'zh',
};

export function defaultProgress(): UserProgress {
  return {
    level: 7,  // cefrCeiling(7)=B2 — 与 IELTS 数据集匹配（所有词均为 B2–C1）
    mastered: [],
    weights: {},
    lastPushTime: 0,
    config: { ...DEFAULT_CONFIG },
  };
}

// ── userId 格式："${channelId}:${from}" ──────────────────

function progressPath(stateDir: string, userId: string): string {
  const safe = userId.replace(/[^a-zA-Z0-9_\-@.:]/g, '_');
  return join(stateDir, 'vocab-progress', `${safe}.json`);
}

function routesPath(stateDir: string): string {
  return join(stateDir, 'vocab-progress', '_routes.json');
}

async function ensureDir(stateDir: string): Promise<void> {
  await mkdir(join(stateDir, 'vocab-progress'), { recursive: true });
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

// ── 学习进度 ──────────────────────────────────────────────

export async function loadProgress(stateDir: string, userId: string): Promise<UserProgress> {
  return readJson(progressPath(stateDir, userId), defaultProgress());
}

export async function saveProgress(
  stateDir: string,
  userId: string,
  progress: UserProgress,
): Promise<void> {
  await ensureDir(stateDir);
  await writeFile(progressPath(stateDir, userId), JSON.stringify(progress), 'utf8');
}

// ── 路由（每个 userId 的 channelId + to）────────────────

export async function loadRoutes(stateDir: string): Promise<Record<string, UserRoute>> {
  return readJson(routesPath(stateDir), {});
}

export async function saveRoute(stateDir: string, userId: string, route: UserRoute): Promise<void> {
  await ensureDir(stateDir);
  const routes = await loadRoutes(stateDir);
  routes[userId] = route;
  await writeFile(routesPath(stateDir), JSON.stringify(routes), 'utf8');
}

export async function saveRoutes(stateDir: string, routes: Record<string, UserRoute>): Promise<void> {
  await ensureDir(stateDir);
  await writeFile(routesPath(stateDir), JSON.stringify(routes), 'utf8');
}

// ── 配置初始化 ────────────────────────────────────────────

export function seedConfig(
  pluginConfig: Record<string, unknown> | undefined,
  timezone?: string,
): UserConfig {
  return {
    activeHours: [
      Number(pluginConfig?.activeHoursStart ?? 9),
      Number(pluginConfig?.activeHoursEnd ?? 22),
    ],
    timezone: timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    dailyTarget: Number(pluginConfig?.dailyTarget ?? 5),
    vocabTags: [String(pluginConfig?.vocabSource ?? 'ielts')],
    nativeLang: String(pluginConfig?.nativeLang ?? 'zh'),
  };
}
