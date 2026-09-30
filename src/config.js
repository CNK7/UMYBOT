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

  welcomeTitle: process.env.WELCOME_TITLE || '你好，欢迎咨询',
  welcomeMessage: process.env.WELCOME_MESSAGE || '🔒 专属会话已建立\n\n                                                                        │\n💗请直接发送需要咨询的文字、图片、文件或其他内容，客服人员收到后会尽快回复。',
  welcomeStatus: process.env.WELCOME_STATUS || '✅ 当前状态：在线接收\n🌐 会话通道：已连接\n🔔 消息通知：已开启',
  welcomeFooter: process.env.WELCOME_FOOTER || '🌍本机器人由悠米一手制作： @ummix',
  welcomeImageUrl: process.env.WELCOME_IMAGE_URL || '',
  welcomeStickerId: process.env.WELCOME_STICKER_ID || '',
  welcomePremiumEmojiId: process.env.WELCOME_PREMIUM_EMOJI_ID || '',
  welcomePremiumEmojiText: process.env.WELCOME_PREMIUM_EMOJI_TEXT || '✨',
  statusCheckEmojiId: process.env.STATUS_CHECK_EMOJI_ID || '',
  statusGlobeEmojiId: process.env.STATUS_GLOBE_EMOJI_ID || '',
  statusBellEmojiId: process.env.STATUS_BELL_EMOJI_ID || '',
  quoteLockEmojiId: process.env.QUOTE_LOCK_EMOJI_ID || '',
  heartEmojiId: process.env.HEART_EMOJI_ID || '',
  footerGlobeEmojiId: process.env.FOOTER_GLOBE_EMOJI_ID || '',
  autoReplyEnabled: (process.env.AUTO_REPLY_ENABLED || 'true').toLowerCase() !== 'false',
  autoReplyText: process.env.AUTO_REPLY_TEXT || '悠米bot已接收您的消息，请耐心等待人工客服的回复。感谢您的理解与等待哦～',
  autoReplyBotEmojiId: process.env.AUTO_REPLY_BOT_EMOJI_ID || '',

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
