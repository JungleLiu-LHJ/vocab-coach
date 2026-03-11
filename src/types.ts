// ── 词汇 ─────────────────────────────────────────────────
export interface VocabWord {
  id: number;
  w: string;        // 单词
  lv: string;       // CEFR 等级：A1–C2
  tag: string;      // 如 "ielts"、"cet4"
  def?: string;
  phonetic?: string;
}

// ── 每个单词的 FSRS 状态 ──────────────────────────────────
export interface FSRSState {
  s: number;        // 稳定性：达到 90% 记忆保留的天数
  d: number;        // 难度：1–10
  next: number;     // 下次复习时间戳（毫秒）
  reviews: number;
  lapses: number;
}

// ── 用户持久化状态 ────────────────────────────────────────
export interface UserProgress {
  level: number;                         // 技能等级 1–10
  mastered: number[];                    // 已掌握、不再推送的词 ID
  weights: Record<number, FSRSState>;    // 以词 ID 为键的 FSRS 状态
  lastPushTime: number;
  config: UserConfig;
}

export interface UserConfig {
  activeHours: [number, number];  // [9, 22]
  timezone: string;               // 通过 Intl 自动检测
  dailyTarget: number;            // 默认 5
  vocabTags: string[];            // 如 ["ielts"]
  /** 用户母语（BCP 47），控制卡片界面语言和 LLM 释义语言，默认 'zh' */
  nativeLang: string;
  // 插件级飞书凭证
  feishuAppId?: string;
  feishuAppSecret?: string;
  // OpenClaw 全局渠道配置
  channels?: {
    feishu?: {
      appId?: string;
      appSecret?: string;
    };
  };
}

// ── Action payload ────────────────────────────────────────
export type FeedbackRating = 'know' | 'fuzzy' | 'forgot' | 'master';

export interface ActionPayload {
  wordId: number;
  rating: FeedbackRating;
}

// ── 生成内容 ──────────────────────────────────────────────
export interface GeneratedContent {
  englishDef: string;   // 英文释义
  examples: string[];   // 3 个例句（最后一句结合时事）
  related: string[];    // 关联词及中文注释，如 ["vector (矢量)", ...]
  mnemonic: string;     // 记忆技巧
}

// ── 渠道路由 — 按用户持久化 ───────────────────────────────
// 存储主动推送时联系用户的方式
export interface UserRoute {
  /** OpenClaw 渠道 ID，如 "telegram"、"whatsapp"、"discord" */
  channelId: string;
  /** 发送目标：有 conversationId 时用之，否则用 event.from */
  to: string;
  /** event.from — 渠道内的用户标准标识符 */
  from: string;
  /** 多账号渠道时的可选账号 ID */
  accountId?: string;
}

// ── OpenClaw 上下文（最小类型安全接口）────────────────────
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
    /** 用户母语，如 'zh'、'en'、'ja' */
    nativeLang?: string;
    /** 插件级飞书凭证（通过 openclaw plugins config 设置） */
    feishuAppId?: string;
    feishuAppSecret?: string;
    /** OpenClaw 全局渠道配置 — 运行时可注入 */
    channels?: {
      feishu?: {
        appId?: string;
        appSecret?: string;
      };
    };
  };
}

// ── OpenClaw 插件注册 API ─────────────────────────────────
// OpenClaw 运行时在插件加载时调用一次 register(api)。
// `api` 提供与 OpenClawContext 相同的能力，但作用于插件级别（非单用户）。
// 用户级上下文在每个事件的钩子处理函数中传入。
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
  /** 消息平台中的发送者/用户 ID */
  senderId?: string;
  /** 原始消息文本（用于 message:received） */
  text?: string;
  /** 内联按钮回调的任意 action 数据 */
  action?: string;
  /** 网关检测到的发送者 IANA 时区 */
  timezone?: string;
  timestamp: number;
}

export type OpenClawHookHandler = (
  payload: OpenClawHookPayload,
  api: OpenClawPluginAPI,
) => Promise<void> | void;
