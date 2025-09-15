const { app, BrowserWindow, ipcMain, Notification, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { ensureStores, Stores, getStoreRoot, ensureDir } = require('../src/common/persist');
const { callChat, proactiveCheck, summarizeConversation, testApi, initialGreeting } = require('../src/common/openai');

let mainWindow;
let proactiveTimer = null;
let proactiveIntervalMs = 0;
let proactiveNextAt = 0; // epoch ms for next scheduled proactive tick

function pad2(n) { return String(n).padStart(2, '0'); }

function buildAttachmentRelPath(conversationId, messageId, srcPath, now = new Date()) {
  const y = now.getFullYear();
  const m = pad2(now.getMonth() + 1);
  const base = (srcPath || '').split(/[\\/]/).pop() || 'file';
  const file = typeof normalizeFilename === 'function' ? normalizeFilename(base) : safeFilename(base);
  return require('path').join('attachments', String(y), String(m), String(conversationId || 'conv'), String(messageId || 'msg'), file);
}

function storeAttachmentFile(conversationId, messageId, srcPath, mime) {
  try {
    if (!srcPath) return null;
    const root = getStoreRoot();
    let rel = buildAttachmentRelPath(conversationId, messageId, srcPath);
    const pathmod = require('path');
    let abs = pathmod.join(root, rel);
    const dir = pathmod.dirname(abs);
    ensureDir(dir);
    const fsmod = require('fs');
    // Handle name collision by appending suffix
    if (fsmod.existsSync(abs)) {
      const ext = pathmod.extname(abs);
      const name = pathmod.basename(abs, ext);
      let i = 1;
      let candidate;
      do {
        candidate = pathmod.join(dir, `${name}_${i}${ext}`);
        i++;
      } while (fsmod.existsSync(candidate));
      abs = candidate;
    }
    fsmod.copyFileSync(srcPath, abs);
    // Recompute rel to reflect final absolute path
    rel = pathmod.relative(root, abs);
    return { path: abs, mime: mime || '', rel };
  } catch (e) {
    console.error('storeAttachmentFile failed', e);
    return null;
  }
}

// Attempt to normalize and migrate all historical attachments in conversations.json
ipcMain.handle('attachments:migrate', async () => {
  try {
    const root = getStoreRoot();
    const store = Stores.conversations.read();
    let moved = 0, updated = 0, errors = 0;
    const pathmod = require('path');
    const fsmod = require('fs');

    for (const conv of (store.conversations || [])) {
      for (const m of (conv.messages || [])) {
        const stamp = new Date(m.timestamp || conv.createdAt || Date.now());
        const processOne = (p, mime) => {
          try {
            if (!p || typeof p !== 'string') return null;
            const src = p;
            const targetRel = buildAttachmentRelPath(conv.id, m.id, src, stamp);
            let targetAbs = pathmod.join(root, targetRel);
            const dir = pathmod.dirname(targetAbs);
            ensureDir(dir);
            // If already same normalized path, skip
            if (pathmod.resolve(src) === pathmod.resolve(targetAbs)) return { path: targetAbs };
            // Resolve conflicts
            if (fsmod.existsSync(targetAbs)) {
              const ext = pathmod.extname(targetAbs);
              const name = pathmod.basename(targetAbs, ext);
              let i = 1, cand;
              do { cand = pathmod.join(dir, `${name}_${i}${ext}`); i++; } while (fsmod.existsSync(cand));
              targetAbs = cand;
            }
            // Copy then unlink if source under store and different path
            try { fsmod.copyFileSync(src, targetAbs); moved++; } catch (e) { errors++; return null; }
            const rel = pathmod.relative(root, targetAbs);
            try {
              const relSrc = pathmod.relative(root, src);
              if (!relSrc.startsWith('..') && pathmod.resolve(src) !== pathmod.resolve(targetAbs)) {
                try { fsmod.unlinkSync(src); } catch {}
              }
            } catch {}
            return { path: targetAbs, rel };
          } catch (e) { errors++; return null; }
        };

        // attachments array
        if (Array.isArray(m.attachments)) {
          for (let i = 0; i < m.attachments.length; i++) {
            const a = m.attachments[i] || {};
            const res = processOne(a.path, a.mime || '');
            if (res && res.path) { m.attachments[i].path = res.path; updated++; }
          }
        }
        // legacy fields
        if (m.imagePath) {
          const res = processOne(m.imagePath, m.imageMime || '');
          if (res && res.path) { m.imagePath = res.path; updated++; }
        }
        if (m.pdfPath) {
          const res = processOne(m.pdfPath, m.pdfMime || 'application/pdf');
          if (res && res.path) { m.pdfPath = res.path; updated++; }
        }
      }
    }

    Stores.conversations.write(store);
    return { ok: true, moved, updated, errors };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});

function createWindow() {
  const settings = Stores.settings.read() || {};
  const vibEnabled = process.platform === 'darwin' && (settings?.ui?.vibrancy?.enabled ?? true);
  const macVibrancy = vibEnabled ? {
    vibrancy: 'under-window',
    visualEffectState: 'active',
    transparent: true,
    backgroundColor: '#00000000',
    titleBarStyle: 'hiddenInset',
    titleBarOverlay: true,
  } : {};

  mainWindow = new BrowserWindow({
    width: 600,
    height: 800,
    minWidth: 400, // default when sidebar可见；收起后由渲染进程动态调到400
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'Companion Agent',
    ...macVibrancy,
  });

  mainWindow.loadFile(path.join(__dirname, '../src/renderer/index.html'));

  // Build and set application menu with Preferences…
  try { setAppMenu(); } catch (e) { console.error('setAppMenu failed', e); }
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

function setAppMenu() {
  const isMac = process.platform === 'darwin';
  const template = [];
  if (isMac) {
    template.push({
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          label: 'Preferences…',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            try {
              const win = BrowserWindow.getFocusedWindow() || mainWindow;
              win?.webContents.send('ui:openSettings');
            } catch {}
          },
        },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    });
  }
  // File menu (with Preferences on non-mac)
  template.push({
    label: 'File',
    submenu: [
      ...(!isMac ? [{
        label: 'Preferences…', accelerator: 'CmdOrCtrl+,', click: () => {
          try {
            const win = BrowserWindow.getFocusedWindow() || mainWindow;
            win?.webContents.send('ui:openSettings');
          } catch {}
        },
      }, { type: 'separator' }] : []),
      isMac ? { role: 'close' } : { role: 'quit' },
    ],
  });
  // Edit menu
  template.push({
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      ...(isMac ? [
        { role: 'pasteAndMatchStyle' },
        { role: 'delete' },
        { role: 'selectAll' },
        { type: 'separator' },
        {
          label: 'Speech',
          submenu: [
            { role: 'startSpeaking' },
            { role: 'stopSpeaking' },
          ],
        },
      ] : [
        { role: 'delete' },
        { type: 'separator' },
        { role: 'selectAll' },
      ]),
    ],
  });
  // View menu
  template.push({
    label: 'View',
    submenu: [
      {
        label: 'Toggle Sidebar',
        accelerator: 'CmdOrCtrl+B',
        click: () => { try { mainWindow?.webContents.send('ui:toggleSidebar'); } catch {} },
      },
      { type: 'separator' },
      { role: 'reload' },
      { role: 'forceReload' },
      { role: 'toggleDevTools' },
      { type: 'separator' },
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' },
    ],
  });
  // Window menu
  template.push({
    label: 'Window',
    submenu: [
      { role: 'minimize' },
      { role: 'zoom' },
      ...(isMac ? [
        { type: 'separator' },
        { role: 'front' },
        { type: 'separator' },
        { role: 'window' },
      ] : [ { role: 'close' } ]),
    ],
  });
  // Help (optional minimal)
  template.push({ label: 'Help', submenu: [{ role: 'toggleDevTools', label: 'Toggle Developer Tools' }] });
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// UI: allow renderer to adjust minimum window width (e.g., when sidebar collapsed)
ipcMain.handle('ui:setMinWidth', async (_evt, width) => {
  try {
    if (!mainWindow) return { ok: false, error: 'no-window' };
    const w = Math.max(0, Number(width) || 0);
    const cur = (typeof mainWindow.getMinimumSize === 'function') ? mainWindow.getMinimumSize() : [400, 0];
    const minH = Array.isArray(cur) ? (cur[1] || 0) : 0;
    mainWindow.setMinimumSize(w, minH);
    return { ok: true, width: w, height: minH };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});

function formatStartTime(date) {
  try {
    // Localized string without seconds, 24h if supported
    return date.toLocaleString(undefined, {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
  } catch (e) {
    // Fallback: ISO without seconds
    return date.toISOString().slice(0, 16).replace('T', ' ');
  }
}

function startProactiveLoop() {
  if (proactiveTimer) clearInterval(proactiveTimer);

  const settings = Stores.settings.read();
  if (!settings?.proactive?.enabled) {
    proactiveIntervalMs = 0;
    proactiveNextAt = 0;
    return;
  }

  const minutes = settings.proactive.intervalMinutes || 10;
  const intervalMs = Math.max(1, minutes) * 60 * 1000;
  proactiveIntervalMs = intervalMs;
  proactiveNextAt = Date.now() + intervalMs;

  proactiveTimer = setInterval(async () => {
    try {
      const settings = Stores.settings.read();
      if (!settings?.proactive?.enabled) return;

      const conv = await getProactiveConversation(settings);
      if (!conv) return;
      await maybeSendProactive(conv, settings);
    } catch (err) {
      console.error('Proactive loop error', err);
    } finally {
      if (proactiveIntervalMs > 0) {
        proactiveNextAt = Date.now() + proactiveIntervalMs;
      }
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
          title: '来自' + settings?.ui?.names?.model || '穆' + ' 的新消息',
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
  const now = new Date();
  const conv = {
    id,
    title: title || formatStartTime(now),
    createdAt: now.toISOString(),
    messages: [],
  };
  store.conversations.push(conv);
  Stores.conversations.write(store);
  // If no proactive pinned conversation is set, pin this newly created one
  try {
    const s = Stores.settings.read() || {};
    const ui = { ...(s.ui || {}) };
    if (!ui.proactiveConversationId) {
      ui.proactiveConversationId = id;
      Stores.settings.write({ ...s, ui });
    }
  } catch (e) {
    console.error('auto-pin on create failed', e);
  }
  // Kick off initial greeting asynchronously to avoid blocking creation response
  setTimeout(async () => {
    try {
      const settings = Stores.settings.read();
      const memory = Stores.memory.read();
      const text = await initialGreeting({ settings, memory });
      if (text) {
        const convStore = Stores.conversations.read();
        const c = convStore.conversations.find(x => x.id === id);
        if (c) {
          c.messages.push({ id: `msg_${Date.now()}`, role: 'assistant', content: text, timestamp: new Date().toISOString() });
          Stores.conversations.write(convStore);
          mainWindow?.webContents.send('data:conversations-updated');
        }
      }
    } catch (e) {
      console.error('initial greeting failed', e);
    }
  }, 0);
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
  // Reset proactive timer when user actively replies
  try {
    const isUser = String(message?.role) === 'user' && String(message?.content || '').trim().length > 0;
    if (isUser) startProactiveLoop();
  } catch {}
  return conv;
});

ipcMain.handle('conversations:updateMessage', async (_evt, { conversationId, messageId, content }) => {
  const store = Stores.conversations.read();
  const conv = store.conversations.find(c => c.id === conversationId);
  if (!conv) return { ok: false, error: 'Conversation not found' };
  const msg = (conv.messages || []).find(m => m.id === messageId);
  if (!msg) return { ok: false, error: 'Message not found' };
  msg.content = content;
  Stores.conversations.write(store);
  mainWindow?.webContents.send('data:conversations-updated');
  return { ok: true };
});

ipcMain.handle('conversations:deleteMessage', async (_evt, { conversationId, messageId }) => {
  const store = Stores.conversations.read();
  const conv = store.conversations.find(c => c.id === conversationId);
  if (!conv) return { ok: false, error: 'Conversation not found' };
  const before = conv.messages?.length || 0;
  conv.messages = (conv.messages || []).filter(m => m.id !== messageId);
  if (conv.messages.length === before) return { ok: false, error: 'Message not found' };
  Stores.conversations.write(store);
  mainWindow?.webContents.send('data:conversations-updated');
  return { ok: true };
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

ipcMain.handle('model:sendMessage', async (_evt, payload) => {
  const { conversationId, userText, imagePath, imageMime, pdfPath, pdfMime, attachments } = payload || {};
  // Extended to support optional imagePath/imageMime for Gemini
  const settings = Stores.settings.read();
  const convStore = Stores.conversations.read();
  const conv = convStore.conversations.find(c => c.id === conversationId);
  if (!conv) throw new Error('Conversation not found');

  // Append user message only if non-empty
  const trimmed = (userText || '').trim();
  if (trimmed || imagePath || pdfPath || (Array.isArray(attachments) && attachments.length)) {
    const userMsg = { id: `msg_${Date.now()}`, role: 'user', content: trimmed, timestamp: new Date().toISOString() };
    // Normalize attachments
    const list = [];
    if (Array.isArray(attachments)) {
      for (const a of attachments) {
        if (a && a.path) list.push({ path: a.path, mime: a.mime || '' });
      }
    }
    if (imagePath) list.push({ path: imagePath, mime: imageMime || '' });
    if (pdfPath) list.push({ path: pdfPath, mime: pdfMime || 'application/pdf' });
    // Copy to app store and replace with stored paths
    const stored = [];
    for (const a of list) {
      const saved = storeAttachmentFile(conversationId, userMsg.id, a.path, a.mime);
      if (saved) stored.push({ path: saved.path, mime: saved.mime, rel: saved.rel });
    }
    if (stored.length) {
      userMsg.attachments = stored.map(s => ({ path: s.path, mime: s.mime }));
      // Back-compat: also set first image/pdf fields for old renderers
      const firstImg = stored.find(a => String(a.mime).startsWith('image/'));
      const firstPdf = stored.find(a => String(a.mime) === 'application/pdf' || String(a.path).toLowerCase().endsWith('.pdf'));
      if (firstImg) { userMsg.imagePath = firstImg.path; userMsg.imageMime = firstImg.mime; }
      if (firstPdf) { userMsg.pdfPath = firstPdf.path; userMsg.pdfMime = firstPdf.mime; }
    }
    conv.messages.push(userMsg);
    Stores.conversations.write(convStore);
    // User replied: restart proactive interval countdown
    startProactiveLoop();
  }

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

ipcMain.handle('dialog:pickImage', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: '选择要发送的图片',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] },
    ],
  });
  if (res.canceled || !res.filePaths?.length) return null;
  return res.filePaths;
});

ipcMain.handle('dialog:pickPdf', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: '选择要发送的 PDF',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'PDF', extensions: ['pdf'] },
    ],
  });
  if (res.canceled || !res.filePaths?.length) return null;
  return res.filePaths;
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
    let sent = 0;
    const conv = await getProactiveConversation(settings);
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
      const st = Stores.conversations.read();
      const c = st.conversations.find(x => x.id === conv.id);
      if (c) {
        c.messages.push({
          id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          role: 'assistant',
          content: result.message,
          timestamp: new Date().toISOString(),
        });
        sent++;
        Stores.conversations.write(st);
        mainWindow?.webContents.send('data:conversations-updated');
      }
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

// Proactive status for countdown in settings panel
ipcMain.handle('proactive:status', async () => {
  try {
    const s = Stores.settings.read() || {};
    const enabled = !!s?.proactive?.enabled;
    const interval = s?.proactive?.intervalMinutes || 10;
    return {
      ok: true,
      enabled,
      intervalMinutes: interval,
      intervalMs: proactiveIntervalMs,
      nextAt: proactiveNextAt,
      now: Date.now(),
    };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
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

// Open file with OS default handler
ipcMain.handle('file:open', async (_evt, filePath) => {
  try {
    const res = await shell.openPath(String(filePath || ''));
    if (res) return { ok: false, error: res };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});

// Save a copy of a file to user-selected location
ipcMain.handle('file:saveCopy', async (_evt, filePath) => {
  try {
    const src = String(filePath || '');
    if (!src) return { ok: false, error: 'no-path' };
    const pathmod = require('path');
    const base = safeFilename(pathmod.basename(src));
    const ext = pathmod.extname(base).toLowerCase();
    const filters = [];
    if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'].includes(ext)) {
      filters.push({ name: 'Images', extensions: ['png','jpg','jpeg','gif','webp','bmp'] });
    }
    filters.push({ name: 'All Files', extensions: ['*'] });
    const res = await dialog.showSaveDialog(mainWindow, {
      title: '另存为',
      defaultPath: base || 'image',
      filters,
    });
    if (res.canceled || !res.filePath) return { ok: false, canceled: true };
    fs.copyFileSync(src, res.filePath);
    return { ok: true, path: res.filePath };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
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

// Apply vibrancy dynamically (macOS)
ipcMain.handle('ui:applyVibrancy', async (_evt, enabled) => {
  try {
    if (process.platform !== 'darwin') return { ok: true };
    if (!mainWindow) return { ok: false, error: 'no-window' };
    mainWindow.setVibrancy(enabled ? 'under-window' : null);
    mainWindow.setBackgroundColor(enabled ? '#00000000' : '#000000');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});

// Export conversation as JSON or Markdown
ipcMain.handle('conversations:export', async (_evt, { conversationId, format, includeTimestamp, includeAttachments }) => {
  try {
    const store = Stores.conversations.read();
    const conv = (store.conversations || []).find(c => c.id === conversationId);
    if (!conv) return { ok: false, error: 'Conversation not found' };
    const wantZip = !!includeAttachments;
    const settings = Stores.settings.read() || {};
    const names = { user: settings?.ui?.names?.user || '用户', model: settings?.ui?.names?.model || '助手' };
    if (!wantZip) {
      const ext = String(format).toLowerCase() === 'md' || format === 'markdown' ? 'md' : 'json';
      const defaultName = safeFilename(`${conv.title || '对话'}-${new Date().toISOString().slice(0,16).replace(/[:T]/g,'')}.${ext}`);
      const res = await dialog.showSaveDialog(mainWindow, {
        title: '导出对话',
        defaultPath: defaultName,
        filters: ext === 'md'
          ? [{ name: 'Markdown', extensions: ['md'] }]
          : [{ name: 'JSON', extensions: ['json'] }],
      });
      if (res.canceled || !res.filePath) return { ok: false, canceled: true };
      const filePath = res.filePath;
      const content = (ext === 'md')
        ? conversationToMarkdown(conv, !!includeTimestamp, { names })
        : JSON.stringify(filterConversationTimestamps(conv, !!includeTimestamp), null, 2);
      fs.writeFileSync(filePath, content, 'utf-8');
      return { ok: true, path: filePath };
    }

    // ZIP with attachments
    let archiver;
    try { archiver = require('archiver'); } catch (e) { return { ok: false, error: '缺少依赖 archiver，请先运行 npm i' }; }
    const defaultZip = safeFilename(`${conv.title || '对话'}-${new Date().toISOString().slice(0,16).replace(/[:T]/g,'')}.zip`);
    const r = await dialog.showSaveDialog(mainWindow, {
      title: '导出对话（含附件）',
      defaultPath: defaultZip,
      filters: [{ name: 'Zip', extensions: ['zip'] }],
    });
    if (r.canceled || !r.filePath) return { ok: false, canceled: true };
    const out = fs.createWriteStream(r.filePath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(out);

    const ext = String(format).toLowerCase() === 'md' || format === 'markdown' ? 'md' : 'json';
    const fileBase = safeFilename(`${conv.title || '对话'}.${ext}`);

    const files = collectConversationAttachments(conv);
    const pathMap = buildZipRelPathMap(conv, files);
    if (ext === 'md') {
      const md = conversationToMarkdown(conv, !!includeTimestamp, { attachmentsRelMap: pathMap, names });
      archive.append(md, { name: fileBase });
    } else {
      const convCopy = rewriteConversationPaths(conv, pathMap, !!includeTimestamp);
      archive.append(JSON.stringify(convCopy, null, 2), { name: fileBase });
    }
    for (const f of files) {
      const rel = pathMap[f.path];
      if (!rel) continue;
      try { archive.file(f.path, { name: rel }); } catch {}
    }
    await archive.finalize();
    return await new Promise((resolve) => {
      out.on('close', () => resolve({ ok: true, path: r.filePath }));
      out.on('error', (e) => resolve({ ok: false, error: e?.message || String(e) }));
    });
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});

function safeFilename(name) {
  return String(name || '')
    .replace(/[\\/:*?"<>|\n\r]+/g, '_')
    .slice(0, 120);
}

// Normalize a filename for attachments: remove spaces and special chars except underscore; keep sanitized extension
function normalizeFilename(original) {
  try {
    const pathmod = require('path');
    const extRaw = pathmod.extname(String(original || ''));
    const baseRaw = pathmod.basename(String(original || ''), extRaw);
    const base = String(baseRaw).replace(/\s+/g, '').replace(/[^A-Za-z0-9_]+/g, '');
    const extClean = String(extRaw).replace(/\./g, '').replace(/[^A-Za-z0-9]+/g, '');
    const name = base || 'file';
    return name + (extClean ? ('.' + extClean) : '');
  } catch {
    return 'file';
  }
}

function conversationToMarkdown(conv, includeTs = true, opts = {}) {
  const lines = [];
  lines.push(`# ${conv.title || '对话'}`);
  if (includeTs && conv.createdAt) lines.push(`创建时间: ${new Date(conv.createdAt).toLocaleString()}`);
  lines.push('');
  for (const m of (conv.messages || [])) {
    const displayNames = {
      user: (opts?.names?.user || '用户'),
      model: (opts?.names?.model || '助手'),
    };
    const role = m.role === 'user' ? displayNames.user : (m.role === 'assistant' ? displayNames.model : (m.role || '系统'));
    const ts = m.timestamp ? new Date(m.timestamp).toLocaleString() : '';
    lines.push(includeTs ? `## ${role} · ${ts}`.trim() : `## ${role}`);
    lines.push('');
    lines.push(m.content || '');
    // Inline/link attachments when rel map provided
    const relMap = opts.attachmentsRelMap || {};
    if (Object.keys(relMap).length) {
      const items = [];
      if (Array.isArray(m.attachments)) {
        for (const a of m.attachments) {
          if (!a?.path) continue;
          const rel = relMap[a.path];
          if (!rel) continue;
          if (String(a?.mime || '').startsWith('image/') || rel.match(/\.(png|jpe?g|gif|webp|bmp)$/i)) {
            items.push(`![](${rel})`);
          } else if (a?.mime === 'application/pdf' || rel.toLowerCase().endsWith('.pdf')) {
            const name = rel.split('/').pop();
            items.push(`[PDF: ${name}](${rel})`);
          } else {
            const name = rel.split('/').pop();
            items.push(`[附件: ${name}](${rel})`);
          }
        }
      } else {
        if (m.imagePath && relMap[m.imagePath]) items.push(`![](${relMap[m.imagePath]})`);
        if (m.pdfPath && relMap[m.pdfPath]) { const name = relMap[m.pdfPath].split('/').pop(); items.push(`[PDF: ${name}](${relMap[m.pdfPath]})`); }
      }
      if (items.length) { lines.push(''); lines.push(...items); }
    }
    lines.push('');
  }
  return lines.join('\n');
}

ipcMain.handle('conversations:exportAll', async (_evt, { format, includeTimestamp, includeAttachments }) => {
  try {
    const store = Stores.conversations.read();
    const list = store.conversations || [];
    const settings = Stores.settings.read() || {};
    const names = { user: settings?.ui?.names?.user || '用户', model: settings?.ui?.names?.model || '助手' };
    const wantZip = !!includeAttachments;
    if (!wantZip) {
      const ext = String(format).toLowerCase() === 'md' || format === 'markdown' ? 'md' : 'json';
      const defaultName = `所有对话-${new Date().toISOString().slice(0,16).replace(/[:T]/g,'')}.${ext}`;
      const res = await dialog.showSaveDialog(mainWindow, {
        title: '导出全部对话',
        defaultPath: defaultName,
        filters: ext === 'md'
          ? [{ name: 'Markdown', extensions: ['md'] }]
          : [{ name: 'JSON', extensions: ['json'] }],
      });
      if (res.canceled || !res.filePath) return { ok: false, canceled: true };
      const filePath = res.filePath;
      const content = (ext === 'md')
        ? conversationsToMarkdown(list, !!includeTimestamp, { names })
        : JSON.stringify({ conversations: list.map(c => filterConversationTimestamps(c, !!includeTimestamp)) }, null, 2);
      fs.writeFileSync(filePath, content, 'utf-8');
      return { ok: true, path: filePath };
    }

    let archiver;
    try { archiver = require('archiver'); } catch (e) { return { ok: false, error: '缺少依赖 archiver，请先运行 npm i' }; }
    const defaultZip = `所有对话-${new Date().toISOString().slice(0,16).replace(/[:T]/g,'')}.zip`;
    const r = await dialog.showSaveDialog(mainWindow, {
      title: '导出全部对话（含附件）',
      defaultPath: defaultZip,
      filters: [{ name: 'Zip', extensions: ['zip'] }],
    });
    if (r.canceled || !r.filePath) return { ok: false, canceled: true };
    const out = fs.createWriteStream(r.filePath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(out);

    const ext = String(format).toLowerCase() === 'md' || format === 'markdown' ? 'md' : 'json';
    const fileBase = `所有对话.${ext}`;

    const allFiles = [];
    const pathMapAll = {};
    for (const conv of list) {
      const files = collectConversationAttachments(conv);
      for (const f of files) { allFiles.push(f); }
      const map = buildZipRelPathMap(conv, files);
      Object.assign(pathMapAll, map);
    }

    if (ext === 'md') {
      const md = conversationsToMarkdown(list, !!includeTimestamp, { attachmentsRelMapAll: pathMapAll, names });
      archive.append(md, { name: fileBase });
    } else {
      const convsCopy = list.map(c => rewriteConversationPaths(c, buildZipRelPathMap(c, collectConversationAttachments(c)), !!includeTimestamp));
      archive.append(JSON.stringify({ conversations: convsCopy }, null, 2), { name: fileBase });
    }

    for (const f of allFiles) {
      const rel = pathMapAll[f.path];
      if (!rel) continue;
      try { archive.file(f.path, { name: rel }); } catch {}
    }
    await archive.finalize();
    return await new Promise((resolve) => {
      out.on('close', () => resolve({ ok: true, path: r.filePath }));
      out.on('error', (e) => resolve({ ok: false, error: e?.message || String(e) }));
    });
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});

function conversationsToMarkdown(convs, includeTs = true, opts = {}) {
  const parts = [];
  parts.push(`# 所有对话`);
  parts.push('');
  for (const conv of convs) {
    // local map from global map if provided
    let localMap = {};
    if (opts.attachmentsRelMapAll) {
      const files = collectConversationAttachments(conv);
      for (const f of files) {
        if (opts.attachmentsRelMapAll[f.path]) localMap[f.path] = opts.attachmentsRelMapAll[f.path];
      }
    }
    parts.push(conversationToMarkdown(conv, includeTs, { attachmentsRelMap: localMap, names: opts.names }));
    parts.push('');
  }
  return parts.join('\n');
}

function filterConversationTimestamps(conv, includeTs = true) {
  if (includeTs) return conv;
  try {
    const copy = JSON.parse(JSON.stringify(conv));
    if (copy) {
      if (copy.createdAt) delete copy.createdAt;
      if (Array.isArray(copy.messages)) {
        copy.messages = copy.messages.map(m => { const n = { ...m }; delete n.timestamp; return n; });
      }
    }
    return copy;
  } catch {
    return conv;
  }
}

function collectConversationAttachments(conv) {
  const files = [];
  for (const m of (conv.messages || [])) {
    if (Array.isArray(m.attachments)) {
      for (const a of m.attachments) { if (a?.path) files.push({ path: a.path, messageId: m.id }); }
    }
    if (m.imagePath) files.push({ path: m.imagePath, messageId: m.id });
    if (m.pdfPath) files.push({ path: m.pdfPath, messageId: m.id });
  }
  const seen = new Set();
  const out = [];
  for (const f of files) { if (!seen.has(f.path)) { seen.add(f.path); out.push(f); } }
  return out;
}

function buildZipRelPathMap(conv, files) {
  const map = {};
  const convId = conv.id || safeFilename(conv.title || 'conv');
  for (const f of (files || [])) {
    const base = safeFilename((f.path || '').split(/[\\/]/).pop() || 'file');
    const rel = require('path').join('attachments', String(convId), String(f.messageId || 'msg'), base);
    map[f.path] = rel;
  }
  return map;
}

function rewriteConversationPaths(conv, pathMap, includeTs = true) {
  const copy = includeTs ? JSON.parse(JSON.stringify(conv)) : filterConversationTimestamps(conv, includeTs);
  try {
    for (const m of (copy.messages || [])) {
      if (Array.isArray(m.attachments)) {
        m.attachments = m.attachments.map(a => ({ ...a, path: pathMap[a.path] || a.path }));
      }
      if (m.imagePath) m.imagePath = pathMap[m.imagePath] || m.imagePath;
      if (m.pdfPath) m.pdfPath = pathMap[m.pdfPath] || m.pdfPath;
    }
  } catch {}
  return copy;
}

async function getProactiveConversation(settings) {
  try {
    const store = Stores.conversations.read();
    const list = store.conversations || [];
    const pinnedId = settings?.ui?.proactiveConversationId;
    if (pinnedId) {
      const pinned = list.find(c => c.id === pinnedId);
      if (pinned) return pinned;
    }
    // Fallback: create a brand new conversation (same as New Chat)
    const id = `conv_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
    const now = new Date();
    const conv = { id, title: formatStartTime(now), createdAt: now.toISOString(), messages: [] };
    store.conversations.push(conv);
    Stores.conversations.write(store);
    // If nothing is pinned (or pinned was invalid), pin this new one so future proactive messages continue here
    try {
      const s = Stores.settings.read() || {};
      const ui = { ...(s.ui || {}) };
      if (!ui.proactiveConversationId || ui.proactiveConversationId === pinnedId) {
        ui.proactiveConversationId = id;
        Stores.settings.write({ ...s, ui });
      }
    } catch (e) {
      console.error('auto-pin on proactive create failed', e);
    }
    // Send initial greeting using only system prompt + memory
    try {
      const memory = Stores.memory.read();
      const text = await initialGreeting({ settings, memory });
      if (text) {
        const st2 = Stores.conversations.read();
        const c = st2.conversations.find(x => x.id === id);
        if (c) {
          c.messages.push({ id: `msg_${Date.now()}`, role: 'assistant', content: text, timestamp: new Date().toISOString() });
          Stores.conversations.write(st2);
          mainWindow?.webContents.send('data:conversations-updated');
        }
      }
    } catch (e) {
      console.error('initial greeting (proactive) failed', e);
    }
    return conv;
  } catch (e) {
    console.error('getProactiveConversation failed', e);
    return null;
  }
}
