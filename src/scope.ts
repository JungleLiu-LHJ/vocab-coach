import { DEFAULT_SCOPE_CONFIG } from './types.js';
import type {
  LearningScope,
  OpenClawHookPayload,
  OpenClawPluginConfig,
  ScopeConfig,
} from './types.js';

export function seedScopeConfig(
  pluginConfig: OpenClawPluginConfig | undefined,
  timezone?: string,
): ScopeConfig {
  return {
    activeHoursStart: Number(pluginConfig?.activeHoursStart ?? DEFAULT_SCOPE_CONFIG.activeHoursStart),
    activeHoursEnd: Number(pluginConfig?.activeHoursEnd ?? DEFAULT_SCOPE_CONFIG.activeHoursEnd),
    timezone: timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    dailyTarget: Number(pluginConfig?.dailyTarget ?? DEFAULT_SCOPE_CONFIG.dailyTarget),
    vocabSource: String(pluginConfig?.vocabSource ?? DEFAULT_SCOPE_CONFIG.vocabSource),
    nativeLang: String(pluginConfig?.nativeLang ?? DEFAULT_SCOPE_CONFIG.nativeLang),
    paused: DEFAULT_SCOPE_CONFIG.paused,
  };
}

export function resolveLearningScope(payload: OpenClawHookPayload): LearningScope {
  const channelId = payload.channelId ?? 'default';
  const fromId = payload.senderId ?? 'anonymous';
  const isDirect = payload.isDirect ?? (!payload.conversationId || payload.conversationId === fromId);

  if (isDirect) {
    return {
      scopeId: `direct:${channelId}:${fromId}`,
      scopeType: 'direct',
      channelId,
      conversationId: payload.conversationId,
      fromId,
      targetId: fromId,
      accountId: payload.accountId,
    };
  }

  const conversationId = payload.conversationId ?? fromId;
  return {
    scopeId: `channel:${channelId}:${conversationId}`,
    scopeType: 'channel',
    channelId,
    conversationId,
    fromId,
    targetId: conversationId,
    accountId: payload.accountId,
  };
}
