require('dotenv').config();
const express = require('express');
const { webhookCallback } = require('grammy');
const { bot } = require('./bot');
const { config } = require('./config');

const app = express();

app.use(express.json());

app.get('/', (req, res) => {
  res.send('🤖 Telegram 客服机器人正在运行！');
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.post('/webhook', webhookCallback(bot, 'express'));

const PORT = config.port;
app.listen(PORT, async () => {
  console.log('========================================');
  console.log('  🤖 Telegram 客服机器人启动中...');
  console.log('  模式: Webhook');
  console.log(`  端口: ${PORT}`);
  console.log(`  Webhook URL: ${config.webhookUrl}`);
  console.log('========================================');

  if (config.webhookUrl) {
    try {
      await bot.api.setWebhook(config.webhookUrl);
      console.log('✅ Webhook 设置成功！');
    } catch (e) {
      console.error('❌ Webhook 设置失败:', e.message);
    }
  }
});
