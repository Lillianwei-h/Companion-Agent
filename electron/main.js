const { app, BrowserWindow, ipcMain, Notification, dialog } = require('electron');
const path = require('path');
const { ensureStores, Stores } = require('../src/common/persist');
const { callChat, proactiveCheck, summarizeConversation, testApi } = require('../src/common/openai');

let mainWindow;
let proactiveTimer = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'Companion Agent',
  });

  mainWindow.loadFile(path.join(__dirname, '../src/renderer/index.html'));
}

app.whenReady().then(async () => {
  ensureStores(app);
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  startProactiveLoop();
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

function startProactiveLoop() {
  if (proactiveTimer) clearInterval(proactiveTimer);

  const settings = Stores.settings.read();
  if (!settings?.proactive?.enabled) return;

  const minutes = settings.proactive.intervalMinutes || 10;
  const intervalMs = Math.max(1, minutes) * 60 * 1000;

  proactiveTimer = setInterval(async () => {
    try {
      const settings = Stores.settings.read();
      if (!settings?.proactive?.enabled) return;

      const conversations = Stores.conversations.read();
      if (!conversations?.conversations?.length) return;

      const selId = settings?.ui?.currentConversationId;
      if (!selId) return; // Only send for explicitly selected conversation
      const conv = (conversations.conversations || []).find(c => c.id === selId);
      if (!conv) return;
      await maybeSendProactive(conv, settings);
    } catch (err) {
      console.error('Proactive loop error', err);
    }
  }, intervalMs);
}

async function maybeSendProactive(conversation, settings) {
  try {
    const now = new Date();
    const timeStr = now.toLocaleString();
    const memory = Stores.memory.read();

    const result = await proactiveCheck({
      settings,
      conversation,
      memory,
      now: timeStr,
    });

    // Log raw response including SKIP
    appendLog({
      type: 'proactive',
      conversationId: conversation.id,
      action: result?.action,
      message: result?.message || '',
      raw: result?.raw || '',
    });

    if (result?.action === 'SEND' && result?.message) {
      const updated = Stores.conversations.read();
      const conv = updated.conversations.find(c => c.id === conversation.id);
      if (!conv) return;
      const msg = {
        id: `msg_${Date.now()}`,
        role: 'assistant',
        content: result.message,
        timestamp: new Date().toISOString(),
      };
      conv.messages.push(msg);
      Stores.conversations.write(updated);

      const focused = mainWindow && mainWindow.isFocused();
      if (!focused && settings?.notifications?.onProactive) {
        const notif = new Notification({
          title: '穆有新消息',
          body: result.message.slice(0, 120),
        });
        notif.show();
      }

      // Notify renderer to refresh
      mainWindow?.webContents.send('data:conversations-updated');
    }
  } catch (err) {
    console.error('maybeSendProactive error', err);
  }
}

// IPC Handlers
ipcMain.handle('settings:get', async () => {
  return Stores.settings.read();
});

ipcMain.handle('settings:update', async (_evt, patch) => {
  const current = Stores.settings.read();
  const next = { ...current, ...patch };
  Stores.settings.write(next);
  // Restart proactive loop if interval or toggle changed
  startProactiveLoop();
  return next;
});

ipcMain.handle('conversations:list', async () => {
  return Stores.conversations.read();
});

ipcMain.handle('conversations:create', async (_evt, title) => {
  const store = Stores.conversations.read();
  const id = `conv_${Date.now()}`;
  const conv = {
    id,
    title: title || '新对话',
    createdAt: new Date().toISOString(),
    messages: [],
  };
  store.conversations.push(conv);
  Stores.conversations.write(store);
  return conv;
});

ipcMain.handle('conversations:rename', async (_evt, { id, title }) => {
  const store = Stores.conversations.read();
  const conv = store.conversations.find(c => c.id === id);
  if (conv) conv.title = title;
  Stores.conversations.write(store);
  return conv;
});

ipcMain.handle('conversations:delete', async (_evt, id) => {
  const store = Stores.conversations.read();
  store.conversations = store.conversations.filter(c => c.id !== id);
  Stores.conversations.write(store);
  return { ok: true };
});

ipcMain.handle('conversations:get', async (_evt, id) => {
  const store = Stores.conversations.read();
  return store.conversations.find(c => c.id === id);
});

ipcMain.handle('conversations:appendMessage', async (_evt, { id, message }) => {
  const store = Stores.conversations.read();
  const conv = store.conversations.find(c => c.id === id);
  if (!conv) return null;
  conv.messages.push({
    id: `msg_${Date.now()}`,
    role: message.role,
    content: message.content,
    timestamp: new Date().toISOString(),
  });
  Stores.conversations.write(store);
  return conv;
});

ipcMain.handle('memory:list', async () => {
  return Stores.memory.read();
});

ipcMain.handle('memory:add', async (_evt, item) => {
  const mem = Stores.memory.read();
  mem.items.push({
    id: `mem_${Date.now()}`,
    title: item.title || '记忆',
    content: item.content || '',
    createdAt: new Date().toISOString(),
    tags: item.tags || [],
  });
  Stores.memory.write(mem);
  return mem;
});

ipcMain.handle('memory:update', async (_evt, item) => {
  const mem = Stores.memory.read();
  const found = mem.items.find(i => i.id === item.id);
  if (found) {
    found.title = item.title;
    found.content = item.content;
    found.tags = item.tags || [];
  }
  Stores.memory.write(mem);
  return mem;
});

ipcMain.handle('memory:delete', async (_evt, id) => {
  const mem = Stores.memory.read();
  mem.items = mem.items.filter(i => i.id !== id);
  Stores.memory.write(mem);
  return mem;
});

ipcMain.handle('model:sendMessage', async (_evt, { conversationId, userText }) => {
  const settings = Stores.settings.read();
  const convStore = Stores.conversations.read();
  const conv = convStore.conversations.find(c => c.id === conversationId);
  if (!conv) throw new Error('Conversation not found');

  // Append user message
  const userMsg = { id: `msg_${Date.now()}`, role: 'user', content: userText, timestamp: new Date().toISOString() };
  conv.messages.push(userMsg);
  Stores.conversations.write(convStore);

  const memory = Stores.memory.read();
  const reply = await callChat({ settings, conversation: conv, memory });
  const assistantMsg = { id: `msg_${Date.now()+1}`, role: 'assistant', content: reply, timestamp: new Date().toISOString() };
  conv.messages.push(assistantMsg);
  Stores.conversations.write(convStore);

  appendLog({ type: 'chat', conversationId, action: 'SEND', message: reply, raw: reply });

  return assistantMsg;
});

ipcMain.handle('conversations:summarizeToMemory', async (_evt, { conversationId }) => {
  const settings = Stores.settings.read();
  const convStore = Stores.conversations.read();
  const conv = convStore.conversations.find(c => c.id === conversationId);
  if (!conv) throw new Error('Conversation not found');
  const text = await summarizeConversation({ settings, conversation: conv });
  const mem = Stores.memory.read();
  mem.items.push({
    id: `mem_${Date.now()}`,
    title: conv.title + ' 摘要',
    content: text,
    createdAt: new Date().toISOString(),
    tags: ['summary'],
  });
  Stores.memory.write(mem);
  return text;
});

ipcMain.handle('dialog:pickAvatar', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: '选择头像图片',
    properties: ['openFile'],
    filters: [
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] },
    ],
  });
  if (res.canceled || !res.filePaths?.[0]) return null;
  return res.filePaths[0];
});

// API Diagnostics
ipcMain.handle('api:test', async (_evt, patch) => {
  try {
    const current = Stores.settings.read() || {};
    const merged = {
      ...current,
      ...(patch || {}),
      api: { ...current.api, ...(patch?.api || {}) },
    };
    const content = await testApi({ settings: merged });
    appendLog({ type: 'test', action: 'RECV', message: content, raw: content });
    return { ok: true, content };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
});

// Debug: send a test system notification (macOS will prompt permission on first use)
ipcMain.handle('debug:notify', async () => {
  try {
    const notif = new Notification({
      title: '测试通知 / Test Notification',
      body: '这是来自应用的测试通知。',
    });
    notif.show();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
});

// Debug: run proactive check once immediately for all conversations
ipcMain.handle('proactive:once', async () => {
  try {
    const settings = Stores.settings.read();
    if (!settings?.proactive?.enabled) {
      // still allow check to run; mirror loop behavior but don't hard stop
    }
    const now = new Date().toLocaleString();
    const memory = Stores.memory.read();
    const store = Stores.conversations.read();
    let sent = 0;
    const selId = settings?.ui?.currentConversationId;
    if (!selId) return { ok: true, checked: 0, sent: 0 };
    const conv = (store.conversations || []).find(c => c.id === selId);
    if (!conv) return { ok: true, checked: 0, sent: 0 };
    const result = await proactiveCheck({ settings, conversation: conv, memory, now });
    appendLog({
      type: 'proactive',
      conversationId: conv.id,
      action: result?.action,
      message: result?.message || '',
      raw: result?.raw || '',
    });
    if (result?.action === 'SEND' && result?.message) {
      conv.messages.push({
        id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        role: 'assistant',
        content: result.message,
        timestamp: new Date().toISOString(),
      });
      sent++;
      Stores.conversations.write(store);
      mainWindow?.webContents.send('data:conversations-updated');
    }
    const focused = mainWindow && mainWindow.isFocused();
    const s = settings?.notifications?.onProactive !== false; // default true
    if (!focused && s && sent > 0) {
      const notif = new Notification({
        title: '已触发一次主动检查',
        body: `新增 ${sent} 条自动消息`,
      });
      notif.show();
    }
    return { ok: true, checked: conv ? 1 : 0, sent };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
});

// UI selection of current conversation
ipcMain.handle('ui:setCurrentConversation', async (_evt, id) => {
  try {
    const s = Stores.settings.read() || {};
    const ui = { ...(s.ui || {}), currentConversationId: id || '' };
    Stores.settings.write({ ...s, ui });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});

// Logs: list and clear
ipcMain.handle('logs:list', async (_evt, limit = 100) => {
  const logs = Stores.logs.read() || { items: [] };
  const items = (logs.items || []).slice(-Math.max(1, Math.min(1000, Number(limit) || 100)));
  return items;
});

ipcMain.handle('logs:clear', async () => {
  Stores.logs.write({ items: [] });
  return { ok: true };
});

function appendLog(entry) {
  try {
    const logs = Stores.logs.read() || { items: [] };
    const item = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      time: new Date().toISOString(),
      ...entry,
    };
    logs.items.push(item);
    // Cap size to avoid unbounded growth
    if (logs.items.length > 1000) logs.items = logs.items.slice(-800);
    Stores.logs.write(logs);
  } catch (e) {
    console.error('appendLog failed', e);
  }
}
