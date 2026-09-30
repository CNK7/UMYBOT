const { Bot, GrammyError, HttpError } = require('grammy');
const { config, isAdmin } = require('./config');
const {
  addUser,
  getAllUsers,
  getUserCount,
  createSession,
  getSession,
  isVercel,
} = require('./storage');
const {
  buildInlineKeyboard,
  buildWelcomeText,
  buildUserInfo,
  buildAdminBroadcastKeyboard,
  buildCancelKeyboard,
  escapeHtml,
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
  const from = ctx.from;
  if (from) {
    addUser(from.id, from.username, from.first_name, from.last_name);
  }

  clearAdminMode(ctx.from?.id);

  if (isAdmin(ctx.from?.id)) {
    const userCount = getUserCount();
    await ctx.reply(`🎛️ 管理员控制台\n\n当前用户数：${userCount} 人${isVercel ? '\n\n⚠️ 当前环境：Vercel Serverless\n冷启动数据会重置，用户量大请改用 aapanel 部署。' : ''}`, {
      reply_markup: buildAdminBroadcastKeyboard(userCount),
    });
    return;
  }

  const welcomeText = buildWelcomeText(ctx);
  const replyMarkup = buildInlineKeyboard(config.inlineButtons);

  if (config.welcomeStickerId) {
    try {
      await ctx.replyWithSticker(config.welcomeStickerId);
    } catch (e) {
      console.error('欢迎贴纸发送失败，已跳过:', e.message);
    }
  }

  if (config.welcomeImageUrl) {
    try {
      await ctx.replyWithPhoto(config.welcomeImageUrl, {
        caption: welcomeText,
        parse_mode: 'HTML',
        reply_markup: replyMarkup,
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
  await ctx.answerCallbackQuery();
  const userCount = getUserCount();
  try {
    await ctx.editMessageText(`🎛️ 管理员控制台\n\n当前用户数：${userCount} 人`, {
      reply_markup: buildAdminBroadcastKeyboard(userCount),
    });
  } catch {}
});

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
  setAdminMode(ctx.from.id, 'broadcast_text');
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(`✏️ 请发送要广播的文字内容（支持换行+表情，自动转义 HTML 特殊字符）：\n\n⚠️ 需要文字+图片一起发？请改用「🖼️ 图文广播」或「📜 文图双条广播」\n\n共 ${userCount} 位用户将收到\n\n随时可点击下方返回取消：`, {
    reply_markup: buildCancelKeyboard(),
  });
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
  setAdminMode(ctx.from.id, 'broadcast_photo');
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(`🖼️ 请发送要广播的图片（📝 可以附带文字说明，会自动和图片一起显示在图片下方）：\n\n✅ 这就是「图文一起广播」！\n共 ${userCount} 位用户将收到\n\n（想文字和图片分成两条独立消息的，请改用「📜 文图双条广播」）`, {
    reply_markup: buildCancelKeyboard(),
  });
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
  setAdminMode(ctx.from.id, 'broadcast_mixed_1');
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(`📜 文图双条广播（分两条独立消息发送，文字长度不受限制）\n\n第 1 步：请先发送要广播的「文字内容」（单独文字，不要带图）：\n\n共 ${userCount} 位用户将收到`, {
    reply_markup: buildCancelKeyboard(),
  });
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
  setAdminMode(ctx.from.id, 'broadcast_smart');
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(`🎯 智能广播：你发什么，我就原样广播什么（自动附带底部按钮）\n\n✅ 支持 文字 / 图片+caption / 文档 / 贴纸 / 视频 / 语音 / 位置 / 联系人\n\n请发送你要广播的内容：\n共 ${userCount} 位用户将收到`, {
    reply_markup: buildCancelKeyboard(),
  });
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

bot.on('message', async (ctx, next) => {
  const fromId = ctx.from?.id;
  if (!fromId) return next();

  if (isAdmin(fromId)) {
    const state = getAdminMode(fromId);

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
    const replyTo = ctx.message.reply_to_message;
    if (replyTo && replyTo.message_id) {
      const session = getSession(replyTo.message_id);
      if (session) {
        await forwardReplyToUser(ctx, session.userId);
        return;
      }
    }
  } else {
    await forwardToAdmins(ctx);
    return;
  }

  await next();
});

async function handleBroadcastText(ctx) {
  const rawText = ctx.message.text;
  const escapedText = escapeHtml(rawText);
  const buttons = buildInlineKeyboard(config.broadcastButtons);
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
  const buttons = buildInlineKeyboard(config.broadcastButtons);
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
  const buttons = buildInlineKeyboard(config.broadcastButtons);
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
  const buttons = buildInlineKeyboard(config.broadcastButtons);
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
  const buttons = buildInlineKeyboard(config.broadcastButtons);

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

      if (ctx.message.text) {
        const fwd = await ctx.api.sendMessage(adminId, ctx.message.text, replyOpts);
        forwardedId = fwd.message_id;
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

    if (ctx.message.text) {
      sentMsg = await ctx.api.sendMessage(userId, escapeHtml(ctx.message.text), {
        parse_mode: 'HTML',
      });
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
