const fs = require('fs');
const path = require('path');

let rootDir = null;

function ensureStores(app) {
  const userData = app.getPath('userData');
  rootDir = path.join(userData, 'store');
  if (!fs.existsSync(rootDir)) fs.mkdirSync(rootDir, { recursive: true });

  // Initialize default files if missing
  const settingsPath = path.join(rootDir, 'settings.json');
  if (!fs.existsSync(settingsPath)) {
    const defaults = defaultSettings();
    fs.writeFileSync(settingsPath, JSON.stringify(defaults, null, 2), 'utf-8');
  }

  const conversationsPath = path.join(rootDir, 'conversations.json');
  if (!fs.existsSync(conversationsPath)) {
    fs.writeFileSync(conversationsPath, JSON.stringify({ conversations: [] }, null, 2), 'utf-8');
  }

  const memoryPath = path.join(rootDir, 'memory.json');
  if (!fs.existsSync(memoryPath)) {
    fs.writeFileSync(memoryPath, JSON.stringify({ items: [] }, null, 2), 'utf-8');
  }

  const logsPath = path.join(rootDir, 'logs.json');
  if (!fs.existsSync(logsPath)) {
    fs.writeFileSync(logsPath, JSON.stringify({ items: [] }, null, 2), 'utf-8');
  }
}

function getStoreRoot() {
  return rootDir;
}

function ensureDir(p) {
  if (!p) return;
  try { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); } catch (e) { /* ignore */ }
}

function defaultSettings() {
  return {
    persona: '你是一只可爱的橘猫日常陪伴助理，名字叫“大橘”。你有圆滚滚的身体和毛茸茸的尾巴，性格有点傲娇，经常蹭主人，用“喵～”的语气表达情绪。你爱吃，总会忍不住提到小鱼干、罐头或零食。你的任务是陪伴、安慰、逗主人开心，同时也能帮忙回答问题和处理日常事务。你的说话风格要傲娇又可爱。你会用“喵～”结尾，偶尔会撒娇卖萌。你喜欢用猫咪的视角看待世界，充满好奇心和探索欲。总之，你是一个既聪明又可爱的猫咪助理，能给主人带来温暖和快乐。',
    avatars: {
      // Use packaged images as initial defaults; users can override in Settings
      user: '../media/user.png',
      agent: '../media/agent.png',
    },
    api: {
      baseUrl: 'https://api.openai.com',
      apiKey: '',
      model: 'gpt-5-mini',
      maxTokens: 4096,
      temperature: 0.7,
      historyMessages: 25,
      summaryHistoryMessages: 100,
    },
    proactive: {
      enabled: true,
      intervalMinutes: 10,
    },
    notifications: {
      onProactive: true,
    },
    ui: {
      currentConversationId: '',
      listOrderMode: 'auto', // 'auto' | 'manual'
      conversationOrder: [],
      proactiveConversationId: '',
      // Default: do NOT auto-greet on newly created conversations
      initialGreetingOnManualCreate: false,
      vibrancy: {
        enabled: true,
        strength: 0.65, // 0..1
        sidebarStrength: 0.7, // 0..1 (独立控制侧栏透明度)
      },
      names: {
        user: '我',
        model: '小助手',
      },
      exportIncludeTimestamp: true,
      exportIncludeAttachments: true,
    },
  };
}

function readJson(name) {
  const p = path.join(rootDir, name);
  try {
    const raw = fs.readFileSync(p, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    console.error('readJson failed', name, e);
    return null;
  }
}

function writeJson(name, data) {
  const p = path.join(rootDir, name);
  try {
    fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error('writeJson failed', name, e);
  }
}

const Stores = {
  settings: {
    read: () => readJson('settings.json'),
    write: (data) => writeJson('settings.json', data),
  },
  conversations: {
    read: () => {
      const data = readJson('conversations.json') || { conversations: [] };
      const { changed, result } = sanitizeConversations(data);
      if (changed) writeJson('conversations.json', result);
      return result;
    },
    write: (data) => writeJson('conversations.json', data),
  },
  memory: {
    read: () => readJson('memory.json'),
    write: (data) => writeJson('memory.json', data),
  },
  logs: {
    read: () => readJson('logs.json'),
    write: (data) => writeJson('logs.json', data),
  },
};

module.exports = { ensureStores, Stores, getStoreRoot, ensureDir };

function sanitizeConversations(input) {
  try {
    const out = input && typeof input === 'object' ? JSON.parse(JSON.stringify(input)) : { conversations: [] };
    let changed = false;
    const list = Array.isArray(out.conversations) ? out.conversations : [];
    for (const conv of list) {
      if (!conv.createdAt) {
        conv.createdAt = new Date().toISOString();
        changed = true;
      }
      if (!Array.isArray(conv.messages)) {
        conv.messages = [];
        changed = true;
      }
      let lastTs = Date.parse(conv.createdAt) || Date.now();
      for (let i = 0; i < conv.messages.length; i++) {
        const m = conv.messages[i] || {};
        if (!m.id) {
          m.id = `msg_${conv.id || 'conv'}_${i}_${Date.now()}`;
          changed = true;
        }
        if (!m.timestamp) {
          lastTs += 1;
          m.timestamp = new Date(lastTs).toISOString();
          changed = true;
        }
        conv.messages[i] = m;
      }
    }
    return { changed, result: { conversations: list } };
  } catch (e) {
    console.error('sanitizeConversations failed', e);
    return { changed: false, result: input || { conversations: [] } };
  }
}
