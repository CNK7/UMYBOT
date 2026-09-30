require('dotenv').config();
const { webhookCallback } = require('grammy');
const { bot } = require('../src/bot');
const { config } = require('../src/config');

let webhookSetPromise = null;
function ensureWebhookSet() {
  if (webhookSetPromise) return webhookSetPromise;
  if (!config.webhookUrl) {
    webhookSetPromise = Promise.resolve();
    return webhookSetPromise;
  }
  webhookSetPromise = (async () => {
    try {
      const info = await bot.api.getWebhookInfo();
      if (!info.url || info.url !== config.webhookUrl) {
        await bot.api.setWebhook(config.webhookUrl);
        console.log('[vercel] Webhook URL 已设置为:', config.webhookUrl);
      } else {
        console.log('[vercel] Webhook URL 已匹配，无需重复设置');
      }
    } catch (e) {
      console.error('[vercel] 设置 Webhook 失败:', e.message);
    }
  })();
  return webhookSetPromise;
}

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    if (req.url === '/health' || req.url === '/api/health' || req.path === '/health') {
      res.setHeader('Content-Type', 'application/json');
      return res.status(200).json({
        status: 'ok',
        uptime: process.uptime(),
        memory: process.memoryUsage().heapUsed,
        admins: config.adminIds.length,
      });
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(
      '<div style="font-family:system-ui;max-width:600px;margin:80px auto;padding:24px;text-align:center">' +
      '<h1>🤖 Telegram 客服机器人运行中</h1>' +
      '<p>部署方式：<b>Vercel Serverless</b></p>' +
      '<p>管理员数：<b>' + config.adminIds.length + '</b></p>' +
      '<p><a href="/health">健康检查 /health</a></p>' +
      '<p style="color:#888;font-size:12px;margin-top:40px">Webhook 路径: POST /api/webhook</p>' +
      '</div>'
    );
  }

  if (req.method === 'POST') {
    try {
      await ensureWebhookSet();
    } catch (e) {}

    await new Promise((resolve, reject) => {
      const handleUpdate = webhookCallback(bot, 'http', {}, 30_000);
      try {
        handleUpdate(req, res).then(resolve, reject);
      } catch (e) {
        reject(e);
      }
    });
    return;
  }

  res.status(405).json({ error: 'Method Not Allowed', methods: ['GET', 'POST'] });
};
