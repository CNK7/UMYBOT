const fs = require('fs');
const path = require('path');
const os = require('os');

const isVercel = !!process.env.VERCEL || process.env.NODE_ENV === 'production';

let dataDir;
if (isVercel) {
  dataDir = path.join(os.tmpdir(), 'tgkf-bot-data');
} else {
  dataDir = path.join(__dirname, '..', 'data');
}
const usersFile = path.join(dataDir, 'users.json');
const sessionsFile = path.join(dataDir, 'sessions.json');

let storageWarned = false;
function warnStorage() {
  if (!storageWarned && isVercel) {
    console.warn('⚠️  [存储警告] 当前运行在 Vercel Serverless 环境，用户/会话数据仅保存在临时目录 /tmp');
    console.warn('⚠️  [存储警告] 冷启动后数据会丢失！用户量大或需要持久化请使用 aapanel 部署。');
    storageWarned = true;
  }
}

(function initDir() {
  try {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.accessSync(dataDir, fs.constants.W_OK);
  } catch (e) {
    console.warn(`⚠️  数据目录不可写 ${dataDir}: ${e.message}`);
    console.warn('⚠️  将使用纯内存存储（进程重启后数据会丢失）');
  }
})();

function readJson(file, defaultVal) {
  warnStorage();
  try {
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, 'utf8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn(`读取 ${path.basename(file)} 失败: ${e.message}`);
  }
  return defaultVal;
}

let writeInProgress = false;
const pendingWrites = [];

function writeJson(file, data) {
  warnStorage();
  const doWrite = () => {
    try {
      const tmpFile = file + '.tmp';
      fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf8');
      fs.renameSync(tmpFile, file);
    } catch (e) {
      console.warn(`写入 ${path.basename(file)} 失败: ${e.message}`);
    } finally {
      writeInProgress = false;
      if (pendingWrites.length > 0) {
        const next = pendingWrites.shift();
        writeInProgress = true;
        setTimeout(next, 0);
      }
    }
  };
  if (writeInProgress) {
    pendingWrites.push(doWrite);
  } else {
    writeInProgress = true;
    doWrite();
  }
}

let users = readJson(usersFile, {});
let sessions = readJson(sessionsFile, {});

function saveUsers() {
  writeJson(usersFile, users);
}

function saveSessions() {
  writeJson(sessionsFile, sessions);
}

function addUser(userId, username, firstName, lastName) {
  userId = String(userId);
  if (!users[userId]) {
    users[userId] = {
      id: userId,
      username: username || '',
      firstName: firstName || '',
      lastName: lastName || '',
      joinedAt: new Date().toISOString(),
    };
    saveUsers();
    return true;
  }
  return false;
}

function getAllUsers() {
  return Object.values(users);
}

function getUserCount() {
  return Object.keys(users).length;
}

function createSession(userId, adminMsgId, userMsgId) {
  sessions[String(adminMsgId)] = {
    userId: String(userId),
    userMsgId: userMsgId,
    createdAt: new Date().toISOString(),
  };
  saveSessions();
}

function getSession(adminMsgId) {
  return sessions[String(adminMsgId)] || null;
}

function deleteSession(adminMsgId) {
  const key = String(adminMsgId);
  if (sessions[key]) {
    delete sessions[key];
    saveSessions();
  }
}

module.exports = {
  addUser,
  getAllUsers,
  getUserCount,
  createSession,
  getSession,
  deleteSession,
  isVercel,
};
