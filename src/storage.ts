import { mkdir, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { FSRSState, ScopeConfig, ScopeProgressSnapshot } from './types.js';

export interface LegacyProgressFile extends ScopeProgressSnapshot {}

const DEFAULT_CONFIG: ScopeConfig = {
  activeHoursStart: 9,
  activeHoursEnd: 22,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  dailyTarget: 5,
  vocabSource: 'ielts',
  nativeLang: 'zh',
  targetLang: 'en',
  paused: false,
};

export function defaultLegacyProgress(scopeId: string): LegacyProgressFile {
  return {
    scopeId,
    level: 7,
    mastered: [],
    weights: {},
    lastPushTime: 0,
    config: { ...DEFAULT_CONFIG },
  };
}

function progressDir(stateDir: string): string {
  return join(stateDir, 'vocab-progress');
}

function progressPath(stateDir: string, scopeId: string): string {
  const safe = scopeId.replace(/[^a-zA-Z0-9_\-@.:]/g, '_');
  return join(progressDir(stateDir), `${safe}.json`);
}

async function ensureDir(stateDir: string): Promise<void> {
  await mkdir(progressDir(stateDir), { recursive: true });
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

export async function loadLegacyProgress(stateDir: string, scopeId: string): Promise<LegacyProgressFile> {
  return readJson(progressPath(stateDir, scopeId), defaultLegacyProgress(scopeId));
}

export async function listLegacyProgressFiles(stateDir: string): Promise<string[]> {
  try {
    await ensureDir(stateDir);
    const files = await readdir(progressDir(stateDir));
    return files.filter((file) => file.endsWith('.json'));
  } catch {
    return [];
  }
}

export function legacyStateToMap(weights: Record<string, FSRSState> | Record<number, FSRSState>): Record<number, FSRSState> {
  return Object.fromEntries(
    Object.entries(weights).map(([key, value]) => [Number(key), value]),
  );
}
