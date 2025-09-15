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
    persona: '你是一位温暖、细心、可靠的日常陪伴型助理。你会尊重我的节奏，不过度打扰；当你觉得我可能需要提醒、鼓励或灵感时，再主动联系我。',
    avatars: {
      user: '',
      agent: '',
    },
    api: {
      baseUrl: 'https://api.openai.com',
      apiKey: '',
      model: 'gpt-4o-mini',
      maxTokens: 256,
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
      vibrancy: {
        enabled: true,
        strength: 0.65, // 0..1
        sidebarStrength: 0.35, // 0..1 (独立控制侧栏透明度)
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
