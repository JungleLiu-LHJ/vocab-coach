export interface VocabWord {
  id: number;
  w: string;
  lv: string;
  tag: string;
  def?: string;
  phonetic?: string;
}

export interface FSRSState {
  s: number;
  d: number;
  next: number;
  reviews: number;
  lapses: number;
}

export type ScopeType = 'direct' | 'channel';
export type FeedbackRating = 'know' | 'fuzzy' | 'forgot' | 'master';

export interface ScopeConfig {
  activeHoursStart: number;
  activeHoursEnd: number;
  timezone: string;
  dailyTarget: number;
  vocabSource: string;
  nativeLang: string;
  paused: boolean;
}

export interface LearningScope {
  scopeId: string;
  scopeType: ScopeType;
  channelId: string;
  conversationId?: string;
  fromId: string;
  targetId: string;
  accountId?: string;
}

export interface ScopeProgress {
  scopeId: string;
  scopeType: ScopeType;
  channelId: string;
  conversationId?: string;
  fromId: string;
  targetId: string;
  accountId?: string;
  level: number;
  lastPushTime: number;
  config: ScopeConfig;
}

export interface ScopeProgressSnapshot {
  scopeId: string;
  level: number;
  mastered: number[];
  weights: Record<number, FSRSState>;
  lastPushTime: number;
  config: ScopeConfig;
}

export interface ActionPayload {
  scopeId: string;
  wordId: number;
  rating: FeedbackRating;
}

export interface GeneratedContent {
  nativeDef: string;
  englishDef: string;
  phonetic: string;
  partOfSpeech: string;
  forms: string[];
  examples: string[];
  related: string[];
  mnemonic: string;
}

type AgentSessionMessageBlock = {
  type?: string;
  text?: string;
};

export interface OpenClawAgent {
  complete?(prompt: string): Promise<string>;
  run?(params: {
    sessionKey: string;
    message: string;
    deliver?: boolean;
    idempotencyKey?: string;
  }): Promise<{ runId: string }>;
  waitForRun?(params: { runId: string; timeoutMs?: number }): Promise<{ status: string; error?: string }>;
  getSessionMessages?(params: { sessionKey: string; limit?: number }): Promise<{
    messages: Array<{ role?: string; content?: string | AgentSessionMessageBlock[] }>;
  }>;
  deleteSession?(params: { sessionKey: string; deleteTranscript?: boolean }): Promise<void>;
}

export interface OpenClawStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

export interface OpenClawGateway {
  send(message: string, targetId?: string): Promise<void>;
}

export interface OpenClawPluginConfig {
  activeHoursStart?: number;
  activeHoursEnd?: number;
  dailyTarget?: number;
  vocabSource?: string;
  nativeLang?: string;
}

export interface OpenClawContext {
  storage: OpenClawStorage;
  gateway: OpenClawGateway;
  agent: OpenClawAgent;
  user: {
    id: string;
    timezone?: string;
  };
  config: OpenClawPluginConfig;
  stateDir?: string;
}

export interface OpenClawPluginAPI {
  storage: OpenClawStorage;
  gateway: OpenClawGateway;
  agent: OpenClawAgent;
  config: OpenClawPluginConfig;
  stateDir?: string;
  on(event: OpenClawHookEvent, handler: OpenClawHookHandler): void;
}

export type OpenClawHookEvent =
  | 'gateway:startup'
  | 'message:received'
  | 'message:sent'
  | 'agent:bootstrap'
  | 'tool_result_persist';

export interface OpenClawHookPayload {
  type: OpenClawHookEvent;
  senderId?: string;
  channelId?: string;
  conversationId?: string;
  accountId?: string;
  isDirect?: boolean;
  text?: string;
  action?: string;
  timezone?: string;
  timestamp: number;
}

export type OpenClawHookHandler = (
  payload: OpenClawHookPayload,
  api: OpenClawPluginAPI,
) => Promise<void> | void;

export const DEFAULT_SCOPE_CONFIG: ScopeConfig = {
  activeHoursStart: 9,
  activeHoursEnd: 22,
  timezone: 'UTC',
  dailyTarget: 5,
  vocabSource: 'ielts',
  nativeLang: 'zh',
  paused: false,
};
