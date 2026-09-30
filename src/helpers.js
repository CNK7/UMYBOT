const { InlineKeyboard } = require('grammy');
const { config } = require('./config');
const { getSetting } = require('./storage');

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

function parseButtonsArray(jsonOrArr) {
  if (!jsonOrArr) return [];
  if (Array.isArray(jsonOrArr)) return jsonOrArr;
  try {
    const parsed = JSON.parse(jsonOrArr);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function parseButtonsFriendly(rawText) {
  if (!rawText) return [];
  const text = String(rawText).trim();
  if (text.startsWith('[')) {
    return parseButtonsArray(text);
  }
  const lines = text.split('\n').map(l => l.trimEnd());
  const rows = [];
  let curRow = [];
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === '' || /^[-—=]{3,}$/.test(line)) {
      if (curRow.length > 0) { rows.push(curRow); curRow = []; }
      continue;
    }
    const oneLinePairs = line.split(/\s+｜\s+|\s+\|\s+/).map(s => s.trim()).filter(Boolean);
    if (oneLinePairs.length > 1 && oneLinePairs.every(p => /\|/.test(p) || /｜/.test(p))) {
      for (const pair of oneLinePairs) {
        const sep = pair.indexOf('｜') >= 0 ? '｜' : '|';
        const i2 = pair.indexOf(sep);
        if (i2 < 0) continue;
        const t = pair.slice(0, i2).trim();
        const url = pair.slice(i2 + 1).trim();
        if (t && url) curRow.push({ text: t, url });
      }
      rows.push(curRow);
      curRow = [];
      continue;
    }
    const idx = line.indexOf('|') >= 0 ? line.indexOf('|') : line.indexOf('｜');
    if (idx < 0) continue;
    const t = line.slice(0, idx).trim();
    const url = line.slice(idx + 1).trim();
    if (t && url) curRow.push({ text: t, url });
  }
  if (curRow.length > 0) rows.push(curRow);
  return rows;
}

function getEffectiveInlineButtons() {
  const saved = getSetting('inline_buttons', null);
  if (saved) return parseButtonsArray(saved);
  return parseButtonsArray(config.inlineButtons);
}
function getEffectiveBroadcastButtons() {
  const saved = getSetting('broadcast_buttons', null);
  if (saved) return parseButtonsArray(saved);
  return parseButtonsArray(config.broadcastButtons);
}
function getEffectiveWelcomeTitle() {
  return getSetting('welcome_title', config.welcomeTitle || '你好');
}
function getEffectiveWelcomeMessage() {
  return getSetting('welcome_message', config.welcomeMessage || '');
}
function getEffectiveWelcomeStatus() {
  return getSetting('welcome_status', config.welcomeStatus || '');
}
function getEffectiveWelcomeImageUrl() {
  return getSetting('welcome_image_url', config.welcomeImageUrl || '');
}
function getEffectiveWelcomeStickerId() {
  return getSetting('welcome_sticker_id', config.welcomeStickerId || '');
}
function getEffectiveWelcomePremiumEmojiId() {
  return getSetting('welcome_premium_emoji_id', config.welcomePremiumEmojiId || '');
}
function getEffectiveWelcomePremiumEmojiText() {
  return getSetting('welcome_premium_emoji_text', config.welcomePremiumEmojiText || '✨');
}
function getEffectiveStatusCheckEmojiId() { return getSetting('status_check_emoji_id', config.statusCheckEmojiId || ''); }
function getEffectiveStatusGlobeEmojiId() { return getSetting('status_globe_emoji_id', config.statusGlobeEmojiId || ''); }
function getEffectiveStatusBellEmojiId() { return getSetting('status_bell_emoji_id', config.statusBellEmojiId || ''); }
function getEffectiveQuoteLockEmojiId() { return getSetting('quote_lock_emoji_id', config.quoteLockEmojiId || ''); }
function getEffectiveHeartEmojiId() { return getSetting('heart_emoji_id', config.heartEmojiId || ''); }
function getEffectiveFooterGlobeEmojiId() { return getSetting('footer_globe_emoji_id', config.footerGlobeEmojiId || ''); }
function getEffectiveWelcomeFooter() { return getSetting('welcome_footer', config.welcomeFooter || ''); }
function getEffectiveAutoReplyEnabled() {
  const v = getSetting('auto_reply_enabled', null);
  if (v === null) return !!config.autoReplyEnabled;
  return String(v).toLowerCase() !== 'false';
}
function getEffectiveAutoReplyText() { return getSetting('auto_reply_text', config.autoReplyText || '悠米bot已接收您的消息，请耐心等待人工客服的回复。感谢您的理解与等待哦～'); }
function getEffectiveAutoReplyBotEmojiId() { return getSetting('auto_reply_bot_emoji_id', config.autoReplyBotEmojiId || ''); }
function isValidCustomEmojiId(id) {
  if (!id) return false;
  return /^\d{10,25}$/.test(String(id).trim());
}
function renderMaybePremium(emojiId, fallback) {
  const clean = String(emojiId || '').trim();
  if (isValidCustomEmojiId(clean)) return `<tg-emoji emoji-id="${clean}">${fallback}</tg-emoji>`;
  return fallback;
}

function isBtnRowLike(v) {
  return Array.isArray(v) && v.every(x => x && typeof x === 'object' && ('text' in x));
}
function normalizeButtonsLayout(buttons) {
  if (!buttons || buttons.length === 0) return [];
  if (isBtnRowLike(buttons)) return buttons;
  if (Array.isArray(buttons) && buttons.every(b => !('text' in b))) return buttons.map(r => Array.isArray(r) ? r : []);
  const out = [];
  let row = [];
  for (const btn of buttons) {
    if (btn === null || btn === undefined) continue;
    if (typeof btn === 'string' && (btn.trim() === '' || btn.trim() === '---' || btn.trim() === '——' || /^[-—=]{3,}$/.test(btn.trim()))) {
      if (row.length > 0) { out.push(row); row = []; }
      continue;
    }
    if (btn && btn.__rowBreak) {
      if (row.length > 0) { out.push(row); row = []; }
      continue;
    }
    if (isBtnRowLike([btn])) {
      if (row.length > 0) { out.push(row); row = []; }
      out.push(btn);
      continue;
    }
    if (btn && ('text' in btn || 'url' in btn || 'callback_data' in btn)) {
      row.push(btn);
    }
  }
  if (row.length > 0) out.push(row);
  return out;
}
function buildInlineKeyboard(buttons) {
  if (!buttons || buttons.length === 0) return undefined;
  const keyboard = new InlineKeyboard();
  const layout = normalizeButtonsLayout(buttons);
  layout.forEach((row, rIdx) => {
    row.forEach(btn => {
      if (btn.url) keyboard.url(btn.text, btn.url);
      else if (btn.callback_data) keyboard.text(btn.text, btn.callback_data);
      else if (btn.web_app) keyboard.webApp(btn.text, btn.web_app);
    });
    if (rIdx < layout.length - 1) keyboard.row();
  });
  return keyboard;
}

function stringifyButtons(buttons) {
  if (!buttons || buttons.length === 0) return '（无）';
  const layout = normalizeButtonsLayout(buttons);
  const lines = [];
  layout.forEach((row, rIdx) => {
    row.forEach(b => {
      const type = b.url ? '🔗' : b.callback_data ? '⚙️' : '📱';
      const target = b.url || b.callback_data || b.web_app || '';
      lines.push(`${type} 第${rIdx + 1}行: ${escapeHtml(b.text)} → ${escapeHtml(target)}`);
    });
  });
  return lines.join('\n');
}

function buildWelcomeText(ctx) {
  const userName = escapeHtml(ctx.from?.first_name || '朋友');
  const title = unescapeNewlines(escapeHtml(getEffectiveWelcomeTitle()));
  const msg = unescapeNewlines(getEffectiveWelcomeMessage());
  const statusRaw = unescapeNewlines(getEffectiveWelcomeStatus());
  const footerRaw = unescapeNewlines(getEffectiveWelcomeFooter()).replace(/[\r\n]+/g, ' ').trim();
  const premiumEmojiId = getEffectiveWelcomePremiumEmojiId();
  const premiumEmojiText = getEffectiveWelcomePremiumEmojiText() || '✨';
  const lockIcon = renderMaybePremium(getEffectiveQuoteLockEmojiId(), '🔒');
  const heartIcon = renderMaybePremium(getEffectiveHeartEmojiId(), '💗');
  const footerGlobeIcon = renderMaybePremium(getEffectiveFooterGlobeEmojiId(), '🌍');

  const lines = [];
  const prefixIcon = renderMaybePremium(premiumEmojiId, premiumEmojiText);
  const needComma = /[，。！？,.!?]$/.test(title) ? '' : '，';
  lines.push(`${prefixIcon} ${title}${needComma}${userName}`);
  lines.push('');

  if (msg) {
    const msgLines = msg.split('\n').filter(x => x !== undefined && x !== null).map(l => escapeHtml(l));
    for (const rawLine of msgLines) {
      const line = String(rawLine || '').trim();
      if (line === '') {
        lines.push('');
        continue;
      }
      if (line === '│' || /^\s*│\s*$/.test(line)) {
        lines.push('                                                                        │');
        continue;
      }
      const cleanContent = line
        .replace(/^🔒\s*/, '')
        .replace(/^💗\s*/, '');
      if (cleanContent.includes('专属会话已建立')) {
        lines.push(`${lockIcon} ${cleanContent}`);
      } else if (cleanContent.includes('请直接发送需要咨询') || cleanContent.includes('请直接发') && cleanContent.includes('尽快回复')) {
        lines.push(`${heartIcon}${cleanContent}`);
      } else {
        lines.push(rawLine);
      }
    }
    lines.push('');
  }

  if (statusRaw) {
    const checkIcon = renderMaybePremium(getEffectiveStatusCheckEmojiId(), '✅');
    const globeIcon = renderMaybePremium(getEffectiveStatusGlobeEmojiId(), '🌐');
    const bellIcon = renderMaybePremium(getEffectiveStatusBellEmojiId(), '🔔');
    const statLines = statusRaw.split('\n').map(x => {
      const raw = String(x || '').trim();
      const xEscaped = escapeHtml(raw)
        .replace(/^✅\s*/, '')
        .replace(/^🌐\s*/, '')
        .replace(/^🔔\s*/, '');
      if (xEscaped.includes('当前状态')) return checkIcon + ' ' + xEscaped;
      if (xEscaped.includes('会话通道')) return globeIcon + ' ' + xEscaped;
      if (xEscaped.includes('消息通知')) return bellIcon + ' ' + xEscaped;
      return escapeHtml(x);
    });
    lines.push(statLines.join('\n'));
    if (footerRaw) lines.push('');
  }

  if (footerRaw) {
    const trimmed = footerRaw.trim();
    const cleanFooter = trimmed.replace(/^🌍\s*/, '');
    if (cleanFooter.length > 0) {
      lines.push(footerGlobeIcon + cleanFooter);
    }
  }

  return lines.join('\n');
}

function buildAutoReplyText() {
  const botIcon = renderMaybePremium(getEffectiveAutoReplyBotEmojiId(), '🤖');
  const text = unescapeNewlines(escapeHtml(getEffectiveAutoReplyText()))
    .replace(/^🤖\s*/, '');
  return botIcon + text;
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
    .text('🖼️ 图文广播', 'broadcast_photo')
    .row()
    .text('📜 文图双条广播', 'broadcast_mixed')
    .text('🎯 智能广播', 'broadcast_smart')
    .row()
    .text('📊 用户统计', 'user_stats')
    .text('⚙️ 配置管理', 'settings_menu');
}

function buildSettingsMenu() {
  return new InlineKeyboard()
    .text('✏️ 欢迎消息标题', 'cfg_set_title')
    .text('✉️ 欢迎消息主内容', 'cfg_set_message')
    .row()
    .text('ℹ️ 欢迎消息底部状态', 'cfg_set_status')
    .text('🏷️ 底部制作者文字', 'cfg_set_footer')
    .row()
    .text('🖼️ 欢迎图片URL', 'cfg_set_image')
    .text('🐻 动画贴纸(Sticker)', 'cfg_set_sticker')
    .row()
    .text('🌟 标题前✨', 'cfg_set_premium_emoji')
    .text('🔒 锁头', 'cfg_set_quote_lock')
    .row()
    .text('💗 爱心', 'cfg_set_heart')
    .text('🌍 底部制作者🌍', 'cfg_set_footer_globe')
    .row()
    .text('✅ 状态对号', 'cfg_set_status_check')
    .text('🌐 状态地球', 'cfg_set_status_globe')
    .row()
    .text('🔔 状态铃铛', 'cfg_set_status_bell')
    .text('🤖 自动回复🤖', 'cfg_set_auto_reply_bot')
    .row()
    .text('💬 自动回复内容', 'cfg_set_auto_reply_text')
    .text('🎚️ 自动回复开关', 'cfg_set_auto_reply_enabled')
    .row()
    .text('🔘 欢迎按钮', 'cfg_set_inline_buttons')
    .text('🔘 广播按钮', 'cfg_set_broadcast_buttons')
    .row()
    .text('👁️ 预览欢迎消息', 'cfg_preview')
    .row()
    .text('🔙 恢复默认配置', 'cfg_reset_all')
    .text('← 返回主菜单', 'back_to_menu');
}

function buildCancelKeyboard() {
  return new InlineKeyboard()
    .text('← 返回菜单', 'back_to_menu');
}

function buildBroadcastButtonsControls(adminId, currentButtons) {
  const kb = new InlineKeyboard()
    .text('➕ 新增/替换一个按钮', `tmp_btn_set|${adminId}`)
    .text('🗑️ 清空所有按钮', `tmp_btn_clear|${adminId}`)
    .row()
    .text('👁️ 预览广播效果', `tmp_btn_preview|${adminId}`)
    .text('✅ 用当前按钮继续', `tmp_btn_continue|${adminId}`)
    .row()
    .text('← 返回菜单', 'back_to_menu');
  return {
    keyboard: kb,
    buttonsText: stringifyButtons(currentButtons),
  };
}

module.exports = {
  buildInlineKeyboard,
  buildWelcomeText,
  buildAutoReplyText,
  buildUserInfo,
  buildAdminBroadcastKeyboard,
  buildCancelKeyboard,
  buildSettingsMenu,
  buildBroadcastButtonsControls,
  stringifyButtons,
  parseButtonsArray,
  parseButtonsFriendly,
  escapeHtml,
  unescapeNewlines,
  getEffectiveInlineButtons,
  getEffectiveBroadcastButtons,
  getEffectiveWelcomeTitle,
  getEffectiveWelcomeMessage,
  getEffectiveWelcomeStatus,
  getEffectiveWelcomeImageUrl,
  getEffectiveWelcomeStickerId,
  getEffectiveWelcomePremiumEmojiId,
  getEffectiveWelcomePremiumEmojiText,
  getEffectiveStatusCheckEmojiId,
  getEffectiveStatusGlobeEmojiId,
  getEffectiveStatusBellEmojiId,
  getEffectiveQuoteLockEmojiId,
  getEffectiveHeartEmojiId,
  getEffectiveFooterGlobeEmojiId,
  getEffectiveWelcomeFooter,
  getEffectiveAutoReplyEnabled,
  getEffectiveAutoReplyText,
  getEffectiveAutoReplyBotEmojiId,
  renderMaybePremium,
};
