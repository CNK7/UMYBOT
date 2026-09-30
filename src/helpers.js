const { InlineKeyboard } = require('grammy');
const { config } = require('./config');

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function unescapeNewlines(str) {
  if (str == null) return '';
  return String(str).replace(/\\n/g, '\n');
}

function buildInlineKeyboard(buttons) {
  if (!buttons || buttons.length === 0) return undefined;
  const keyboard = new InlineKeyboard();
  buttons.forEach((btn, idx) => {
    if (btn.url) {
      keyboard.url(btn.text, btn.url);
    } else if (btn.callback_data) {
      keyboard.text(btn.text, btn.callback_data);
    } else if (btn.web_app) {
      keyboard.webApp(btn.text, btn.web_app);
    }
    if ((idx + 1) % 2 === 0 && idx < buttons.length - 1) {
      keyboard.row();
    }
  });
  return keyboard;
}

function buildWelcomeText(ctx) {
  const userName = escapeHtml(ctx.from?.first_name || '朋友');
  const lines = [];

  if (config.welcomeTitle) {
    lines.push(`✨ ${unescapeNewlines(escapeHtml(config.welcomeTitle))}，${userName}`);
    lines.push('');
  }

  if (config.welcomeMessage) {
    const msgLines = unescapeNewlines(config.welcomeMessage).split('\n');
    if (msgLines[0]) {
      lines.push(`🔒 ${escapeHtml(msgLines[0])}`);
    }
    const rest = msgLines.slice(1).map(l => escapeHtml(l));
    if (rest.length > 0) {
      lines.push('');
      lines.push(rest.join('\n'));
    }
    lines.push('');
  }

  if (config.welcomeStatus) {
    lines.push(unescapeNewlines(escapeHtml(config.welcomeStatus)));
  }

  return lines.join('\n');
}

function buildUserInfo(ctx) {
  const from = ctx.from;
  if (!from) return '未知用户';
  const parts = [];
  const name = [from.first_name, from.last_name].filter(Boolean).join(' ');
  parts.push(`👤 用户: ${escapeHtml(name)}`);
  if (from.username) parts.push(`🔗 @${escapeHtml(from.username)}`);
  parts.push(`🆔 ID: ${from.id}`);
  if (from.language_code) parts.push(`🌐 语言: ${escapeHtml(from.language_code)}`);
  return parts.join('\n');
}

function buildAdminBroadcastKeyboard(userCount) {
  return new InlineKeyboard()
    .text(`📢 广播文字 (${userCount}人)`, 'broadcast_text')
    .row()
    .text('🖼️ 广播图片', 'broadcast_photo')
    .row()
    .text('📌 置顶消息', 'pin_message')
    .row()
    .text('📊 用户统计', 'user_stats');
}

function buildCancelKeyboard() {
  return new InlineKeyboard()
    .text('← 返回菜单', 'back_to_menu');
}

module.exports = {
  buildInlineKeyboard,
  buildWelcomeText,
  buildUserInfo,
  buildAdminBroadcastKeyboard,
  buildCancelKeyboard,
  escapeHtml,
  unescapeNewlines,
};
