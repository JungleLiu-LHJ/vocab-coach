// ── Vocabulary ────────────────────────────────────────────
export interface VocabWord {
  id: number;
  w: string;        // word
  lv: string;       // CEFR level: A1–C2
  tag: string;      // e.g. "ielts", "cet4"
  def?: string;
  phonetic?: string;
}

// ── FSRS state per word ───────────────────────────────────
export interface FSRSState {
  s: number;        // stability: days until 90% retention
  d: number;        // difficulty: 1–10
  next: number;     // next review timestamp (ms since epoch)
  reviews: number;
  lapses: number;
}

// ── Persisted user state ──────────────────────────────────
export interface UserProgress {
  level: number;                         // 1–10 skill level
  mastered: number[];                    // word IDs to never show again
  weights: Record<number, FSRSState>;    // FSRS state keyed by word ID
  lastPushTime: number;
  config: UserConfig;
}

export interface UserConfig {
  activeHours: [number, number];  // [9, 22]
  timezone: string;               // auto-detected via Intl
  dailyTarget: number;            // default 5
  vocabTags: string[];            // ["ielts"] etc.
  // Plugin-level feishu credentials
  feishuAppId?: string;
  feishuAppSecret?: string;
  // OpenClaw global channels config
  channels?: {
    feishu?: {
      appId?: string;
      appSecret?: string;
    };
  };
}

// ── Action payloads ───────────────────────────────────────
export type FeedbackRating = 'know' | 'fuzzy' | 'forgot' | 'master';

export interface ActionPayload {
  wordId: number;
  rating: FeedbackRating;
}

// ── Generated content ─────────────────────────────────────
export interface GeneratedContent {
  englishDef: string;   // English definition/explanation
  examples: string[];   // 3 example sentences (last one tied to current events)
  related: string[];    // Related words with brief Chinese gloss, e.g. ["vector (矢量)", ...]
  mnemonic: string;     // Memory trick
}

// ── Channel routing — persisted per user ──────────────────
// Stores where to reach a user for proactive pushes.
export interface UserRoute {
  /** OpenClaw channel id, e.g. "telegram", "whatsapp", "discord" */
  channelId: string;
  /** Send target: conversationId when available, else event.from */
  to: string;
  /** event.from — canonical user identifier within the channel */
  from: string;
  /** Optional account id for multi-account channel setups */
  accountId?: string;
}

// ── OpenClaw context (minimal interface for type safety) ──
export interface OpenClawContext {
  storage: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
  };
  gateway: {
    send(message: string, userId?: string): Promise<void>;
  };
  agent: {
    complete(prompt: string): Promise<string>;
  };
  user: {
    id: string;
    timezone?: string;
  };
  config: {
    activeHoursStart?: number;
    activeHoursEnd?: number;
    dailyTarget?: number;
    vocabSource?: string;
    /** Plugin-level feishu credentials (set via openclaw plugins config) */
    feishuAppId?: string;
    feishuAppSecret?: string;
    /** OpenClaw global channels config — runtime may inject this */
    channels?: {
      feishu?: {
        appId?: string;
        appSecret?: string;
      };
    };
  };
}

// ── OpenClaw Plugin Register API ──────────────────────────
// The real OpenClaw runtime calls register(api) on plugin load.
// `api` provides the same capabilities as OpenClawContext but
// at the plugin level (not per-user). User-scoped context is
// passed per-event in hook handlers.
export interface OpenClawPluginAPI {
  storage: OpenClawContext['storage'];
  gateway: OpenClawContext['gateway'];
  agent:   OpenClawContext['agent'];
  config:  OpenClawContext['config'];
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
  /** Sender/user ID from the messaging platform */
  senderId?: string;
  /** Raw message text (for message:received) */
  text?: string;
  /** Arbitrary action data (for inline button callbacks) */
  action?: string;
  /** IANA timezone of the sender, if detected by gateway */
  timezone?: string;
  timestamp: number;
}

export type OpenClawHookHandler = (
  payload: OpenClawHookPayload,
  api: OpenClawPluginAPI,
) => Promise<void> | void;
