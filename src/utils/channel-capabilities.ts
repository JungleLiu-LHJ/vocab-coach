/**
 * 频道能力检测
 * 用于判断不同频道支持的卡片类型和按钮语法
 */

export interface ChannelCapabilities {
  /** 是否支持互动卡片（如飞书） */
  supportsInteractiveCards: boolean;
  /** 是否支持内联按钮（如 Telegram） */
  supportsInlineButtons: boolean;
  /** 是否支持 Discord Embeds */
  supportsDiscordEmbeds: boolean;
  /** 按钮语法类型 */
  actionButtonSyntax: 'json' | 'markdown' | 'text';
  /** 是否支持 Markdown */
  supportsMarkdown: boolean;
}

const CHANNEL_CAPABILITIES: Record<string, ChannelCapabilities> = {
  // 飞书：支持互动卡片
  'feishu': {
    supportsInteractiveCards: true,
    supportsInlineButtons: false,
    supportsDiscordEmbeds: false,
    actionButtonSyntax: 'json',
    supportsMarkdown: true,
  },
  
  // Telegram：支持 inline buttons
  'telegram': {
    supportsInteractiveCards: false,
    supportsInlineButtons: true,
    supportsDiscordEmbeds: false,
    actionButtonSyntax: 'markdown',
    supportsMarkdown: true,
  },
  
  // Discord：支持 Embeds + 按钮组件
  'discord': {
    supportsInteractiveCards: false,
    supportsInlineButtons: false,
    supportsDiscordEmbeds: true,
    actionButtonSyntax: 'json',
    supportsMarkdown: true,
  },
  
  // WhatsApp：纯文本
  'whatsapp': {
    supportsInteractiveCards: false,
    supportsInlineButtons: false,
    supportsDiscordEmbeds: false,
    actionButtonSyntax: 'text',
    supportsMarkdown: true,
  },
  
  // Signal：纯文本
  'signal': {
    supportsInteractiveCards: false,
    supportsInlineButtons: false,
    supportsDiscordEmbeds: false,
    actionButtonSyntax: 'text',
    supportsMarkdown: false,
  },
  
  // iMessage：纯文本
  'imessage': {
    supportsInteractiveCards: false,
    supportsInlineButtons: false,
    supportsDiscordEmbeds: false,
    actionButtonSyntax: 'text',
    supportsMarkdown: false,
  },
  
  // Line：纯文本
  'line': {
    supportsInteractiveCards: false,
    supportsInlineButtons: false,
    supportsDiscordEmbeds: false,
    actionButtonSyntax: 'text',
    supportsMarkdown: true,
  },
  
  // Slack：支持 Block Kit
  'slack': {
    supportsInteractiveCards: false,
    supportsInlineButtons: false,
    supportsDiscordEmbeds: false,
    actionButtonSyntax: 'json',
    supportsMarkdown: true,
  },
};

/**
 * 获取频道能力
 */
export function getChannelCapabilities(channelId: string): ChannelCapabilities {
  return CHANNEL_CAPABILITIES[channelId] || CHANNEL_CAPABILITIES['whatsapp'];
}

/**
 * 检查频道是否支持按钮
 */
export function supportsButtons(channelId: string): boolean {
  const caps = getChannelCapabilities(channelId);
  return caps.supportsInteractiveCards || caps.supportsInlineButtons || caps.supportsDiscordEmbeds;
}

/**
 * 检查频道是否支持 Markdown
 */
export function supportsMarkdown(channelId: string): boolean {
  return getChannelCapabilities(channelId).supportsMarkdown;
}
