import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { onMessageReceived } from '../src/index.js';
import { VocabDatabase } from '../src/db/database.js';
import { UserRepository } from '../src/repository/user.repository.js';
import { WordProgressRepository } from '../src/repository/word-progress.repository.js';
import type { OpenClawPluginAPI, OpenClawPluginConfig } from '../src/types.js';

function extractFirstAction(messages: Array<{ message: string }>): string {
  const cardMessage = messages.find((entry) => entry.message.includes('(action:'));
  if (!cardMessage) throw new Error('no action payload found in sent messages');
  const match = cardMessage.message.match(/\(action:(\{.*?\})\)/);
  if (!match) throw new Error(`no action payload found in message: ${cardMessage.message}`);
  return match[1];
}

function makeApi(stateDir: string, sent: Array<{ message: string; targetId?: string }>): OpenClawPluginAPI {
  const config: OpenClawPluginConfig = {
    activeHoursStart: 9,
    activeHoursEnd: 22,
    dailyTarget: 5,
    vocabSource: 'ielts',
    nativeLang: 'zh',
  };

  return {
    config,
    stateDir,
    storage: {
      async get() {
        return null;
      },
      async set() {
        return undefined;
      },
    },
    gateway: {
      async send(message: string, targetId?: string) {
        sent.push({ message, targetId });
      },
    },
    agent: {
      async complete() {
        return JSON.stringify({
          nativeDef: '测试释义',
          englishDef: 'test definition',
          phonetic: '/test/',
          partOfSpeech: 'n.',
          forms: ['tests (测试)'],
          examples: ['A test sentence.', 'Another test sentence.', 'A final test sentence.'],
          related: ['trial (尝试)'],
          mnemonic: '记忆技巧',
        });
      },
    },
    on() {
      return undefined;
    },
  };
}

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    const db = VocabDatabase.getInstance(dir);
    db.close();
    await rm(dir, { recursive: true, force: true });
  }
});

describe('scope-based sqlite flow', () => {
  it('creates isolated direct and channel scopes', async () => {
    const stateDir = await mkdtemp(join(tmpdir(), 'vocab-coach-'));
    tempDirs.push(stateDir);
    const sent: Array<{ message: string; targetId?: string }> = [];
    const api = makeApi(stateDir, sent);

    await onMessageReceived(
      {
        type: 'message:received',
        senderId: 'user-1',
        channelId: 'telegram',
        conversationId: 'user-1',
        isDirect: true,
        text: '/vocab',
        timestamp: Date.now(),
      },
      api,
    );

    await onMessageReceived(
      {
        type: 'message:received',
        senderId: 'user-1',
        channelId: 'telegram',
        conversationId: 'group-1',
        isDirect: false,
        text: '/vocab',
        timestamp: Date.now(),
      },
      api,
    );

    expect(sent).toHaveLength(2);
    expect(sent[0].targetId).toBe('user-1');
    expect(sent[1].targetId).toBe('group-1');

    const repo = new UserRepository(VocabDatabase.getInstance(stateDir));
    expect(repo.getByScopeId('direct:telegram:user-1')).toBeDefined();
    expect(repo.getByScopeId('channel:telegram:group-1')).toBeDefined();
  });

  it('keeps feedback isolated by scopeId', async () => {
    const stateDir = await mkdtemp(join(tmpdir(), 'vocab-coach-'));
    tempDirs.push(stateDir);
    const sent: Array<{ message: string; targetId?: string }> = [];
    const api = makeApi(stateDir, sent);

    await onMessageReceived(
      {
        type: 'message:received',
        senderId: 'user-1',
        channelId: 'telegram',
        conversationId: 'user-1',
        isDirect: true,
        text: '/vocab',
        timestamp: Date.now(),
      },
      api,
    );

    await onMessageReceived(
      {
        type: 'message:received',
        senderId: 'user-1',
        channelId: 'telegram',
        conversationId: 'group-1',
        isDirect: false,
        text: '/vocab',
        timestamp: Date.now(),
      },
      api,
    );

    const directAction = extractFirstAction(sent);
    await onMessageReceived(
      {
        type: 'message:received',
        senderId: 'user-1',
        channelId: 'telegram',
        conversationId: 'group-1',
        isDirect: false,
        action: directAction,
        timestamp: Date.now(),
      },
      api,
    );

    const wordRepo = new WordProgressRepository(VocabDatabase.getInstance(stateDir));
    expect(wordRepo.getByScopeId('direct:telegram:user-1')).toHaveLength(1);
    expect(wordRepo.getByScopeId('channel:telegram:group-1')).toHaveLength(0);
  });

  it('updates only the current scope config with vocab-set commands', async () => {
    const stateDir = await mkdtemp(join(tmpdir(), 'vocab-coach-'));
    tempDirs.push(stateDir);
    const sent: Array<{ message: string; targetId?: string }> = [];
    const api = makeApi(stateDir, sent);

    await onMessageReceived(
      {
        type: 'message:received',
        senderId: 'user-1',
        channelId: 'telegram',
        conversationId: 'user-1',
        isDirect: true,
        text: '/vocab-set pause',
        timestamp: Date.now(),
      },
      api,
    );

    await onMessageReceived(
      {
        type: 'message:received',
        senderId: 'user-1',
        channelId: 'telegram',
        conversationId: 'group-1',
        isDirect: false,
        text: '/vocab-set target 9',
        timestamp: Date.now(),
      },
      api,
    );

    const repo = new UserRepository(VocabDatabase.getInstance(stateDir));
    expect(repo.getByScopeId('direct:telegram:user-1')?.config.paused).toBe(true);
    expect(repo.getByScopeId('channel:telegram:group-1')?.config.dailyTarget).toBe(9);
    expect(repo.getByScopeId('direct:telegram:user-1')?.config.dailyTarget).toBe(5);
  });
});
