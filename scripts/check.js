require('dotenv').config();
const { Bot } = require('grammy');
const { config, isAdmin } = require('../src/config');

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

const ok = (msg) => console.log(`${GREEN}✔️  PASS${RESET}  ${msg}`);
const fail = (msg) => console.log(`${RED}❌ FAIL${RESET}  ${msg}`);
const warn = (msg) => console.log(`${YELLOW}⚠️  WARN${RESET}  ${msg}`);
const info = (msg) => console.log(`${CYAN}ℹ️  INFO${RESET}  ${msg}`);

(async () => {
  console.log('\n============================================');
  console.log('  🧪 Telegram 客服机器人 - 上线前自检');
  console.log('============================================\n');

  let hasFail = false;
  let hasWarn = false;

  info(`Node 版本: ${process.version}`);
  info(`运行平台: ${process.platform} ${process.arch}`);
  info(`当前模式: ${config.useWebhook ? 'Webhook' : '长轮询 (Polling)'}\n`);

  console.log('--- [1/7] 环境变量完整性 ---');
  const vars = [
    ['BOT_TOKEN', config.botToken, true],
    ['ADMIN_IDS', config.adminIds.join(','), true],
    ['BOT_USERNAME', config.botUsername, false],
    ['USE_WEBHOOK', String(config.useWebhook), true],
  ];
  for (const [name, value, required] of vars) {
    if (!value || (typeof value === 'string' && value.trim() === '')) {
      if (required) { fail(`环境变量 ${name} 为空（必需）`); hasFail = true; }
      else { warn(`环境变量 ${name} 为空（可选）`); hasWarn = true; }
    } else {
      if (name === 'BOT_TOKEN') ok(`环境变量 ${name} = ${value.slice(0, 6)}...${value.slice(-4)}`);
      else ok(`环境变量 ${name} = ${String(value).slice(0, 60)}${String(value).length > 60 ? '...' : ''}`);
    }
  }

  console.log('\n--- [2/7] Bot Token 有效性 ---');
  let botInfo = null;
  if (config.botToken) {
    const testBot = new Bot(config.botToken);
    try {
      botInfo = await testBot.api.getMe();
      ok(`Token 有效！机器人：@${botInfo.username} (ID: ${botInfo.id})`);
      if (config.botUsername && botInfo.username.toLowerCase() !== config.botUsername.toLowerCase()) {
        warn(`BOT_USERNAME (@${config.botUsername}) 与实际机器人 (@${botInfo.username}) 不一致`);
        hasWarn = true;
      }
      if (botInfo.can_join_groups === false) {
        warn('机器人未允许加入群组（私聊模式可以正常使用）');
      }
    } catch (e) {
      fail(`Token 无效或无法连接 Telegram API：${e.description || e.message}`);
      hasFail = true;
    }
  } else {
    fail('无 Token，跳过检测');
  }

  console.log('\n--- [3/7] 管理员 ID 可达性 ---');
  if (config.adminIds.length === 0) {
    fail('未配置任何管理员 ID！用户消息无人接收。');
    hasFail = true;
  } else {
    for (const aid of config.adminIds) {
      if (botInfo) {
        try {
          const testBot = new Bot(config.botToken);
          const testMsg = await testBot.api.sendMessage(
            aid,
            '🔔 <b>机器人自检消息</b>\n\n如果您能看到这条消息，说明管理员配置正确，可直接忽略删除。',
            { parse_mode: 'HTML' }
          );
          try { await testBot.api.deleteMessage(aid, testMsg.message_id); } catch {}
          ok(`管理员 ${aid}：可达 ✓（已发送并删除自检消息）`);
        } catch (e) {
          const desc = e.description || e.message;
          let tip = '';
          if (desc.includes('chat not found')) {
            tip = ' → 请先向机器人发送任意一条消息，让机器人有你的聊天 ID';
          } else if (desc.includes('blocked')) {
            tip = ' → 您屏蔽了此机器人，请解除屏蔽';
          }
          fail(`管理员 ${aid}：不可达！${desc}${tip}`);
          hasFail = true;
        }
      } else {
        warn(`管理员 ${aid}：因 Token 无效跳过可达性检测`);
        hasWarn = true;
      }
    }
  }

  console.log('\n--- [4/7] Webhook 配置检查 ---');
  if (config.useWebhook) {
    if (!config.webhookUrl) {
      fail('启用了 Webhook 模式，但 WEBHOOK_URL 为空！');
      hasFail = true;
    } else {
      if (!/^https:\/\//i.test(config.webhookUrl)) {
        fail(`WEBHOOK_URL 必须以 https:// 开头（Telegram 要求）：${config.webhookUrl}`);
        hasFail = true;
      } else {
        ok(`Webhook URL 格式正确：${config.webhookUrl}`);
      }
      if (botInfo) {
        try {
          const testBot = new Bot(config.botToken);
          const info = await testBot.api.getWebhookInfo();
          if (info.url) {
            if (info.url === config.webhookUrl) {
              ok(`服务器端 Webhook 已设置，URL 匹配 ✓`);
            } else {
              warn(`服务器端 Webhook URL 与配置不同步！\n       期望: ${config.webhookUrl}\n       实际: ${info.url}\n       部署后会自动修正。`);
              hasWarn = true;
            }
          } else {
            warn('服务器端尚未设置 Webhook（首次部署后会自动设置）');
            hasWarn = true;
          }
          if (info.pending_update_count > 0) {
            warn(`有 ${info.pending_update_count} 个未处理更新积压（可能是旧 webhook 留下的）`);
            hasWarn = true;
          }
          if (info.last_error_message) {
            warn(`最近一次 Webhook 错误：${info.last_error_message}（时间: ${info.last_error_date || '未知'}）`);
            hasWarn = true;
          }
        } catch (e) {
          warn(`无法获取 Webhook 信息：${e.message}`);
          hasWarn = true;
        }
      }
    }
  } else {
    info('当前使用长轮询模式（适用于本地测试 / aapanel + PM2）');
    if (process.env.VERCEL || process.env.RENDER || process.env.RAILWAY_STATIC_URL) {
      fail('检测到 PaaS 环境（Vercel 等），但 USE_WEBHOOK=false！请设置 USE_WEBHOOK=true 和 WEBHOOK_URL。');
      hasFail = true;
    }
  }

  console.log('\n--- [5/7] 按钮配置 JSON 合法性 ---');
  const btnChecks = [
    ['INLINE_BUTTONS', config.inlineButtons, process.env.INLINE_BUTTONS],
    ['BROADCAST_BUTTONS', config.broadcastButtons, process.env.BROADCAST_BUTTONS],
  ];
  for (const [name, arr, raw] of btnChecks) {
    if (!raw || raw.trim() === '') {
      info(`${name}: 未配置（留空则无按钮，正常）`);
      continue;
    }
    if (Array.isArray(arr) && arr.length > 0) {
      const bad = arr.filter(b => !b.text || (!b.url && !b.callback_data && !b.web_app));
      if (bad.length > 0) {
        fail(`${name}: 有 ${bad.length} 个按钮缺少 url/callback_data 字段：${JSON.stringify(bad)}`);
        hasFail = true;
      } else {
        ok(`${name}: ${arr.length} 个按钮，格式合法 ✓`);
      }
    } else {
      fail(`${name}: 原始值非空但解析后为空数组，请检查 JSON 语法`);
      hasFail = true;
    }
  }

  console.log('\n--- [6/7] 欢迎图片 URL 可达性 ---');
  if (config.welcomeImageUrl) {
    if (!/^https?:\/\//i.test(config.welcomeImageUrl)) {
      fail(`WELCOME_IMAGE_URL 协议必须为 http(s)：${config.welcomeImageUrl}`);
      hasFail = true;
    } else {
      ok(`欢迎图片 URL 格式合法（启动时会实际尝试发送，失败会降级纯文字）`);
    }
  } else {
    info('未配置欢迎图片（将只发送文字+按钮）');
  }

  console.log('\n--- [7/7] 存储目录写权限 ---');
  try {
    const path = require('path');
    const fs = require('fs');
    const os = require('os');
    const testDir = process.env.VERCEL
      ? path.join(os.tmpdir(), 'tgkf-test-' + Date.now())
      : path.join(__dirname, '..', 'data');
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
    const testFile = path.join(testDir, '.write_test');
    fs.writeFileSync(testFile, String(Date.now()));
    fs.unlinkSync(testFile);
    if (process.env.VERCEL) {
      warn('检测到 Vercel 环境：使用 /tmp 临时目录，冷启动后用户数据会重置。');
      warn('                   用户量 >200 或需要持久化数据，请使用 aapanel 部署。');
      hasWarn = true;
    } else {
      ok(`本地存储目录可写 ✓ (${testDir})`);
    }
  } catch (e) {
    fail('存储目录无法写入：' + e.message);
    hasFail = true;
  }

  console.log('\n============================================');
  console.log('  自检完成');
  console.log('============================================\n');

  if (hasFail) {
    console.log(`${RED}❌ 存在致命错误，请先修复所有 FAIL 项再上线。${RESET}`);
    process.exit(1);
  }
  if (hasWarn) {
    console.log(`${YELLOW}⚠️  有警告信息，建议检查（但不影响启动）。${RESET}`);
  }
  console.log(`${GREEN}✔️  所有关键配置检查通过，可以放心部署上线！${RESET}\n`);
  console.log('  💡 本地测试：    npm start');
  console.log('  💡 aapanel 部署：npm run webhook (配合 PM2)');
  console.log('  💡 Vercel 部署：git push 后会自动构建+部署\n');
})().catch(e => {
  console.error(RED + '自检过程异常：' + RESET, e.stack || e);
  process.exit(2);
});
