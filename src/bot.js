const { Bot, GrammyError, HttpError } = require('grammy');
const { config, isAdmin } = require('./config');
const {
  addUser,
  getAllUsers,
  getUserCount,
  createSession,
  getSession,
  deleteSession,
  isVercel,
  getSetting,
  setSetting,
  getAllSettings,
  getTempBroadcast,
  setTempBroadcast,
  clearTempBroadcast,
} = require('./storage');
const {
  buildInlineKeyboard,
  buildWelcomeText,
  buildUserInfo,
  buildAdminBroadcastKeyboard,
  buildCancelKeyboard,
  buildSettingsMenu,
  buildBroadcastButtonsControls,
  stringifyButtons,
  parseButtonsArray,
  escapeHtml,
  getEffectiveInlineButtons,
  getEffectiveBroadcastButtons,
  getEffectiveWelcomeImageUrl,
  getEffectiveWelcomeStickerId,
} = require('./helpers');

if (!config.botToken) {
  console.error('❌ 致命错误: BOT_TOKEN 环境变量未配置！请先设置 .env 文件或环境变量。');
  console.error('   请从 @BotFather 获取 Token 后再启动。');
  process.exit(1);
}

if (config.adminIds.length === 0) {
  console.warn('⚠️  警告: ADMIN_IDS 环境变量为空，没有设置管理员！');
  console.warn('   用户消息将无法转发给任何人，请尽快配置管理员 ID。');
}

const bot = new Bot(config.botToken);

const adminMode = new Map();

async function safeSetMyCommands() {
  try {
    await bot.api.setMyCommands([
      { command: 'start', description: '启动机器人 / 开始会话' },
      { command: 'menu', description: '打开管理员菜单（仅管理员）' },
      { command: 'help', description: '帮助信息' },
      { command: 'cancel', description: '取消当前操作' },
    ]);
  } catch (e) {
    console.warn('设置命令列表失败（可忽略）:', e.message);
  }
}
safeSetMyCommands();

function getAdminMode(adminId) {
  return adminMode.get(String(adminId)) || { mode: null, data: {} };
}
function setAdminMode(adminId, mode, data = {}) {
  adminMode.set(String(adminId), { mode, data, at: Date.now() });
}
function clearAdminMode(adminId) {
  adminMode.delete(String(adminId));
}

bot.command('start', async (ctx) => {
  try {
    const from = ctx.from;
    if (from) {
      try {
        addUser(from.id, from.username, from.first_name, from.last_name);
      } catch (e) {
        console.warn('记录用户失败（不影响使用）:', e.message);
      }
    }

    try { clearAdminMode(ctx.from?.id); } catch (_) {}

    if (isAdmin(ctx.from?.id)) {
      let userCount = 0;
      try { userCount = getUserCount(); } catch (_) {}
      await ctx.reply(`🎛️ 管理员控制台\n\n当前用户数：${userCount} 人${isVercel ? '\n\n⚠️ 当前环境：Vercel Serverless\n冷启动数据会重置，用户量大请改用 aapanel 部署。' : ''}\n\n⚙️ 新增功能：配置管理 → 直接在 Telegram 改欢迎消息、按钮，不用去 Vercel 重部署！`, {
        reply_markup: buildAdminBroadcastKeyboard(userCount),
      });
      return;
    }

    let welcomeText = '';
    try { welcomeText = buildWelcomeText(ctx); } catch (e) {
      console.error('生成欢迎文字失败:', e.message);
      welcomeText = '👋 你好！直接发消息给我就能联系客服啦～';
    }
    let replyMarkup = undefined;
    try {
      const btns = getEffectiveInlineButtons();
      replyMarkup = buildInlineKeyboard(btns);
    } catch (e) {
      console.error('生成欢迎按钮失败:', e.message);
    }
    let stickerId = '';
    try { stickerId = getEffectiveWelcomeStickerId(); } catch (_) {}
    let imageUrl = '';
    try { imageUrl = getEffectiveWelcomeImageUrl(); } catch (_) {}

    if (stickerId) {
      try {
        await ctx.replyWithSticker(stickerId);
      } catch (e) {
        console.error('欢迎贴纸发送失败，已跳过:', e.message);
      }
    }

    if (imageUrl) {
      try {
        await ctx.replyWithPhoto(imageUrl, {
          caption: welcomeText,
          parse_mode: 'HTML',
          reply_markup: replyMarkup,
          show_caption_above_media: true,
        });
        return;
      } catch (e) {
        console.error('欢迎图片发送失败，改用纯文字:', e.message);
      }
    }

    await ctx.reply(welcomeText, {
      parse_mode: 'HTML',
      reply_markup: replyMarkup,
    });
  } catch (bigE) {
    console.error('[FATAL] /start 处理失败:', bigE && bigE.stack ? bigE.stack : bigE);
    try {
      await ctx.reply('👋 你好！直接发送任意文字/图片/文件给我就能联系客服啦～\n（欢迎消息样式解析出了小问题，已自动降级）');
    } catch (_) {}
  }
});

bot.command('menu', async (ctx) => {
  if (!isAdmin(ctx.from?.id)) {
    await ctx.reply('❌ 你没有权限使用此命令。');
    return;
  }
  clearAdminMode(ctx.from.id);
  const userCount = getUserCount();
  await ctx.reply(`🎛️ 管理员控制台\n\n当前用户数：${userCount} 人`, {
    reply_markup: buildAdminBroadcastKeyboard(userCount),
  });
});

bot.command('help', async (ctx) => {
  const isAdm = isAdmin(ctx.from?.id);
  const lines = [
    '📖 机器人使用说明',
    '',
    '【用户】',
    '  • /start - 启动机器人，建立会话',
    '  • 直接发送文字/图片/文件/贴纸/语音即可联系客服',
    '',
  ];
  if (isAdm) {
    lines.push('【管理员】');
    lines.push('  • /menu - 打开管理员控制台');
    lines.push('  • 收到转发消息后，直接"回复"那条消息，内容会送给用户');
    lines.push('  • 📢 广播文字/图片 - 向所有用户群发');
    lines.push('  • 📌 置顶消息 - 在当前聊天发送并置顶一条消息');
    lines.push('  • /cancel - 取消广播等待确认操作');
    lines.push('');
  }
  await ctx.reply(lines.join('\n'));
});

bot.command('cancel', async (ctx) => {
  clearAdminMode(ctx.from?.id);
  await ctx.reply('✅ 已取消当前操作。' + (isAdmin(ctx.from?.id) ? '' : ''), {
    reply_markup: isAdmin(ctx.from?.id) ? buildAdminBroadcastKeyboard(getUserCount()) : undefined,
  });
});

bot.callbackQuery('back_to_menu', async (ctx) => {
  if (!isAdmin(ctx.from?.id)) {
    await ctx.answerCallbackQuery('无权限');
    return;
  }
  clearAdminMode(ctx.from.id);
  setTempBroadcast(ctx.from.id, null);
  await ctx.answerCallbackQuery();
  const userCount = getUserCount();
  try {
    await ctx.editMessageText(`🎛️ 管理员控制台\n\n当前用户数：${userCount} 人`, {
      reply_markup: buildAdminBroadcastKeyboard(userCount),
    });
  } catch {}
});

bot.callbackQuery('settings_menu', async (ctx) => {
  if (!isAdmin(ctx.from?.id)) { await ctx.answerCallbackQuery('无权限'); return; }
  clearAdminMode(ctx.from.id);
  await ctx.answerCallbackQuery();
  const settings = getAllSettings();
  const settingsList = Object.keys(settings).length === 0 ? '（空，使用 Vercel 环境变量默认配置）' :
    Object.entries(settings).map(([k,v]) => {
      const val = typeof v === 'string' && v.length > 40 ? v.slice(0, 40) + '...' : JSON.stringify(v);
      return `  • ${escapeHtml(k)} = ${escapeHtml(String(val))}`;
    }).join('\n');
  const help = `⚙️ 配置管理（直接在 Telegram 改，不用去 Vercel 重部署！）\n\n📦 当前持久化的设置：\n${settingsList}\n\n💡 改完之后可以点「👁️ 预览欢迎消息」立即看效果。\n⚠️ 注意：如果部署在 Vercel，冷启动后存储会重置，重要配置请同时在 Vercel Environment Variables 里也填一下（双保险）。\n\n你想改哪个？点下面按钮：`;
  try {
    await ctx.editMessageText(help, { reply_markup: buildSettingsMenu(), parse_mode: 'HTML' });
  } catch {
    await ctx.reply(help, { reply_markup: buildSettingsMenu(), parse_mode: 'HTML' });
  }
});

const CFG_KEYS = {
  cfg_set_title: { key: 'welcome_title', name: '欢迎消息标题', example: '你好，悠米', type: 'text' },
  cfg_set_message: { key: 'welcome_message', name: '欢迎消息主内容', example: '专属会话已建立\\n\\n请直接发消息咨询', type: 'text' },
  cfg_set_status: { key: 'welcome_status', name: '欢迎消息底部状态', example: '✅ 在线接收\\n🔔 通知开启', type: 'text' },
  cfg_set_image: { key: 'welcome_image_url', name: '欢迎图片 URL', example: 'https://example.com/welcome.png', type: 'text' },
  cfg_set_sticker: { key: 'welcome_sticker_id', name: '欢迎动画贴纸 file_id', example: 'CAACAgIAAxkBAA...', type: 'text' },
  cfg_set_premium_emoji: { key: 'welcome_premium_emoji_id', name: '标题前高级表情（Premium）', example: '6170277659566676368|✨', type: 'premium_emoji' },
  cfg_set_quote_lock: { key: 'quote_lock_emoji_id', name: '引用框🔒图标（Premium）', example: '6170277659566676368|🔒', type: 'premium_emoji' },
  cfg_set_status_check: { key: 'status_check_emoji_id', name: '✅对号图标（Premium）', example: '6170277659566676368|✅', type: 'premium_emoji' },
  cfg_set_status_globe: { key: 'status_globe_emoji_id', name: '🌐地球图标（Premium）', example: '6170277659566676368|🌐', type: 'premium_emoji' },
  cfg_set_status_bell: { key: 'status_bell_emoji_id', name: '🔔铃铛图标（Premium）', example: '6170277659566676368|🔔', type: 'premium_emoji' },
  cfg_set_inline_buttons: { key: 'inline_buttons', name: '欢迎按钮（JSON数组）', example: '[{"text":"按钮","url":"https://example.com"}]', type: 'buttons_json' },
  cfg_set_broadcast_buttons: { key: 'broadcast_buttons', name: '广播按钮（JSON数组）', example: '[{"text":"点击查看","url":"https://example.com"}]', type: 'buttons_json' },
};

for (const [cbId, cfg] of Object.entries(CFG_KEYS)) {
  bot.callbackQuery(cbId, async (ctx) => {
    if (!isAdmin(ctx.from?.id)) { await ctx.answerCallbackQuery('无权限'); return; }
    setAdminMode(ctx.from.id, 'cfg_set_' + cfg.key, { type: cfg.type });
    await ctx.answerCallbackQuery();
    const current = getSetting(cfg.key, '(空)');
    const example = cfg.example;
    let help = '';
    if (cfg.type === 'buttons_json') {
      help = `🔘 设置 ${cfg.name}\n\n✅ 两种写法任选一种（都支持！）：\n\n【写法1 —— 推荐，简单，一行一个按钮】\n按钮文字1|https://链接1\n按钮文字2|https://链接2\n\n【想要一行放多个按钮？】写在同一行，中间用 空格|空格 隔开：\n按钮1|https://a.com | 按钮2|https://b.com\n\n【想要手动换行？】空一行 或 写一行 --- ：\n按钮1|a.com\n按钮2|b.com\n\n按钮3|c.com\n\n【写法2 —— 标准JSON二维数组（精确控制行）】\n[[{"text":"按钮1","url":"https://a.com"},{"text":"按钮2","url":"https://b.com"}],[{"text":"按钮3","url":"https://c.com"}]]\n\n📌 当前值：\n${escapeHtml(JSON.stringify(current))}\n\n💡 示例：\n${escapeHtml(example)}\n\n📝 请直接发送上面任一种格式的内容（发送后立即生效）：\n或点「← 返回菜单」取消操作。`;
    } else if (cfg.type === 'premium_emoji') {
      help = `🌟 设置Premium自定义表情+替代文字\n\n📋 使用步骤：\n1️⃣ 在 Telegram 😀 Emoji 面板选你要的 Premium 表情（比如 Flags 那个盾牌），把它当作文字发到任意聊天\n2️⃣ 长按那条消息 → 转发 → 选 @RawDataBot\n3️⃣ 在 RawDataBot 返回的 JSON 里找：\n   entities[...]\n     └ type: "custom_emoji"\n     └ custom_emoji_id: "1234567890abcdef"  ← 复制这串数字\n4️⃣ 按「custom_emoji_id|替代文字」格式发出来（| 前面是那串 id，| 后面是老客户端降级显示的 emoji ）\n\n📝 正确格式示例：\n${escapeHtml(example)}\n\n📌 当前值：\n${escapeHtml(JSON.stringify(current))}\n\n请直接发送要设置的新值（格式：id|文字），或点「← 返回菜单」取消：`;
    } else if (cfg.key === 'welcome_message') {
      help = `✉️ 设置 ${cfg.name}\n\n💡 提示（非常重要）：\n  • 第一行会显示成 🔒 标题（放在引用框外面）\n  • 从第二行开始，所有内容都会放在下面的引用矩形框里！\n  • 你要的【只引用正文那段】，就像下面这样写：\n\n专属会话已建立\n请直接发送需要咨询的文字、图片、文件或其他内容，客服人员收到后会尽快回复。\n\n📌 上面的效果就是：\n🔒 专属会话已建立\n╭──────────────────────────────────╮\n│ 请直接发送需要咨询的文字、...  │\n╰──────────────────────────────────╯\n\n📌 当前值：\n${escapeHtml(JSON.stringify(current))}\n\n💡 示例：\n${escapeHtml(example)}\n\n请直接发送新内容（用 \\n 表示换行，或直接 Enter 换行都行），或点「← 返回菜单」取消：`;
    } else if (cfg.key === 'welcome_image_url') {
      help = `🖼️ 设置 ${cfg.name}\n\n💡 正确格式要求：\n1️⃣ 必须是公网 https:// 开头（不能 http:// / 内网 / localhost）\n2️⃣ 必须是直链到图片文件本身（后缀 .png / .jpg / .jpeg / .webp / .gif）\n3️⃣ 不能是网页！比如百度网盘 / 图床相册页都是错的\n\n✅ 最简单获取方法：\n   → 打开 https://telegra.ph （不用注册）\n   → 正文里粘贴/上传你的图\n   → 图加载完成后，右键那图 → "复制图片地址" 粘贴到这里\n\n❌ 错误示例：\n   https://pan.baidu.com/xxxxx （网盘页，不是图！）\n   http://localhost/a.png （本地地址，公网看不到）\n\n📌 当前值：\n${escapeHtml(JSON.stringify(current))}\n\n💡 示例：\n${escapeHtml(example)}\n\n请直接发送新的 URL，或点「← 返回菜单」取消（留空就是不显示欢迎图）：`;
    } else if (cfg.key === 'welcome_sticker_id') {
      help = `🐻 设置 ${cfg.name}\n\n💡 贴纸 vs Premium 表情（非常重要！别搞混）：\n  🐻 Sticker 贴纸（独立大的整张图，动态）→ 填这里，用 sticker.file_id\n  😀 Emoji 面板里的 Premium 小图标（嵌在文字里）→ 用「🌟 高级表情(Premium)」按钮\n\n📋 获取 file_id 步骤：\n1️⃣ 聊天输入框点 🐻 贴纸图标（不是 😀！），选一个动态贴纸，发送\n2️⃣ 长按那条贴纸消息 → 转发 → 选 @RawDataBot\n3️⃣ 在返回的 JSON 里找 sticker.file_id（CAAC... 开头的一长串）复制\n\n📌 当前值：\n${escapeHtml(JSON.stringify(current))}\n\n💡 示例：\n${escapeHtml(example)}\n\n请直接发送 file_id（CAAC... 长串），或点「← 返回菜单」取消：`;
    } else {
      help = `✏️ 设置 ${cfg.name}\n\n📌 当前值：\n${escapeHtml(JSON.stringify(current))}\n\n💡 示例：\n${escapeHtml(example)}\n\n请直接发送要设置的新值，或点「← 返回菜单」取消：`;
    }
    try {
      await ctx.editMessageText(help, { reply_markup: buildCancelKeyboard(), parse_mode: 'HTML' });
    } catch {
      await ctx.reply(help, { reply_markup: buildCancelKeyboard(), parse_mode: 'HTML' });
    }
  });
}

bot.callbackQuery('cfg_preview', async (ctx) => {
  if (!isAdmin(ctx.from?.id)) { await ctx.answerCallbackQuery('无权限'); return; }
  await ctx.answerCallbackQuery();
  try { await ctx.deleteMessage(); } catch {}
  const welcomeText = buildWelcomeText(ctx);
  const replyMarkup = buildInlineKeyboard(getEffectiveInlineButtons());
  const stickerId = getEffectiveWelcomeStickerId();
  const imageUrl = getEffectiveWelcomeImageUrl();
  if (stickerId) {
    try { await ctx.replyWithSticker(stickerId); } catch (e) {
      await ctx.reply(`❌ 欢迎贴纸发送失败: ${escapeHtml(e.message)}（可能 file_id 无效）`);
    }
  }
  if (imageUrl) {
    try {
      await ctx.replyWithPhoto(imageUrl, {
        caption: welcomeText,
        parse_mode: 'HTML',
        reply_markup: replyMarkup,
        show_caption_above_media: true,
      });
      return;
    } catch (e) {
      await ctx.reply(`❌ 欢迎图片发送失败: ${e.message || String(e)}（可能 URL 无效）\n\n💡 提示：\n1. 必须是公网可直接访问的 URL（不能是本地局域网/内网 IP，不能是 localhost）\n2. 必须是公开图片，不需要登录就能打开\n3. 必须是直链到图片本身（.png/.jpg/.webp 结尾），不能是百度网盘/相册页面这种网页\n4. 最简单方法：把图上传到 https://telegra.ph 或 https://postimages.org ，上传完右键「复制图片地址」贴到这里`);
    }
  }
  await ctx.reply(welcomeText, { parse_mode: 'HTML', reply_markup: replyMarkup });
});

bot.callbackQuery('cfg_reset_all', async (ctx) => {
  if (!isAdmin(ctx.from?.id)) { await ctx.answerCallbackQuery('无权限'); return; }
  const keysToRemove = ['welcome_title','welcome_message','welcome_status','welcome_image_url','welcome_sticker_id','welcome_premium_emoji_id','welcome_premium_emoji_text','status_check_emoji_id','status_globe_emoji_id','status_bell_emoji_id','quote_lock_emoji_id','inline_buttons','broadcast_buttons'];
  for (const k of keysToRemove) setSetting(k, '');
  await ctx.answerCallbackQuery('✅ 已恢复默认（使用 Vercel 环境变量配置）');
  const userCount = getUserCount();
  try {
    await ctx.editMessageText(`🎛️ 管理员控制台\n\n当前用户数：${userCount} 人`, { reply_markup: buildAdminBroadcastKeyboard(userCount) });
  } catch {
    await ctx.reply(`🎛️ 管理员控制台\n\n当前用户数：${userCount} 人`, { reply_markup: buildAdminBroadcastKeyboard(userCount) });
  }
});

async function showBroadcastButtonsPage(ctx, modeLabel) {
  const adminId = String(ctx.from.id);
  const current = getEffectiveBroadcastButtons();
  const buttonsArr = Array.isArray(current) && current.length > 0 && Array.isArray(current[0])
    ? current
    : parseButtonsFriendly(JSON.stringify(current)) || parseButtonsArray(JSON.stringify(current)) || [];
  setTempBroadcast(adminId, { buttons: buttonsArr, modeLabel });
  const ctrl = buildBroadcastButtonsControls(adminId, Array.isArray(buttonsArr) && buttonsArr.length > 0 && Array.isArray(buttonsArr[0]) ? buttonsArr.flat() : buttonsArr);
  let userCount = 0;
  try { userCount = getUserCount(); } catch (_) {}
  await ctx.editMessageText(`${modeLabel}\n共 ${userCount} 位用户将收到\n\n🔘 当前广播底部按钮配置：\n${ctrl.buttonsText}\n\n✨ 你可以在这里临时改这一次广播要用的按钮（改完点 ✅ 继续发送），也可以点 ➕ 替换按钮。如果想要永久性修改，请用「⚙️ 配置管理」改。\n\n准备好之后点：\n  ✅ 用当前按钮继续 → 下一步发送你要广播的内容`, {
    reply_markup: ctrl.keyboard,
    parse_mode: 'HTML',
  });
}

bot.callbackQuery('broadcast_text', async (ctx) => {
  if (!isAdmin(ctx.from?.id)) { await ctx.answerCallbackQuery('无权限'); return; }
  const userCount = getUserCount();
  if (isVercel && userCount > 200) {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(`⚠️ 检测到用户数 ${userCount} 超过了 Vercel 无服务器的广播上限（200 人）。\n\n请改用 aapanel 部署方式执行大量用户广播，否则会被 Vercel 超时中断。\n\n小批量测试请先 /start 清除状态再试。`, {
      reply_markup: buildCancelKeyboard(),
    });
    return;
  }
  await ctx.answerCallbackQuery();
  setAdminMode(ctx.from.id, 'broadcast_buttons_wait', { nextMode: 'broadcast_text' });
  await showBroadcastButtonsPage(ctx, '📢 广播文字配置');
});

bot.callbackQuery('broadcast_photo', async (ctx) => {
  if (!isAdmin(ctx.from?.id)) { await ctx.answerCallbackQuery('无权限'); return; }
  const userCount = getUserCount();
  if (isVercel && userCount > 200) {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(`⚠️ 检测到用户数 ${userCount} 超过了 Vercel 无服务器的广播上限（200 人）。\n\n图片广播更慢，请用 aapanel 部署方式。`, {
      reply_markup: buildCancelKeyboard(),
    });
    return;
  }
  await ctx.answerCallbackQuery();
  setAdminMode(ctx.from.id, 'broadcast_buttons_wait', { nextMode: 'broadcast_photo' });
  await showBroadcastButtonsPage(ctx, '🖼️ 图文广播配置');
});

bot.callbackQuery('broadcast_mixed', async (ctx) => {
  if (!isAdmin(ctx.from?.id)) { await ctx.answerCallbackQuery('无权限'); return; }
  const userCount = getUserCount();
  if (isVercel && userCount > 200) {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(`⚠️ 检测到用户数 ${userCount} 超过了 Vercel 无服务器的广播上限（200 人）。\n\n双条广播更慢，请用 aapanel 部署方式。`, {
      reply_markup: buildCancelKeyboard(),
    });
    return;
  }
  await ctx.answerCallbackQuery();
  setAdminMode(ctx.from.id, 'broadcast_buttons_wait', { nextMode: 'broadcast_mixed' });
  await showBroadcastButtonsPage(ctx, '📜 文图双条广播配置');
});

bot.callbackQuery('broadcast_smart', async (ctx) => {
  if (!isAdmin(ctx.from?.id)) { await ctx.answerCallbackQuery('无权限'); return; }
  const userCount = getUserCount();
  if (isVercel && userCount > 200) {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(`⚠️ 检测到用户数 ${userCount} 超过了 Vercel 无服务器的广播上限（200 人）。\n\n请用 aapanel 部署方式。`, {
      reply_markup: buildCancelKeyboard(),
    });
    return;
  }
  await ctx.answerCallbackQuery();
  setAdminMode(ctx.from.id, 'broadcast_buttons_wait', { nextMode: 'broadcast_smart' });
  await showBroadcastButtonsPage(ctx, '🎯 智能广播配置');
});

async function handleTempBroadcastCallback(ctx, action, adminId) {
  adminId = String(adminId);
  const state = getTempBroadcast(adminId) || {};
  let currentButtons = state.buttons || getEffectiveBroadcastButtons();

  if (action === 'tmp_btn_clear') {
    currentButtons = [];
    setTempBroadcast(adminId, { ...state, buttons: currentButtons });
  } else if (action === 'tmp_btn_set') {
    setAdminMode(adminId, 'tmp_btn_set_text', { returnTo: 'broadcast_buttons_page' });
    await ctx.answerCallbackQuery();
    try {
      await ctx.editMessageText(`➕ 临时修改【本次广播】的按钮（只生效这一次，不会影响永久配置）\n\n✅ 支持 2 种格式，任选其一：\n\n【写法1 —— 最简单】一行一个按钮：\n按钮文字|https://链接1\n按钮文字2|https://链接2\n\n【想要一行放多个按钮？】写在同一行，中间用 空格|空格 隔开：\n按钮1|https://a.com | 按钮2|https://b.com\n\n【想要换行（按钮下一行）？】空一行 或 写一行 --- ：\n按钮1|a.com\n按钮2|b.com\n---\n按钮3|c.com\n\n【写法2 —— JSON 标准格式】\n[[{"text":"按钮1","url":"https://a.com"}]]\n\n📝 请直接发送按钮内容，发送后立即回到配置页。`, {
        reply_markup: buildCancelKeyboard(),
        parse_mode: 'HTML',
      });
    } catch {}
    return { handled: true };
  } else if (action === 'tmp_btn_preview') {
    await ctx.answerCallbackQuery();
    try { await ctx.deleteMessage(); } catch {}
    await ctx.reply('👁️ 广播预览（这就是用户收到的样子）：');
    try {
      await ctx.reply('这是一条示例广播内容，下方按钮就是当前配置的广播按钮。', {
        reply_markup: buildInlineKeyboard(currentButtons),
      });
    } catch (e) {
      await ctx.reply(`❌ 预览发送失败: ${escapeHtml(e.message)}（按钮 JSON 格式错了？）`);
    }
    const ctrl = buildBroadcastButtonsControls(adminId, currentButtons);
    const userCount = getUserCount();
    await ctx.reply(`${state.modeLabel || '📢 广播配置'}\n共 ${userCount} 位用户将收到\n\n🔘 当前广播底部按钮配置：\n${ctrl.buttonsText}\n\n继续配置或点 ✅ 继续发送内容：`, {
      reply_markup: ctrl.keyboard,
      parse_mode: 'HTML',
    });
    return { handled: true };
  } else if (action === 'tmp_btn_continue') {
    const adminState = getAdminMode(adminId);
    const nextMode = adminState.data && adminState.data.nextMode ? adminState.data.nextMode : 'broadcast_text';
    clearAdminMode(adminId);
    const userCount = getUserCount();
    setTempBroadcast(adminId, { buttons: currentButtons, modeLabel: state.modeLabel, active: true });
    await ctx.answerCallbackQuery();
    if (nextMode === 'broadcast_text') {
      setAdminMode(adminId, 'broadcast_text');
      await ctx.editMessageText(`✏️ 请发送要广播的文字内容（支持换行+表情，自动转义 HTML 特殊字符）：\n\n⚠️ 需要文字+图片一起发？请改用「🖼️ 图文广播」或「📜 文图双条广播」\n\n共 ${userCount} 位用户将收到\n\n随时可点击下方返回取消：`, {
        reply_markup: buildCancelKeyboard(),
      });
    } else if (nextMode === 'broadcast_photo') {
      setAdminMode(adminId, 'broadcast_photo');
      await ctx.editMessageText(`🖼️ 请发送要广播的图片（📝 可以附带文字说明，会自动和图片一起显示在图片下方）：\n\n✅ 这就是「图文一起广播」！\n共 ${userCount} 位用户将收到\n\n（想文字和图片分成两条独立消息的，请改用「📜 文图双条广播」）`, {
        reply_markup: buildCancelKeyboard(),
      });
    } else if (nextMode === 'broadcast_mixed') {
      setAdminMode(adminId, 'broadcast_mixed_1');
      await ctx.editMessageText(`📜 文图双条广播（分两条独立消息发送，文字长度不受限制）\n\n第 1 步：请先发送要广播的「文字内容」（单独文字，不要带图）：\n\n共 ${userCount} 位用户将收到`, {
        reply_markup: buildCancelKeyboard(),
      });
    } else if (nextMode === 'broadcast_smart') {
      setAdminMode(adminId, 'broadcast_smart');
      await ctx.editMessageText(`🎯 智能广播：你发什么，我就原样广播什么（自动附带底部按钮）\n\n✅ 支持 文字 / 图片+caption / 文档 / 贴纸 / 视频 / 语音 / 位置 / 联系人\n\n请发送你要广播的内容：\n共 ${userCount} 位用户将收到`, {
        reply_markup: buildCancelKeyboard(),
      });
    }
    return { handled: true };
  }

  setTempBroadcast(adminId, { ...state, buttons: currentButtons });
  const ctrl = buildBroadcastButtonsControls(adminId, currentButtons);
  try {
    await ctx.editMessageText(`${state.modeLabel || '📢 广播配置'}\n共 ${getUserCount()} 位用户将收到\n\n🔘 当前广播底部按钮配置：\n${ctrl.buttonsText}\n\n继续配置：`, {
      reply_markup: ctrl.keyboard,
      parse_mode: 'HTML',
    });
  } catch {}
  await ctx.answerCallbackQuery();
  return { handled: true };
}

bot.callbackQuery('back_to_menu', async (ctx) => {
  if (!isAdmin(ctx.from?.id)) { await ctx.answerCallbackQuery('无权限'); return; }
  clearAdminMode(ctx.from.id);
  try { clearTempBroadcast(String(ctx.from.id)); } catch (_) {}
  await ctx.answerCallbackQuery();
  let userCount = 0;
  try { userCount = getUserCount(); } catch (_) {}
  try {
    await ctx.editMessageText(`🎛️ 管理员控制台\n\n当前用户数：${userCount} 人${isVercel ? '\n\n⚠️ 当前环境：Vercel Serverless\n冷启动数据会重置，用户量大请改用 aapanel 部署。' : ''}\n\n⚙️ 配置管理 → 直接在 Telegram 改欢迎消息、按钮，不用去 Vercel 重部署！`, {
      reply_markup: buildAdminBroadcastKeyboard(userCount),
    });
  } catch {
    try {
      await ctx.reply(`🎛️ 管理员控制台\n\n当前用户数：${userCount} 人${isVercel ? '\n\n⚠️ 当前环境：Vercel Serverless\n冷启动数据会重置，用户量大请改用 aapanel 部署。' : ''}\n\n⚙️ 配置管理 → 直接在 Telegram 改欢迎消息、按钮，不用去 Vercel 重部署！`, {
        reply_markup: buildAdminBroadcastKeyboard(userCount),
      });
    } catch {}
  }
});

bot.callbackQuery('cancel_action', async (ctx) => {
  if (!isAdmin(ctx.from?.id)) { await ctx.answerCallbackQuery('无权限'); return; }
  clearAdminMode(ctx.from.id);
  try { clearTempBroadcast(String(ctx.from.id)); } catch (_) {}
  await ctx.answerCallbackQuery();
  let userCount = 0;
  try { userCount = getUserCount(); } catch (_) {}
  try {
    await ctx.editMessageText(`🎛️ 管理员控制台\n\n当前用户数：${userCount} 人${isVercel ? '\n\n⚠️ 当前环境：Vercel Serverless\n冷启动数据会重置，用户量大请改用 aapanel 部署。' : ''}`, {
      reply_markup: buildAdminBroadcastKeyboard(userCount),
    });
  } catch {
    try {
      await ctx.reply(`🎛️ 管理员控制台\n\n当前用户数：${userCount} 人${isVercel ? '\n\n⚠️ 当前环境：Vercel Serverless\n冷启动数据会重置，用户量大请改用 aapanel 部署。' : ''}`, {
        reply_markup: buildAdminBroadcastKeyboard(userCount),
      });
    } catch {}
  }
});

const tmpBtnRegex = /^(tmp_btn_set|tmp_btn_clear|tmp_btn_preview|tmp_btn_continue)\|(.+)$/;
bot.on('callback_query', async (ctx, next) => {
  try {
    if (!ctx || !ctx.callbackQuery) return next && typeof next === 'function' ? next() : undefined;
    const data = ctx.callbackQuery && ctx.callbackQuery.data ? String(ctx.callbackQuery.data) : '';
    if (!data) return next && typeof next === 'function' ? next() : undefined;
    const m = data.match(tmpBtnRegex);
    if (m && isAdmin(ctx.from?.id)) {
      const [, action, adminId] = m;
      if (String(adminId) === String(ctx.from.id)) {
        const ret = await handleTempBroadcastCallback(ctx, action, adminId);
        if (ret && ret.handled) return;
      }
    }
    if (data.startsWith('cfg_set_') || data === 'cfg_preview' || data === 'cfg_reset_all' || data === 'settings_menu'
        || data === 'broadcast_text' || data === 'broadcast_photo' || data === 'broadcast_mixed' || data === 'broadcast_smart'
        || data === 'pin_message' || data === 'user_stats') {
      return next && typeof next === 'function' ? next() : undefined;
    }
    return next && typeof next === 'function' ? next() : undefined;
  } catch (e) {
    console.error('[callback_query 中间件异常]', e && e.stack ? e.stack : e);
    try { await ctx.answerCallbackQuery({ text: '操作出错了，请返回菜单重试', show_alert: true }); } catch (_) {}
    return next && typeof next === 'function' ? next() : undefined;
  }
});

bot.on('callback_query', async (ctx, next) => {
  try {
    if (!ctx.callbackQuery) return next && typeof next === 'function' ? next() : undefined;
    const data = ctx.callbackQuery && ctx.callbackQuery.data ? String(ctx.callbackQuery.data) : '';
    if (!data) return next && typeof next === 'function' ? next() : undefined;
    console.log('[DEBUG callback_query] from=', ctx.from && ctx.from.id, 'data=', data, 'isAdmin=', isAdmin(ctx.from?.id));
    const adminId = String(ctx.from?.id || '');
    const adm = getAdminMode(adminId);
    if (adm && adm.mode === 'broadcast_buttons_wait' && data === 'back_to_menu') {
      clearAdminMode(adminId);
      try { clearTempBroadcast(adminId); } catch (_) {}
      let userCount = 0;
      try { userCount = getUserCount(); } catch (_) {}
      await ctx.answerCallbackQuery();
      try {
        await ctx.editMessageText(`🎛️ 管理员控制台\n\n当前用户数：${userCount} 人${isVercel ? '\n\n⚠️ 当前环境：Vercel Serverless\n冷启动数据会重置，用户量大请改用 aapanel 部署。' : ''}`, {
          reply_markup: buildAdminBroadcastKeyboard(userCount),
        });
      } catch {}
      return;
    }
    return next && typeof next === 'function' ? next() : undefined;
  } catch (e) {
    console.error('[callback_query 兜底中间件异常]', e && e.stack ? e.stack : e);
    return next && typeof next === 'function' ? next() : undefined;
  }
});

bot.callbackQuery('pin_message', async (ctx) => {
  if (!isAdmin(ctx.from?.id)) { await ctx.answerCallbackQuery('无权限'); return; }
  setAdminMode(ctx.from.id, 'pin_message');
  await ctx.answerCallbackQuery();
  await ctx.editMessageText('📌 请发送要置顶的消息（文字或图片，附带按钮）：\n\n发送后将自动在本聊天中置顶。', {
    reply_markup: buildCancelKeyboard(),
  });
});

bot.callbackQuery('user_stats', async (ctx) => {
  if (!isAdmin(ctx.from?.id)) { await ctx.answerCallbackQuery('无权限'); return; }
  await ctx.answerCallbackQuery();
  const count = getUserCount();
  const users = getAllUsers();
  let statsText = `📊 用户统计\n\n👥 总用户数：${count} 人\n${isVercel ? '⚠️ 环境: Vercel Serverless（冷启动数据会重置）\n' : ''}\n`;
  if (users.length > 0) {
    statsText += '\n最近用户列表：\n';
    const recent = users.slice(-15).reverse();
    for (const u of recent) {
      const name = [u.firstName, u.lastName].filter(Boolean).join(' ') || '未知';
      statsText += `  • ${escapeHtml(name)}${u.username ? ' (@' + escapeHtml(u.username) + ')' : ''} | ID: ${u.id}\n`;
    }
  }
  try {
    await ctx.editMessageText(statsText, {
      reply_markup: buildAdminBroadcastKeyboard(count),
    });
  } catch (e) {
    await ctx.reply(statsText, { reply_markup: buildAdminBroadcastKeyboard(count) });
  }
});

function parseButtonsFriendly(rawText) {
  if (!rawText) return [];
  const text = rawText.trim();
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

bot.on('message', async (ctx, next) => {
  const fromId = ctx.from?.id;
  if (!fromId) return next();

  if (isAdmin(fromId)) {
    const state = getAdminMode(fromId);

    if (state.mode && state.mode.startsWith('cfg_set_')) {
      const key = state.mode.slice('cfg_set_'.length);
      const type = state.data && state.data.type ? state.data.type : 'text';
      let value = ctx.message.text || '';
      if (type === 'buttons_json') {
        value = parseButtonsFriendly(ctx.message.text) || [];
      } else if (type === 'premium_emoji') {
        const raw = ctx.message.text || '';
        const idx = raw.indexOf('|');
        if (idx >= 0) {
          const emojiId = raw.slice(0, idx).trim();
          const emojiText = raw.slice(idx + 1).trim() || '✨';
          setSetting('welcome_premium_emoji_text', emojiText);
          value = emojiId;
        } else {
          value = raw.trim();
        }
      }
      setSetting(key, type === 'buttons_json' ? JSON.stringify(value) : value);
      clearAdminMode(fromId);
      await ctx.reply(`✅ 设置成功！\n\n  Key: ${escapeHtml(key)}\n  新值: ${escapeHtml(JSON.stringify(value))}\n\n点下面预览或返回主菜单：`, {
        reply_markup: new (require('grammy').InlineKeyboard)()
          .text('👁️ 预览欢迎消息', 'cfg_preview')
          .text('← 返回菜单', 'back_to_menu'),
      });
      return;
    }

    if (state.mode === 'tmp_btn_set_text' && ctx.message.text && !ctx.message.text.startsWith('/')) {
      const parsed = parseButtonsFriendly(ctx.message.text);
      const tb = getTempBroadcast(fromId) || {};
      setTempBroadcast(fromId, { ...tb, buttons: parsed });
      clearAdminMode(fromId);
      await ctx.reply(`✅ 已设置本次广播用按钮：\n${stringifyButtons(parsed)}\n\n👉 现在点下面的「✅ 用当前按钮继续」或返回菜单：`, {
        reply_markup: (function() {
          const ctrl = buildBroadcastButtonsControls(String(fromId), parsed);
          return ctrl.keyboard;
        })(),
      });
      return;
    }

    if (state.mode === 'broadcast_text' && ctx.message.text && !ctx.message.text.startsWith('/')) {
      clearAdminMode(fromId);
      await handleBroadcastText(ctx);
      return;
    }

    if (state.mode === 'broadcast_photo' && ctx.message.photo) {
      clearAdminMode(fromId);
      await handleBroadcastPhoto(ctx);
      return;
    }

    if (state.mode === 'broadcast_mixed_1' && ctx.message.text && !ctx.message.text.startsWith('/')) {
      setAdminMode(fromId, 'broadcast_mixed_2', { text: ctx.message.text });
      await ctx.reply(`✅ 已记录文字内容：\n\n${escapeHtml(ctx.message.text)}\n\n📸 第 2 步：请发送要广播的图片（可附带 caption）：`, {
        reply_markup: buildCancelKeyboard(),
      });
      return;
    }

    if (state.mode === 'broadcast_mixed_2' && ctx.message.photo) {
      const mixedText = state.data.text || '';
      clearAdminMode(fromId);
      await handleBroadcastMixed(ctx, mixedText);
      return;
    }

    if (state.mode === 'broadcast_smart' && !(ctx.message.text && ctx.message.text.startsWith('/'))) {
      clearAdminMode(fromId);
      await handleBroadcastSmart(ctx);
      return;
    }

    if (state.mode === 'pin_message' && !(ctx.message.text && ctx.message.text.startsWith('/'))) {
      clearAdminMode(fromId);
      await handlePinMessage(ctx);
      return;
    }
  }

  await next();
});

bot.on('message', async (ctx, next) => {
  const fromId = ctx.from?.id;
  if (!fromId) return next();

  if (isAdmin(fromId)) {
    try {
      const replyTo = ctx.message.reply_to_message;
      if (replyTo && replyTo.message_id) {
        const session = getSession(replyTo.message_id);
        if (session) {
          await forwardReplyToUser(ctx, session.userId);
          return;
        }
      }
    } catch (e) {
      console.error('管理员回复用户处理失败:', e.message);
    }
  } else {
    try {
      await forwardToAdmins(ctx);
      return;
    } catch (e) {
      console.error('转发用户消息给管理员失败:', e.message);
      try {
        await ctx.reply('✅ 已收到您的消息，客服正在赶来的路上～');
      } catch (_) {}
      return;
    }
  }

  await next();
});

function getTempOrDefaultButtons(ctx) {
  const fromId = ctx.from?.id;
  if (!fromId) return getEffectiveBroadcastButtons();
  const temp = getTempBroadcast(String(fromId));
  if (temp && Array.isArray(temp.buttons) && temp.buttons.length > 0) {
    return temp.buttons;
  }
  return getEffectiveBroadcastButtons();
}
function cleanupTempButtons(ctx) {
  const fromId = ctx.from?.id;
  if (fromId) setTempBroadcast(String(fromId), null);
}

async function handleBroadcastText(ctx) {
  const rawText = ctx.message.text;
  const escapedText = escapeHtml(rawText);
  const buttons = buildInlineKeyboard(getTempOrDefaultButtons(ctx));
  const users = getAllUsers();
  let success = 0;
  let failed = 0;
  const failedUsers = [];

  const statusMsg = await ctx.reply(`📤 正在广播文字... (0/${users.length})\n\n失败后会列出失败的用户 ID。`);

  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    try {
      await ctx.api.sendMessage(user.id, escapedText, {
        parse_mode: 'HTML',
        reply_markup: buttons,
        disable_web_page_preview: false,
      });
      success++;
    } catch (e) {
      failed++;
      failedUsers.push(`${user.id} (${e.code || e.description || 'error'})`);
    }
    if ((i + 1) % 30 === 0 || i === users.length - 1) {
      try {
        await ctx.api.editMessageText(
          ctx.chat.id,
          statusMsg.message_id,
          `📤 正在广播文字... (${i + 1}/${users.length})\n成功 ${success} / 失败 ${failed}`
        );
      } catch {}
      if (i < users.length - 1) {
        await new Promise(r => setTimeout(r, 50));
      }
    }
  }

  cleanupTempButtons(ctx);

  let finalText = `✅ 文字广播完成！\n\n✅ 成功：${success} 人\n❌ 失败：${failed} 人`;
  if (failedUsers.length > 0 && failedUsers.length <= 20) {
    finalText += `\n\n失败详情：\n${failedUsers.join('\n')}`;
  } else if (failedUsers.length > 20) {
    finalText += `\n\n失败 ${failedUsers.length} 人（数量过多未展示，通常是屏蔽/删除了机器人）`;
  }
  try {
    await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, finalText, {
      reply_markup: buildAdminBroadcastKeyboard(getUserCount()),
    });
  } catch {
    await ctx.reply(finalText, { reply_markup: buildAdminBroadcastKeyboard(getUserCount()) });
  }
}

async function handleBroadcastPhoto(ctx) {
  const rawCaption = ctx.message.caption || '';
  const escapedCaption = escapeHtml(rawCaption);
  const photo = ctx.message.photo[ctx.message.photo.length - 1];
  const fileId = photo.file_id;
  const buttons = buildInlineKeyboard(getTempOrDefaultButtons(ctx));
  const users = getAllUsers();
  let success = 0;
  let failed = 0;
  const failedUsers = [];

  const statusMsg = await ctx.reply(`📤 正在广播图片+文字... (0/${users.length})`);

  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    try {
      await ctx.api.sendPhoto(user.id, fileId, {
        caption: escapedCaption || undefined,
        parse_mode: 'HTML',
        reply_markup: buttons,
      });
      success++;
    } catch (e) {
      failed++;
      failedUsers.push(`${user.id} (${e.code || e.description || 'error'})`);
    }
    if ((i + 1) % 20 === 0 || i === users.length - 1) {
      try {
        await ctx.api.editMessageText(
          ctx.chat.id,
          statusMsg.message_id,
          `📤 正在广播图片+文字... (${i + 1}/${users.length})\n成功 ${success} / 失败 ${failed}`
        );
      } catch {}
      if (i < users.length - 1) {
        await new Promise(r => setTimeout(r, 80));
      }
    }
  }

  cleanupTempButtons(ctx);

  let finalText = `✅ 图文广播完成！\n\n✅ 成功：${success} 人\n❌ 失败：${failed} 人`;
  if (failedUsers.length > 0 && failedUsers.length <= 20) {
    finalText += `\n\n失败详情：\n${failedUsers.join('\n')}`;
  }
  try {
    await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, finalText, {
      reply_markup: buildAdminBroadcastKeyboard(getUserCount()),
    });
  } catch {
    await ctx.reply(finalText, { reply_markup: buildAdminBroadcastKeyboard(getUserCount()) });
  }
}

async function handleBroadcastMixed(ctx, mixedText) {
  const photo = ctx.message.photo[ctx.message.photo.length - 1];
  const fileId = photo.file_id;
  const rawCaption = ctx.message.caption || '';
  const escapedCaption = escapeHtml(rawCaption);
  const escapedText = escapeHtml(mixedText);
  const buttons = buildInlineKeyboard(getTempOrDefaultButtons(ctx));
  const users = getAllUsers();
  let success = 0;
  let failed = 0;
  const failedUsers = [];

  const statusMsg = await ctx.reply(`📤 正在文图双条广播... (0/${users.length})\n\n第 1 条：文字\n第 2 条：图片${rawCaption ? '（含caption）' : ''}`);

  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    try {
      if (escapedText) {
        await ctx.api.sendMessage(user.id, escapedText, {
          parse_mode: 'HTML',
          disable_web_page_preview: false,
        });
      }
      await ctx.api.sendPhoto(user.id, fileId, {
        caption: escapedCaption || undefined,
        parse_mode: 'HTML',
        reply_markup: buttons,
      });
      success++;
    } catch (e) {
      failed++;
      failedUsers.push(`${user.id} (${e.code || e.description || 'error'})`);
    }
    if ((i + 1) % 15 === 0 || i === users.length - 1) {
      try {
        await ctx.api.editMessageText(
          ctx.chat.id,
          statusMsg.message_id,
          `📤 正在文图双条广播... (${i + 1}/${users.length})\n成功 ${success} / 失败 ${failed}`
        );
      } catch {}
      if (i < users.length - 1) {
        await new Promise(r => setTimeout(r, 120));
      }
    }
  }

  cleanupTempButtons(ctx);

  let finalText = `✅ 文图双条广播完成！\n\n✅ 成功：${success} 人\n❌ 失败：${failed} 人`;
  if (failedUsers.length > 0 && failedUsers.length <= 20) {
    finalText += `\n\n失败详情：\n${failedUsers.join('\n')}`;
  }
  try {
    await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, finalText, {
      reply_markup: buildAdminBroadcastKeyboard(getUserCount()),
    });
  } catch {
    await ctx.reply(finalText, { reply_markup: buildAdminBroadcastKeyboard(getUserCount()) });
  }
}

async function handleBroadcastSmart(ctx) {
  const buttons = buildInlineKeyboard(getTempOrDefaultButtons(ctx));
  const users = getAllUsers();
  let success = 0;
  let failed = 0;
  const failedUsers = [];
  let msgType = '消息';
  if (ctx.message.text) msgType = '文字';
  else if (ctx.message.photo) msgType = '图片';
  else if (ctx.message.sticker) msgType = '贴纸';
  else if (ctx.message.document) msgType = '文档';
  else if (ctx.message.video) msgType = '视频';
  else if (ctx.message.audio) msgType = '音频';
  else if (ctx.message.voice) msgType = '语音';
  else if (ctx.message.animation) msgType = '动画';
  else if (ctx.message.video_note) msgType = '圆形视频';

  const statusMsg = await ctx.reply(`📤 正在智能广播 (${msgType})... (0/${users.length})`);

  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    try {
      const fwd = await ctx.copyMessage(user.id);
      if (buttons && fwd && fwd.message_id) {
        try {
          await ctx.api.editMessageReplyMarkup(user.id, fwd.message_id, {
            reply_markup: buttons,
          });
        } catch (_) {}
      }
      success++;
    } catch (e) {
      failed++;
      failedUsers.push(`${user.id} (${e.code || e.description || 'error'})`);
    }
    if ((i + 1) % 20 === 0 || i === users.length - 1) {
      try {
        await ctx.api.editMessageText(
          ctx.chat.id,
          statusMsg.message_id,
          `📤 正在智能广播 (${msgType})... (${i + 1}/${users.length})\n成功 ${success} / 失败 ${failed}`
        );
      } catch {}
      if (i < users.length - 1) {
        await new Promise(r => setTimeout(r, 80));
      }
    }
  }

  cleanupTempButtons(ctx);

  let finalText = `✅ 智能广播 (${msgType}) 完成！\n\n✅ 成功：${success} 人\n❌ 失败：${failed} 人`;
  if (failedUsers.length > 0 && failedUsers.length <= 20) {
    finalText += `\n\n失败详情：\n${failedUsers.join('\n')}`;
  }
  try {
    await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, finalText, {
      reply_markup: buildAdminBroadcastKeyboard(getUserCount()),
    });
  } catch {
    await ctx.reply(finalText, { reply_markup: buildAdminBroadcastKeyboard(getUserCount()) });
  }
}

async function handlePinMessage(ctx) {
  let pinnedMsgId = null;
  const buttons = buildInlineKeyboard(getTempOrDefaultButtons(ctx));

  try {
    if (ctx.message.photo) {
      const photo = ctx.message.photo[ctx.message.photo.length - 1];
      const rawCap = ctx.message.caption || '';
      const sent = await ctx.replyWithPhoto(photo.file_id, {
        caption: escapeHtml(rawCap) || undefined,
        parse_mode: 'HTML',
        reply_markup: buttons,
      });
      pinnedMsgId = sent.message_id;
    } else if (ctx.message.text && !ctx.message.text.startsWith('/')) {
      const sent = await ctx.reply(escapeHtml(ctx.message.text), {
        parse_mode: 'HTML',
        reply_markup: buttons,
      });
      pinnedMsgId = sent.message_id;
    } else {
      await ctx.reply('❌ 只支持文字或图片消息。', {
        reply_markup: buildAdminBroadcastKeyboard(getUserCount()),
      });
      return;
    }

    if (pinnedMsgId) {
      try {
        await ctx.api.pinChatMessage(ctx.chat.id, pinnedMsgId, {
          disable_notification: false,
        });
        await ctx.reply('✅ 消息已成功置顶！', {
          reply_markup: buildAdminBroadcastKeyboard(getUserCount()),
        });
      } catch (pinErr) {
        await ctx.reply(`⚠️ 消息已发送，但置顶失败（通常是没有给机器人"管理员+置顶消息"权限）：${pinErr.message}`, {
          reply_markup: buildAdminBroadcastKeyboard(getUserCount()),
        });
      }
    }
  } catch (e) {
    console.error('置顶消息异常:', e);
    await ctx.reply(`❌ 操作失败：${e.message}`, {
      reply_markup: buildAdminBroadcastKeyboard(getUserCount()),
    });
  }
}

async function forwardToAdmins(ctx) {
  const fromId = ctx.from.id;
  addUser(ctx.from.id, ctx.from.username, ctx.from.first_name, ctx.from.last_name);

  const userInfo = buildUserInfo(ctx);
  const adminIds = config.adminIds;
  if (adminIds.length === 0) {
    try { await ctx.reply('⚠️ 机器人暂未配置管理员，您的消息无法送达。请稍后再试。'); } catch {}
    return;
  }

  for (const adminId of adminIds) {
    try {
      const infoMsg = await ctx.api.sendMessage(adminId, `📩 收到新消息！\n\n${userInfo}\n\n👇 请直接回复下面的这条消息来回复用户：`);
      let forwardedId = null;
      const replyOpts = { reply_to_message_id: infoMsg.message_id };
      const isAnimatedSticker = ctx.message.sticker && (ctx.message.sticker.is_animated || ctx.message.sticker.is_video);
      const hasCustomEmoji = ctx.message.entities && ctx.message.entities.some(e => e.type === 'custom_emoji');
      const textHasSpecialEntities = ctx.message.entities && ctx.message.entities.some(e =>
        ['custom_emoji', 'text_link', 'text_mention', 'pre', 'code'].includes(e.type)
      );

      if (ctx.message.text && !textHasSpecialEntities) {
        const fwd = await ctx.api.sendMessage(adminId, ctx.message.text, replyOpts);
        forwardedId = fwd.message_id;
      } else if (ctx.message.text && textHasSpecialEntities) {
        try {
          const fwd = await ctx.copyMessage(adminId, replyOpts);
          forwardedId = fwd.message_id;
        } catch (e) {
          const fwd2 = await ctx.api.sendMessage(adminId, ctx.message.text, replyOpts);
          forwardedId = fwd2.message_id;
        }
      } else if (ctx.message.photo) {
        const photo = ctx.message.photo[ctx.message.photo.length - 1];
        const fwd = await ctx.api.sendPhoto(adminId, photo.file_id, {
          caption: ctx.message.caption,
          ...replyOpts,
        });
        forwardedId = fwd.message_id;
      } else if (ctx.message.document) {
        const fwd = await ctx.api.sendDocument(adminId, ctx.message.document.file_id, {
          caption: ctx.message.caption,
          ...replyOpts,
        });
        forwardedId = fwd.message_id;
      } else if (ctx.message.video) {
        const fwd = await ctx.api.sendVideo(adminId, ctx.message.video.file_id, {
          caption: ctx.message.caption,
          ...replyOpts,
        });
        forwardedId = fwd.message_id;
      } else if (ctx.message.audio) {
        const fwd = await ctx.api.sendAudio(adminId, ctx.message.audio.file_id, {
          caption: ctx.message.caption,
          ...replyOpts,
        });
        forwardedId = fwd.message_id;
      } else if (ctx.message.voice) {
        const fwd = await ctx.api.sendVoice(adminId, ctx.message.voice.file_id, {
          caption: ctx.message.caption,
          ...replyOpts,
        });
        forwardedId = fwd.message_id;
      } else if (ctx.message.sticker) {
        if (isAnimatedSticker) {
          try {
            const fwd = await ctx.copyMessage(adminId, replyOpts);
            forwardedId = fwd.message_id;
          } catch (e) {
            const fwd2 = await ctx.api.sendSticker(adminId, ctx.message.sticker.file_id, replyOpts);
            forwardedId = fwd2.message_id;
          }
        } else {
          const fwd = await ctx.api.sendSticker(adminId, ctx.message.sticker.file_id, replyOpts);
          forwardedId = fwd.message_id;
        }
      } else if (ctx.message.animation) {
        try {
          const fwd = await ctx.copyMessage(adminId, replyOpts);
          forwardedId = fwd.message_id;
        } catch (e) {
          const fwd2 = await ctx.api.sendAnimation(adminId, ctx.message.animation.file_id, {
            caption: ctx.message.caption,
            ...replyOpts,
          });
          forwardedId = fwd2.message_id;
        }
      } else if (ctx.message.video_note) {
        try {
          const fwd = await ctx.copyMessage(adminId, replyOpts);
          forwardedId = fwd.message_id;
        } catch (e) {
          const fwd2 = await ctx.api.sendVideoNote(adminId, ctx.message.video_note.file_id, replyOpts);
          forwardedId = fwd2.message_id;
        }
      } else if (ctx.message.location) {
        const fwd = await ctx.api.sendLocation(adminId, ctx.message.location.latitude, ctx.message.location.longitude, {
          ...replyOpts,
        });
        forwardedId = fwd.message_id;
      } else if (ctx.message.contact) {
        const c = ctx.message.contact;
        const fwd = await ctx.api.sendContact(adminId, c.phone_number, c.first_name, {
          last_name: c.last_name,
          vcard: c.vcard,
          ...replyOpts,
        });
        forwardedId = fwd.message_id;
      } else {
        try {
          const fwd = await ctx.copyMessage(adminId, replyOpts);
          forwardedId = fwd.message_id;
        } catch (e) {
          await ctx.api.sendMessage(adminId, '⚠️ 该类型消息暂无法转发，请通知用户改用其他方式发送。', replyOpts);
        }
      }

      if (forwardedId) {
        createSession(fromId, forwardedId, ctx.message.message_id);
      }
    } catch (e) {
      console.error(`转发给管理员 ${adminId} 失败:`, e.message);
    }
  }
}

async function forwardReplyToUser(ctx, userId) {
  try {
    let sentMsg = null;
    const isAnimatedSticker = ctx.message.sticker && (ctx.message.sticker.is_animated || ctx.message.sticker.is_video);
    const replyTextHasSpecialEntities = ctx.message.entities && ctx.message.entities.some(e =>
      ['custom_emoji', 'text_link', 'text_mention', 'pre', 'code'].includes(e.type)
    );

    if (ctx.message.text && !replyTextHasSpecialEntities) {
      sentMsg = await ctx.api.sendMessage(userId, escapeHtml(ctx.message.text), {
        parse_mode: 'HTML',
      });
    } else if (ctx.message.text && replyTextHasSpecialEntities) {
      try {
        sentMsg = await ctx.copyMessage(userId);
      } catch (e) {
        sentMsg = await ctx.api.sendMessage(userId, escapeHtml(ctx.message.text));
      }
    } else if (ctx.message.photo) {
      const photo = ctx.message.photo[ctx.message.photo.length - 1];
      const rawCap = ctx.message.caption || '';
      sentMsg = await ctx.api.sendPhoto(userId, photo.file_id, {
        caption: escapeHtml(rawCap) || undefined,
        parse_mode: 'HTML',
      });
    } else if (ctx.message.document) {
      sentMsg = await ctx.api.sendDocument(userId, ctx.message.document.file_id, {
        caption: ctx.message.caption,
      });
    } else if (ctx.message.video) {
      sentMsg = await ctx.api.sendVideo(userId, ctx.message.video.file_id, {
        caption: ctx.message.caption,
      });
    } else if (ctx.message.audio) {
      sentMsg = await ctx.api.sendAudio(userId, ctx.message.audio.file_id, {
        caption: ctx.message.caption,
      });
    } else if (ctx.message.voice) {
      sentMsg = await ctx.api.sendVoice(userId, ctx.message.voice.file_id, {
        caption: ctx.message.caption,
      });
    } else if (ctx.message.sticker) {
      if (isAnimatedSticker) {
        try {
          sentMsg = await ctx.copyMessage(userId);
        } catch (e) {
          sentMsg = await ctx.api.sendSticker(userId, ctx.message.sticker.file_id);
        }
      } else {
        sentMsg = await ctx.api.sendSticker(userId, ctx.message.sticker.file_id);
      }
    } else if (ctx.message.animation) {
      try {
        sentMsg = await ctx.copyMessage(userId);
      } catch (e) {
        sentMsg = await ctx.api.sendAnimation(userId, ctx.message.animation.file_id, {
          caption: ctx.message.caption,
        });
      }
    } else if (ctx.message.video_note) {
      try {
        sentMsg = await ctx.copyMessage(userId);
      } catch (e) {
        sentMsg = await ctx.api.sendVideoNote(userId, ctx.message.video_note.file_id);
      }
    } else {
      try {
        sentMsg = await ctx.copyMessage(userId);
      } catch (e) {
        await ctx.reply(`❌ 该类型消息无法发送给用户：${e.message}`);
        return;
      }
    }

    if (sentMsg) {
      await ctx.reply(`✅ 已成功回复用户！\n用户 ID: ${userId}\n消息 ID: ${sentMsg.message_id}`);
    }
  } catch (e) {
    console.error('回复用户失败:', e);
    const desc = (e instanceof GrammyError) ? e.description : e.message;
    let tip = '';
    if (desc && desc.includes('chat not found')) {
      tip = '\n💡 原因：用户已删除对话或从未启动过机器人，无法主动发消息。请让用户先发送 /start。';
    } else if (desc && desc.includes('blocked')) {
      tip = '\n💡 原因：用户屏蔽了机器人。';
    } else if (desc && desc.includes('forbidden')) {
      tip = '\n💡 原因：权限不足（通常是被用户拉黑）。';
    }
    await ctx.reply(`❌ 回复失败：${desc}${tip}`);
  }
}

bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`[错误] 更新 ${ctx.update.update_id} 处理异常:`);
  const e = err.error;
  if (e instanceof GrammyError) {
    console.error('  Grammy API 错误:', e.description, '(code:', e.error_code, ')');
    if (ctx.chat && ctx.chat.id > 0 && isAdmin(ctx.chat.id)) {
      ctx.reply(`⚠️ 操作遇到 API 错误：${e.description}`).catch(() => {});
    }
  } else if (e instanceof HttpError) {
    console.error('  HTTP 网络错误:', e.message);
  } else {
    console.error('  未知异常:', e && e.stack ? e.stack : e);
  }
});

module.exports = { bot };
