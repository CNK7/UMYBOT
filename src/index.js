require('dotenv').config();
const { bot } = require('./bot');
const { config } = require('./config');

console.log('========================================');
console.log('  🤖 Telegram 客服机器人启动中...');
console.log('  模式: 长轮询 (Polling)');
console.log('  管理员数:', config.adminIds.length);
console.log('========================================');

bot.start({
  onStart: (info) => {
    console.log(`✅ 机器人已启动！`);
    console.log(`   用户名: @${info.username}`);
    console.log(`   ID: ${info.id}`);
    console.log('');
    console.log('💡 提示: 发送 /start 给机器人开始使用');
    console.log('💡 提示: 管理员发送 /menu 打开控制台');
  },
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
