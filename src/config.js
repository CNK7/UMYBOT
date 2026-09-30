require('dotenv').config();

const config = {
  botToken: process.env.BOT_TOKEN || '',
  adminIds: (process.env.ADMIN_IDS || '')
    .split(',')
    .map(id => id.trim())
    .filter(id => id && /^\d+$/.test(id))
    .map(id => String(id)),
  botUsername: process.env.BOT_USERNAME || '',

  useWebhook: process.env.USE_WEBHOOK === 'true',
  webhookUrl: process.env.WEBHOOK_URL || '',
  port: parseInt(process.env.PORT, 10) || 3000,

  welcomeTitle: process.env.WELCOME_TITLE || '你好',
  welcomeMessage: process.env.WELCOME_MESSAGE || '专属会话已建立\n\n请直接发送需要咨询的内容。',
  welcomeStatus: process.env.WELCOME_STATUS || '✅ 当前状态：在线接收',
  welcomeImageUrl: process.env.WELCOME_IMAGE_URL || '',
  welcomeStickerId: process.env.WELCOME_STICKER_ID || '',
  welcomePremiumEmojiId: process.env.WELCOME_PREMIUM_EMOJI_ID || '',
  welcomePremiumEmojiText: process.env.WELCOME_PREMIUM_EMOJI_TEXT || '✨',
  statusCheckEmojiId: process.env.STATUS_CHECK_EMOJI_ID || '',
  statusGlobeEmojiId: process.env.STATUS_GLOBE_EMOJI_ID || '',
  statusBellEmojiId: process.env.STATUS_BELL_EMOJI_ID || '',
  quoteLockEmojiId: process.env.QUOTE_LOCK_EMOJI_ID || '',

  inlineButtons: parseButtons(process.env.INLINE_BUTTONS),
  broadcastButtons: parseButtons(process.env.BROADCAST_BUTTONS),
};

function parseButtons(jsonStr) {
  if (!jsonStr) return [];
  try {
    const arr = JSON.parse(jsonStr);
    if (Array.isArray(arr)) return arr;
    return [];
  } catch (e) {
    console.error('[config] 按钮配置解析失败:', e.message);
    console.error('         请检查 INLINE_BUTTONS / BROADCAST_BUTTONS 是否为合法 JSON 数组。');
    return [];
  }
}

function isAdmin(userId) {
  if (userId == null) return false;
  return config.adminIds.includes(String(userId));
}

module.exports = { config, isAdmin };
