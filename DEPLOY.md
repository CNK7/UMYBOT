# 📖 Telegram 客服机器人完整部署教程

> **版本**: v1.1.0 | **更新日期**: 2026-09-30
>
> 🧪 **必做（上线前）**：安装依赖后执行 `npm run check` 一键自检所有配置！

---

## 🔥 v1.1.0 重要更新 & 注意事项（请先阅读）

| 项目 | 说明 |
|------|------|
| **HTML 转义保护** | 修复了 `&`、`<`、`>` 等字符导致消息发送失败的 P0 级 bug |
| **Vercel 文件系统保护** | 自动检测 Vercel 环境，使用 `/tmp` 目录，不会因只读 FS 崩溃 |
| **管理员状态存储** | 广播/置顶状态改用独立 Map 存储，解决 Vercel 冷启动+GrammY 会话冲突 |
| **Vercel 广播上限** | Vercel 免费版函数超时 10s / Pro 版 60s，**用户数 >200 人禁止广播**（代码内自动拦截），此时必须用 aapanel 部署 |
| **Vercel 数据持久化** | ⚠️ Vercel 为无服务器架构，`/tmp` 会在冷启动清空，用户列表可能丢失！<br>👉 长期稳定运行、用户量大时 **请务必使用 aapanel 自建服务器部署** |
| **多管理员回复** | 每条转发消息会附带会话绑定，直接"回复"那条消息即可发给对应用户，避免回错人 |
| **新增自检脚本** | `npm run check`：一键检查 Token、管理员可达性、Webhook 配置、按钮 JSON 合法性等 7 项 |

---

## ✨ 机器人功能一览

| 功能 | 说明 |
|------|------|
| 🚀 启动欢迎 | 图片 + 文字 + 按钮（无启动次数提示） |
| 💬 消息转发 | 用户消息 → 管理员，管理员回复 → 用户 |
| 📢 广播文字 | 管理员向所有用户发送文字广播 |
| 🖼️ 广播图片 | 管理员向所有用户发送图片广播（带按钮） |
| 📌 置顶消息 | 管理员发送并置顶文字/图片消息 |
| 🎛️ 管理员菜单 | /menu 打开控制台面板 |
| 🐻 会员表情 | 支持 Telegram Premium 表情/贴纸转发 |

---

## 📋 前期准备（必做）

### 1. 创建 Telegram Bot 获取 Token

1. 打开 Telegram，搜索 **@BotFather**，发送 `/newbot`
2. 按提示输入机器人名称（显示名）和用户名（必须以 `bot` 结尾）
3. 成功后会获得一串 **HTTP API Token**，格式如：
   ```
   123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ
   ```
   **保存好这个 Token，后面要用。**

4. （可选）设置机器人头像、描述：
   - `/setuserpic` - 上传头像
   - `/setabouttext` - 设置简介
   - `/setdescription` - 设置 /start 前的描述

### 2. 获取你的 Telegram 用户 ID（管理员 ID）

1. 搜索 **@userinfobot**，发送任意消息
2. 它会回复你的 **Id**，如：`123456789`，记录下来
3. 多个管理员的话，每个都查一次，逗号分隔

---

## 🔬 必做：本地一键自检（在部署前/后都可以跑）

不管用哪种部署方式，**配置完 .env 或环境变量后，建议先运行一次自检**，避免因为 Token 错、管理员 ID 没发过消息、Webhook 没配置对这些低级问题折腾半天：

```bash
# 1. 安装依赖（本地测试需要 Node.js 18+）
npm install

# 2. 复制并编辑 .env（把示例里的值改成真的）
copy .env.example .env

# 3. 运行自检
npm run check
```

**自检项目**：
- ✅ 环境变量完整性检查（必填项有没有空）
- ✅ Bot Token 有效性（实际调用 getMe 验证）
- ✅ 管理员 ID 可达性（实际发消息+删除，验证你是不是之前给机器人发过消息）
- ✅ Webhook URL 格式 + 服务器端实际配置
- ✅ 按钮 JSON 格式合法性（最容易写错的地方）
- ✅ 欢迎图片 URL 协议合法性
- ✅ 存储目录写权限 + Vercel 环境警告

全部 PASS 再部署，踩坑少一半。🚀

---

## 📦 方法一：Vercel 部署（免费、免维护、适合 <200 用户）

### 第 1 步：将代码推送到 GitHub

1. 注册/登录 GitHub：https://github.com
2. 新建仓库（New Repository）：
   - Repository name: `tgkf-bot`（随便取）
   - 选择 **Public** 或 **Private** 都可以
   - 不要勾选 README、.gitignore（我们的项目已经有了）
3. 创建后，按 GitHub 提示把本地代码推上去：

在本地项目目录 `d:\traesc\tgkf` 打开命令行（CMD / PowerShell）：

```bash
git init
git add .
git commit -m "first commit"
git branch -M main
git remote add origin https://github.com/你的用户名/tgkf-bot.git
git push -u origin main
```

> 💡 如果没有 git，先下载安装：https://git-scm.com/download/win

### 第 2 步：在 Vercel 导入项目

1. 注册/登录 Vercel：https://vercel.com （可以用 GitHub 一键登录）
2. 点击 **Add New...** → **Project**
3. 在 **Import Git Repository** 里找到刚才的仓库，点 **Import**
4. 配置页面（Project Settings）：
   - Framework Preset: **Other**
   - Build Command: `npm install`（不用改）
   - Output Directory: 留空（不用填）
   - Install Command: 不用改

### 第 3 步：配置环境变量（重要！）

在配置页面找到 **Environment Variables**，逐个添加以下变量：

| Key | Value 示例 | Environment |
|-----|-----------|-------------|
| `BOT_TOKEN` | `123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ` | Production, Preview, Development 全勾 |
| `ADMIN_IDS` | `123456789`（或 `123,456,789` 多个） | 同上 |
| `BOT_USERNAME` | `your_bot_username`（你的机器人用户名，不带 @） | 同上 |
| `USE_WEBHOOK` | `true` | 同上 |
| `WEBHOOK_URL` | `https://你的项目名.vercel.app/webhook`（部署后才有，先随便填） | 同上 |
| `WELCOME_TITLE` | `你好` | 同上 |
| `WELCOME_MESSAGE` | `专属会话已建立\n\n请直接发送需要咨询的文字、图片、文件或其他内容，客服人员收到后会尽快回复。` | 同上 |
| `WELCOME_STATUS` | `✅ 当前状态：在线接收\n🌐 会话通道：已连接\n🔔 消息通知：已开启` | 同上 |
| `WELCOME_IMAGE_URL` | `https://example.com/你的图片.jpg`（留空则不发图） | 同上 |
| `INLINE_BUTTONS` | `[{"text":"按钮","url":"https://example.com"},{"text":"按钮2","url":"https://example.com"}]` | 同上 |
| `BROADCAST_BUTTONS` | `[{"text":"点击查看","url":"https://example.com"}]` | 同上 |

> ⚠️ `WEBHOOK_URL` 部署完再回来改也可以，格式是：`https://你的项目域名.vercel.app/webhook`

> 🚨 **Vercel 部署重要限制（必读）**
> 1. 用户数 > **200 人** 时，广播功能会被自动拦截（Vercel 免费版函数超时 10s 不足以广播给更多用户）
> 2. 用户数据存储在临时目录 `/tmp`，**冷启动/重新部署后数据会清空**！机器人重启后用户列表丢失，就无法向他们广播。
> 3. 综上：Vercel 仅适合 **测试/轻量/临时** 场景。长期稳定 + 用户量大 → **请使用 aapanel 部署！**

### 第 4 步：点击 Deploy 部署

- 等待 1~2 分钟，出现 **Congratulations!** 就是成功了
- 复制部署后的域名，如 `https://tgkf-bot-abc123.vercel.app`
- 进入项目 **Settings → Functions**，确认 `api/webhook.js` 的 **Max Duration** 是 60 秒（Pro 版才有 60s，免费版自动为 10s）

### 第 5 步：设置 Webhook（两种方式）

**方式 A：在环境变量里设置（推荐）**

回到 Vercel 项目 → Settings → Environment Variables：
- 编辑 `WEBHOOK_URL`，值改为 `https://你的域名.vercel.app/webhook`
- 保存后，到 **Deployments** 页面，点最新部署右侧的 **⋯** → **Redeploy** 重新部署

**方式 B：手动调用 API 设置**

浏览器地址栏打开（替换成你自己的）：

```
https://api.telegram.org/bot123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ/setWebhook?url=https://你的域名.vercel.app/webhook
```

返回 `"ok":true, "result":true, "description":"Webhook was set"` 就成功了。

### 第 6 步：验证

1. 打开你的 Telegram 机器人，发送 `/start`
2. 应该能收到你配置的欢迎图片、文字和按钮！🎉

---

## 📦 方法二：aapanel 部署（适合有服务器的）

### 前置条件

- 有一台 VPS 服务器（推荐 Ubuntu 20.04 / 22.04）
- 已经安装好 aapanel 面板：https://www.aapanel.com
- 有一个域名，已经解析到服务器 IP
- 域名配置好 SSL（HTTPS，Telegram Webhook 强制要求）

### 第 1 步：安装 Node.js 环境

1. 登录 aapanel 面板
2. 左侧菜单 → **软件商店**
3. 搜索 **PM2管理器**（或叫 "PM2 项目管理器"），点击安装
4. 安装完成后，点 PM2管理器的 **设置** → **版本管理**，安装 **Node.js 18.x** 或 **20.x**

### 第 2 步：上传项目代码到服务器

**方式 A：用 Git 拉取（推荐，方便后续更新）**

1. 代码先推送到 GitHub（参考方法一的第 1 步）
2. aapanel 左侧 → **文件**，进入 `/www/wwwroot/`
3. 新建文件夹 `tgkf-bot`，进入
4. 点击右上角 **终端**，执行：

```bash
cd /www/wwwroot/tgkf-bot
git clone https://github.com/你的用户名/tgkf-bot.git .
```

**方式 B：手动上传**

- 把本地项目打包成 zip，aapanel 文件管理器里上传、解压

### 第 3 步：安装依赖 + 配置环境变量

1. 在 `/www/wwwroot/tgkf-bot` 目录下，复制 `.env.example` 为 `.env`：

```bash
cp .env.example .env
```

2. 编辑 `.env` 文件（aapanel 里双击即可编辑），填入你的配置：

```ini
BOT_TOKEN=123456789:你的token
ADMIN_IDS=123456789
BOT_USERNAME=你的机器人用户名
USE_WEBHOOK=true
WEBHOOK_URL=https://你的域名.com/webhook
PORT=3000
WELCOME_TITLE=你好
WELCOME_MESSAGE=专属会话已建立\n\n请直接发送需要咨询的文字、图片、文件或其他内容，客服人员收到后会尽快回复。
WELCOME_STATUS=✅ 当前状态：在线接收\n🌐 会话通道：已连接\n🔔 消息通知：已开启
WELCOME_IMAGE_URL=https://example.com/图片.jpg
INLINE_BUTTONS=[{"text":"按钮","url":"https://example.com"},{"text":"按钮2","url":"https://example.com"}]
BROADCAST_BUTTONS=[{"text":"点击查看","url":"https://example.com"}]
```

3. 安装依赖：在项目目录的终端里运行

```bash
npm install
```

### 第 4 步：用 PM2 启动项目

1. aapanel 左侧 → **PM2管理器** → **添加项目**
2. 填写：
   - **项目名称**：`tgkf-bot`
   - **启动文件**：选择 `/www/wwwroot/tgkf-bot/src/webhook.js`
   - **项目目录**：`/www/wwwroot/tgkf-bot`
   - **运行模式**：`fork`（或默认都行）
3. 点击 **提交**，项目应该变成绿色运行状态
4. 点项目右侧的 **日志**，看到如下内容就是启动成功：
   ```
   ========================================
     🤖 Telegram 客服机器人启动中...
     模式: Webhook
     端口: 3000
   ========================================
   ✅ Webhook 设置成功！
   ```

### 第 5 步：配置反向代理（让外网能访问）

因为机器人运行在 `3000` 端口，需要用 Nginx 代理出去，绑定域名：

1. aapanel 左侧 → **网站** → **添加站点**
   - 域名：填你准备好的域名，如 `bot.example.com`
   - 根目录：随便选一个（因为用反向代理，不重要）
   - PHP版本：纯静态
   - 提交

2. 域名申请 SSL 证书：
   - 网站列表 → 该域名右侧 **设置** → **SSL**
   - 选 **Let's Encrypt** → 勾选域名 → **申请**
   - 申请成功后，打开右上角 **强制HTTPS**

3. 设置反向代理：
   - 还是在网站设置里，左侧 **反向代理** → **添加反向代理**
   - 代理名称：`tgkf-bot`
   - 目标URL：`http://127.0.0.1:3000`
   - 发送域名：`$host`
   - 提交

4. 测试：浏览器访问 `https://你的域名.com/`，应该看到：
   ```
   🤖 Telegram 客服机器人正在运行！
   ```

### 第 6 步：aapanel 端一键自检

部署完后，强烈建议在项目目录里跑一下自检，确认机器人真的能连上 Telegram、能给管理员发消息、Webhook 设置成功：

```bash
cd /www/wwwroot/tgkf-bot
node scripts/check.js
```

看到 **"✔️  所有关键配置检查通过"** 就没问题。

### 第 7 步：验证

1. 给机器人发 `/start`，应该收到欢迎消息
2. 普通用户发消息，管理员账号应该能收到转发
3. 管理员回复那条转发，消息应该送回到用户手中！🎉

---

## 🤖 使用说明

### 管理员操作

| 命令 / 操作 | 效果 |
|-----------|------|
| `/start` 或 `/menu` | 打开管理员控制台（有按钮菜单） |
| 📢 广播文字 | 向所有用户发送文字消息（带按钮） |
| 🖼️ 广播图片 | 向所有用户发送图片（可带文字说明+按钮） |
| 📌 置顶消息 | 在当前聊天发送并置顶一条消息 |
| 📊 用户统计 | 查看用户总数和最近用户 |
| 直接回复转发的消息 | 把回复内容发送给对应用户 |

### 用户操作

| 操作 | 效果 |
|-----|------|
| `/start` | 建立会话，收到欢迎消息+图片+按钮 |
| 发送任意文字/图片/文件/贴纸/语音 | 转发给所有管理员 |

### 关于会员表情（Premium Emoji / Sticker）

- 用户发送的贴纸/动态表情会自动转发给管理员
- 管理员回复时发送贴纸，也会自动发给用户
- 如果要在**欢迎消息、广播**里加入自定义表情文字，可以用 Telegram 的 emoji 直接写在配置里（`WELCOME_MESSAGE` 等变量）

---

## 🔧 常见问题排查

### ❌ Vercel 部署后机器人没反应？

1. 检查 Webhook 是否设置成功：
   浏览器打开（替换你的 token）：
   ```
   https://api.telegram.org/bot你的token/getWebhookInfo
   ```
   看 `url` 字段是不是你的 Vercel 域名 + `/webhook`

2. 检查 Vercel 日志：Vercel 项目 → Logs，看有没有报错

3. 确认环境变量 `USE_WEBHOOK=true`，且改完后 **Redeploy** 了

### ❌ aapanel 启动后访问不到？

1. 检查 PM2 里项目是不是运行中，看日志
2. 服务器内部测一下：`curl http://127.0.0.1:3000/` 看有没有返回
3. 检查反向代理配置对不对
4. 检查防火墙（安全组）有没有放行 80、443 端口

### ❌ 广播很慢 / 有失败？

- 代码里已经做了每 20 条延迟 100ms 的节流，防止被 Telegram 限流
- 失败的一般是用户已经删掉机器人/拉黑了，不用管

### ❌ 管理员回复用户失败？

可能的错误代码和解决方案：

| 错误提示 | 原因 | 解决方法 |
|---------|------|---------|
| `chat not found` | 用户从未启动过机器人，或已删除聊天窗口（机器人无法主动发起私聊） | 让用户先给机器人发送 `/start` |
| `bot was blocked by the user` | 用户拉黑了你的机器人 | 让用户解除屏蔽或换账号 |
| `need administrator rights in the channel chat` | 置顶消息没权限 | 在群组/频道里把机器人设为管理员，勾选"置顶消息"权限 |

> 💡 v1.1.0+ 已经在失败时自动给出上述提示，直接看机器人的回复就能定位原因。

### ❌ 广播时有的用户提示 parse entities 错误？

- v1.1.0+ 已**自动转义所有文字的 HTML 特殊字符**（`&` `<` `>` `"` `'`），此问题已修复
- 如果仍遇到，检查是不是用了旧版本，重新 `git pull` 再部署

### ❌ Vercel 部署后 /tmp 数据丢了？

- 正常现象！Vercel 是**无服务器架构**，每次冷启动都是新的容器，`/tmp` 目录不持久化
- 机器人重启后用户列表丢失，广播只能发给重启后新 `/start` 过的用户
- **解决办法**：长期稳定使用 → 迁移到 aapanel + 自建服务器

### ❌ Vercel 广播超过 200 人提示"超出上限"？

- v1.1.0+ 内置了 Vercel 环境广播人数限制（默认 200），防止被 Vercel 10s 超时 kill 导致一半用户收不到
- **解决办法**：升级 Vercel Pro（60s 超时），或者改用 aapanel 部署（不受限）

### ❌ 置顶消息失败？

- 如果机器人是在群组/频道里置顶，需要给机器人管理员权限并开启"置顶消息"
- 如果是在管理员和机器人的私聊里置顶，直接就能成功（私聊默认有置顶权限）

### ❌ 中文按钮/消息显示乱码？

- 确认 `.env` 文件是 **UTF-8 编码**保存的（aapanel 编辑器默认就是）
- Vercel 环境变量面板里粘贴中文没问题，无需转码

---

## 🔧 自检命令清单（速查）

| 场景 | 命令 |
|-----|------|
| 本地测试机器人 | `npm start` |
| 上线前检查所有配置 | `npm run check` |
| aapanel 后台常驻运行 | PM2 里添加 `src/webhook.js` |
| 查看当前 Webhook 设置状态 | 浏览器打开 `https://api.telegram.org/bot<TOKEN>/getWebhookInfo` |
| 手动设置 Webhook | 浏览器打开 `https://api.telegram.org/bot<TOKEN>/setWebhook?url=<YOUR_URL>/webhook` |
| 清空 Webhook 切回长轮询 | 浏览器打开 `https://api.telegram.org/bot<TOKEN>/deleteWebhook` |

---

## 🔄 更新代码的方法

### Vercel
```bash
# 本地改完代码后
git add .
git commit -m "更新了xxx"
git push
```
Vercel 会自动重新部署，等 1-2 分钟即可。

### aapanel
进入项目目录终端：
```bash
cd /www/wwwroot/tgkf-bot
git pull
```
然后到 PM2 管理器，点项目右侧的 **重启** 按钮。

---

祝你使用愉快！🎉
