const state = {
  settings: null,
  conversationsStore: { conversations: [] },
  currentId: null,
  memory: { items: [] },
  ui: {
    sending: false,
  },
};

// Elements
const elConversations = document.getElementById('conversations');
const elMessages = document.getElementById('messages');
const elInput = document.getElementById('input');
const elSend = document.getElementById('btn-send');
const elChatTitle = document.getElementById('chat-title');
const elNewChat = document.getElementById('btn-new-chat');
const elSummarize = document.getElementById('btn-summarize');
const elToggleSidebar = document.getElementById('btn-toggle-sidebar');
const elDeleteCurrent = document.getElementById('btn-delete-current');

const elSettingsModal = document.getElementById('settings-modal');
const elOpenSettings = document.getElementById('btn-settings');
const elCloseSettings = document.getElementById('close-settings');
const elSaveSettings = document.getElementById('save-settings');
const elTestApi = document.getElementById('test-api');
const elTestApiStatus = document.getElementById('test-api-status');
const elBtnTestNotif = document.getElementById('btn-test-notif');
const elBtnProactiveOnce = document.getElementById('btn-proactive-once');
const elProactiveStatus = document.getElementById('proactive-status');
const elTyping = document.getElementById('typing-indicator');
const elLogsList = document.getElementById('logs-list');
const elLogsRefresh = document.getElementById('btn-logs-refresh');
const elLogsClear = document.getElementById('btn-logs-clear');
const elChat = document.querySelector('.chat');
const elChatResizer = document.getElementById('chat-resize');

const elPersona = document.getElementById('persona');
const elApiBase = document.getElementById('api-base');
const elApiKey = document.getElementById('api-key');
const elApiModel = document.getElementById('api-model');
const elApiMax = document.getElementById('api-max');
const elApiTemp = document.getElementById('api-temp');
const elApiHistory = document.getElementById('api-history');
const elApiSummaryHistory = document.getElementById('api-summary-history');
const elProactiveEnabled = document.getElementById('proactive-enabled');
const elProactiveInterval = document.getElementById('proactive-interval');
const elNotifProactive = document.getElementById('notif-proactive');
const elAvatarUserPreview = document.getElementById('avatar-user-preview');
const elAvatarAgentPreview = document.getElementById('avatar-agent-preview');
const elPickAvatarUser = document.getElementById('pick-avatar-user');
const elPickAvatarAgent = document.getElementById('pick-avatar-agent');

const elMemoryModal = document.getElementById('memory-modal');
const elOpenMemory = document.getElementById('btn-memory');
const elCloseMemory = document.getElementById('close-memory');
const elMemoryList = document.getElementById('memory-list');
const elMemTitle = document.getElementById('mem-title');
const elMemContent = document.getElementById('mem-content');
const elMemNew = document.getElementById('mem-new');
const elMemSave = document.getElementById('mem-save');
const elMemDelete = document.getElementById('mem-delete');

let selectedMemId = null;

function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function init() {
  state.settings = await window.api.getSettings();
  state.conversationsStore = await window.api.listConversations();
  if (!state.conversationsStore.conversations.length) {
    const conv = await window.api.createConversation('新的对话');
    state.conversationsStore = await window.api.listConversations();
    state.currentId = conv.id;
  } else {
    // Try to restore last selected from settings
    const sel = state.settings?.ui?.currentConversationId;
    const exists = (state.conversationsStore.conversations || []).some(c => c.id === sel);
    state.currentId = exists ? sel : state.conversationsStore.conversations[0].id;
  }
  // Persist selected conversation for proactive loop
  try { await window.api.setCurrentConversation(state.currentId); } catch {}
  state.memory = await window.api.listMemory();
  renderAll();

  // Initialize composer height from CSS var if present
  if (!getComputedStyle(elChat).getPropertyValue('--composer-height')) {
    elChat.style.setProperty('--composer-height', '140px');
  }
  setupChatResizer();

  window.api.onConversationsUpdated(async () => {
    state.conversationsStore = await window.api.listConversations();
    renderConversations();
    renderMessages();
  });
}

function renderAll() {
  renderConversations();
  renderMessages();
}

function lastActivityTs(conv) {
  try {
    const msgs = conv?.messages || [];
    const t1 = msgs.length ? new Date(msgs[msgs.length - 1].timestamp).getTime() : 0;
    const t2 = conv?.createdAt ? new Date(conv.createdAt).getTime() : 0;
    return Math.max(t1 || 0, t2 || 0);
  } catch {
    return 0;
  }
}

function orderConversations(list) {
  const items = [...(list || [])];
  const ui = state.settings?.ui || {};
  if (ui.listOrderMode === 'manual' && Array.isArray(ui.conversationOrder) && ui.conversationOrder.length) {
    const idToItem = Object.fromEntries(items.map(i => [i.id, i]));
    const ordered = [];
    ui.conversationOrder.forEach(id => { if (idToItem[id]) ordered.push(idToItem[id]); });
    const remaining = items.filter(i => !ui.conversationOrder.includes(i.id)).sort((a,b) => lastActivityTs(b)-lastActivityTs(a));
    return [...ordered, ...remaining];
  }
  return items.sort((a,b) => lastActivityTs(b) - lastActivityTs(a));
}

function renderConversations() {
  const listRaw = state.conversationsStore.conversations || [];
  const list = orderConversations(listRaw);
  elConversations.innerHTML = '';
  list.forEach(conv => {
    const div = document.createElement('div');
    div.className = 'conversation-item' + (conv.id === state.currentId ? ' active' : '');
    div.setAttribute('draggable', 'true');
    div.dataset.id = conv.id;
    const titleEl = document.createElement('div');
    titleEl.className = 'conversation-title';
    titleEl.textContent = conv.title;
    const renameBtn = document.createElement('button');
    renameBtn.className = 'rename';
    renameBtn.title = '重命名';
    renameBtn.textContent = '✎';
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete';
    deleteBtn.title = '删除';
    deleteBtn.textContent = '🗑';
    div.onclick = () => {
      state.currentId = conv.id;
      window.api.setCurrentConversation(state.currentId).catch(() => {});
      renderConversations();
      renderMessages();
    };
    div.oncontextmenu = async (e) => {
      e.preventDefault();
      startInlineRename(div, titleEl, conv);
    };
    div.addEventListener('dragstart', (e) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', conv.id);
    });
    div.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      div.classList.add('drag-over');
    });
    div.addEventListener('dragleave', () => div.classList.remove('drag-over'));
    div.addEventListener('drop', async (e) => {
      e.preventDefault();
      div.classList.remove('drag-over');
      const dragId = e.dataTransfer.getData('text/plain');
      const targetId = conv.id;
      if (!dragId || dragId === targetId) return;
      await applyManualReorder(dragId, targetId);
    });
    renameBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      startInlineRename(div, titleEl, conv);
    });
    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await deleteConversationById(conv.id);
    });
    div.appendChild(titleEl);
    div.appendChild(renameBtn);
    div.appendChild(deleteBtn);
    elConversations.appendChild(div);
  });

  // Allow drop at list end (bind once)
  if (!elConversations._dndBound) {
    elConversations.addEventListener('dragover', (e) => { e.preventDefault(); });
    elConversations.addEventListener('drop', async (e) => {
      const dragId = e.dataTransfer.getData('text/plain');
      if (!dragId) return;
      await applyManualReorder(dragId, null); // move to end
    });
    elConversations._dndBound = true;
  }
}

async function applyManualReorder(dragId, beforeId) {
  const current = orderConversations(state.conversationsStore.conversations || []);
  const ids = current.map(c => c.id);
  const from = ids.indexOf(dragId);
  if (from === -1) return;
  ids.splice(from, 1);
  if (beforeId) {
    const to = ids.indexOf(beforeId);
    const insertAt = to >= 0 ? to : ids.length;
    ids.splice(insertAt, 0, dragId);
  } else {
    ids.push(dragId);
  }
  const ui = state.settings.ui || {};
  const nextUi = { ...ui, listOrderMode: 'manual', conversationOrder: ids };
  const next = await window.api.updateSettings({ ui: nextUi });
  state.settings = next;
  renderConversations();
}

async function deleteConversationById(id) {
  if (!id) return;
  const conv = (state.conversationsStore.conversations || []).find(c => c.id === id);
  const name = conv?.title || '该对话';
  const ok = confirm(`确定删除“${name}”吗？此操作不可撤销。`);
  if (!ok) return;
  try {
    await window.api.deleteConversation(id);
    // Refresh store
    state.conversationsStore = await window.api.listConversations();
    // Remove from manual order settings if present
    const ui = state.settings?.ui || {};
    if (Array.isArray(ui.conversationOrder) && ui.conversationOrder.includes(id)) {
      const nextOrder = ui.conversationOrder.filter(x => x !== id);
      state.settings = await window.api.updateSettings({ ui: { ...ui, conversationOrder: nextOrder } });
    }
    // Reselect a conversation
    const ordered = orderConversations(state.conversationsStore.conversations || []);
    if (ordered.length) {
      state.currentId = ordered[0].id;
      window.api.setCurrentConversation(state.currentId).catch(() => {});
    } else {
      // Create a new empty conversation to keep UI stable
      const created = await window.api.createConversation('新的对话');
      state.conversationsStore = await window.api.listConversations();
      state.currentId = created.id;
      window.api.setCurrentConversation(state.currentId).catch(() => {});
    }
    renderConversations();
    renderMessages();
  } catch (e) {
    alert('删除失败：' + e.message);
  }
}

function avatarSrc(role) {
  if (role === 'user') return state.settings?.avatars?.user || '';
  if (role === 'assistant') return state.settings?.avatars?.agent || '';
  return '';
}

function renderMessages() {
  const conv = (state.conversationsStore.conversations || []).find(c => c.id === state.currentId);
  if (!conv) return;
  elChatTitle.innerText = conv.title;
  elMessages.innerHTML = '';
  conv.messages.forEach(msg => {
    const row = document.createElement('div');
    row.className = `message ${msg.role}`;
    const img = document.createElement('img');
    img.className = 'avatar';
    const src = avatarSrc(msg.role);
    if (src) img.src = src; else img.alt = msg.role === 'user' ? '👤' : '🤖';
    const wrap = document.createElement('div');
    wrap.className = 'bubble-wrap';
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = msg.content;
    const time = document.createElement('div');
    time.className = 'timestamp';
    time.textContent = formatTime(msg.timestamp);
    wrap.appendChild(bubble);
    wrap.appendChild(time);
    if (msg.role === 'user') {
      row.appendChild(img);
      row.appendChild(wrap);
    } else {
      row.appendChild(img);
      row.appendChild(wrap);
    }
    elMessages.appendChild(row);
  });
  // Scroll to bottom
  elMessages.scrollTop = elMessages.scrollHeight;
}

function formatTime(ts) {
  try {
    if (!ts) return '';
    return new Date(ts).toLocaleString();
  } catch {
    return '';
  }
}

async function onSend() {
  const text = elInput.value.trim();
  if (!text || state.ui.sending) return;
  state.ui.sending = true;
  elSend.disabled = true;
  // Clear input immediately and keep focus
  elInput.value = '';
  elInput.focus();
  // Optimistically render user message
  appendOptimisticUser(text);
  // Show typing indicator and placeholder
  startTypingPlaceholder();
  try {
    await window.api.sendMessage({ conversationId: state.currentId, userText: text });
    state.conversationsStore = await window.api.listConversations();
    stopTypingPlaceholder();
    renderMessages();
  } catch (e) {
    alert('发送失败: ' + e.message);
    stopTypingPlaceholder();
    // Refresh from store to reflect any persisted user message
    state.conversationsStore = await window.api.listConversations();
    renderMessages();
  } finally {
    state.ui.sending = false;
    elSend.disabled = false;
  }
}

function appendOptimisticUser(text) {
  const row = document.createElement('div');
  row.className = 'message user';
  const img = document.createElement('img');
  img.className = 'avatar';
  const src = avatarSrc('user');
  if (src) img.src = src; else img.alt = '👤';
  const wrap = document.createElement('div');
  wrap.className = 'bubble-wrap';
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = text;
  const time = document.createElement('div');
  time.className = 'timestamp';
  time.textContent = formatTime(new Date().toISOString());
  wrap.appendChild(bubble);
  wrap.appendChild(time);
  row.appendChild(img);
  row.appendChild(wrap);
  elMessages.appendChild(row);
  elMessages.scrollTop = elMessages.scrollHeight;
}

function startTypingPlaceholder() {
  if (elTyping) elTyping.classList.remove('hidden');
  // Create placeholder row if not exists
  if (document.getElementById('assistant-typing-placeholder')) return;
  const row = document.createElement('div');
  row.id = 'assistant-typing-placeholder';
  row.className = 'message assistant';
  const img = document.createElement('img');
  img.className = 'avatar';
  const src = avatarSrc('assistant');
  if (src) img.src = src; else img.alt = '🤖';
  const wrap = document.createElement('div');
  wrap.className = 'bubble-wrap';
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = '……';
  const time = document.createElement('div');
  time.className = 'timestamp';
  time.textContent = formatTime(new Date().toISOString());
  wrap.appendChild(bubble);
  wrap.appendChild(time);
  row.appendChild(img);
  row.appendChild(wrap);
  elMessages.appendChild(row);
  elMessages.scrollTop = elMessages.scrollHeight;
  // Animate dots
  let i = 0;
  state.ui.typingTimer && clearInterval(state.ui.typingTimer);
  state.ui.typingTimer = setInterval(() => {
    i = (i + 1) % 4;
    bubble.textContent = '…'.repeat(i || 1);
  }, 500);
}

function stopTypingPlaceholder() {
  if (elTyping) elTyping.classList.add('hidden');
  if (state.ui.typingTimer) clearInterval(state.ui.typingTimer);
  state.ui.typingTimer = null;
  const row = document.getElementById('assistant-typing-placeholder');
  if (row && row.parentNode) row.parentNode.removeChild(row);
}

async function onNewChat() {
  try {
    const conv = await window.api.createConversation('新的对话');
    state.conversationsStore = await window.api.listConversations();
    state.currentId = conv.id;
    window.api.setCurrentConversation(state.currentId).catch(() => {});
    // If manual order is active, put new conversation at the top of the order
    const ui = state.settings?.ui || {};
    if (ui.listOrderMode === 'manual') {
      const existing = Array.isArray(ui.conversationOrder) ? ui.conversationOrder.filter(id => id !== conv.id) : [];
      const nextOrder = [conv.id, ...existing];
      state.settings = await window.api.updateSettings({ ui: { ...ui, conversationOrder: nextOrder } });
    }
    renderConversations();
    renderMessages();
    // Start inline edit on the title to encourage renaming immediately
    setTimeout(() => startInlineTitleEdit(), 0);
  } catch (e) {
    alert('新建对话失败：' + e.message);
  }
}

// Settings modal logic
function fillSettingsForm() {
  const s = state.settings || {};
  elPersona.value = s.persona || '';
  elApiBase.value = s.api?.baseUrl || '';
  elApiKey.value = s.api?.apiKey || '';
  elApiModel.value = s.api?.model || '';
  elApiMax.value = s.api?.maxTokens ?? 256;
  elApiTemp.value = s.api?.temperature ?? 0.7;
  elApiHistory.value = s.api?.historyMessages ?? 25;
  elApiSummaryHistory.value = s.api?.summaryHistoryMessages ?? 100;
  elProactiveEnabled.checked = !!s.proactive?.enabled;
  elProactiveInterval.value = s.proactive?.intervalMinutes ?? 10;
  elNotifProactive.checked = !!s.notifications?.onProactive;
  if (s.avatars?.user) elAvatarUserPreview.src = s.avatars.user; else elAvatarUserPreview.removeAttribute('src');
  if (s.avatars?.agent) elAvatarAgentPreview.src = s.avatars.agent; else elAvatarAgentPreview.removeAttribute('src');
}

function buildSettingsPatchFromForm() {
  return {
    persona: elPersona.value.trim(),
    api: {
      baseUrl: elApiBase.value.trim(),
      apiKey: elApiKey.value.trim(),
      model: elApiModel.value.trim(),
      maxTokens: Number(elApiMax.value) || 256,
      temperature: Number(elApiTemp.value) || 0.7,
      historyMessages: Math.max(1, Math.min(500, Number(elApiHistory.value) || 25)),
      summaryHistoryMessages: Math.max(1, Math.min(1000, Number(elApiSummaryHistory.value) || 100)),
    },
    proactive: {
      enabled: elProactiveEnabled.checked,
      intervalMinutes: Number(elProactiveInterval.value) || 10,
    },
    notifications: {
      onProactive: elNotifProactive.checked,
    },
    avatars: state.settings.avatars || {},
  };
}

async function saveSettings() {
  const patch = buildSettingsPatchFromForm();
  state.settings = await window.api.updateSettings(patch);
  hide(elSettingsModal);
}

async function testApiSettings() {
  const patch = buildSettingsPatchFromForm();
  elTestApi.disabled = true;
  elTestApiStatus.textContent = '测试中...';
  try {
    const res = await window.api.testApi(patch);
    if (res?.ok) {
      const preview = (res.content || '').slice(0, 60).replace(/\s+/g, ' ');
      elTestApiStatus.textContent = `成功：${preview || '收到空响应'}`;
    } else {
      elTestApiStatus.textContent = `失败：${res?.error || '未知错误'}`;
    }
  } catch (e) {
    elTestApiStatus.textContent = `失败：${e.message}`;
  } finally {
    elTestApi.disabled = false;
  }
}

async function pickAvatar(kind) {
  const file = await window.api.pickAvatar();
  if (!file) return;
  if (!state.settings.avatars) state.settings.avatars = {};
  state.settings.avatars[kind] = file;
  // Only update avatars to avoid resetting other fields the user typed
  state.settings = await window.api.updateSettings({ avatars: state.settings.avatars });
  fillSettingsForm();
  renderMessages();
}

// Memory modal logic
function renderMemoryList() {
  const items = state.memory.items || [];
  elMemoryList.innerHTML = '';
  items.forEach(item => {
    const row = document.createElement('div');
    row.className = 'memory-item' + (item.id === selectedMemId ? ' active' : '');
    const date = new Date(item.createdAt).toLocaleString();
    row.innerHTML = `<div>${escapeHtml(item.title)}</div><div class="muted">${date}</div>`;
    row.onclick = () => {
      selectedMemId = item.id;
      fillMemoryEditor(item);
      renderMemoryList();
    };
    elMemoryList.appendChild(row);
  });
}

function fillMemoryEditor(item) {
  elMemTitle.value = item?.title || '';
  elMemContent.value = item?.content || '';
}

async function memNew() {
  selectedMemId = null;
  fillMemoryEditor({ title: '', content: '' });
}

async function memSave() {
  const title = elMemTitle.value.trim() || '记忆';
  const content = elMemContent.value.trim();
  if (!selectedMemId) {
    await window.api.addMemory({ title, content });
  } else {
    await window.api.updateMemory({ id: selectedMemId, title, content, tags: [] });
  }
  state.memory = await window.api.listMemory();
  renderMemoryList();
}

async function memDelete() {
  if (!selectedMemId) return;
  if (!confirm('确定删除该记忆吗？')) return;
  await window.api.deleteMemory(selectedMemId);
  state.memory = await window.api.listMemory();
  selectedMemId = null;
  fillMemoryEditor({});
  renderMemoryList();
}

async function onSummarize() {
  if (!state.currentId) return;
  const ok = confirm('将当前对话的要点总结并加入记忆库？');
  if (!ok) return;
  try {
    const text = await window.api.summarizeToMemory({ conversationId: state.currentId });
    alert('已加入记忆库:\n\n' + text.slice(0, 400));
    state.memory = await window.api.listMemory();
  } catch (e) {
    alert('总结失败: ' + e.message);
  }
}

async function refreshLogs() {
  try {
    const items = await window.api.listLogs(200);
    const convMap = Object.fromEntries((state.conversationsStore.conversations || []).map(c => [c.id, c.title]));
    if (!elLogsList) return;
    elLogsList.textContent = (items || []).map(it => {
      const when = new Date(it.time).toLocaleString();
      const conv = it.conversationId ? ` [${convMap[it.conversationId] || it.conversationId}]` : '';
      const head = `${when} ${it.type?.toUpperCase() || ''}${conv} action=${it.action || ''}`;
      const body = (it.raw || it.message || '').replace(/\s+/g, ' ').slice(0, 400);
      return `${head}\n  ${body}`;
    }).join('\n\n');
  } catch (e) {
    if (elLogsList) elLogsList.textContent = '读取失败：' + e.message;
  }
}

// Events wiring
elSend.addEventListener('click', onSend);
elInput.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') onSend();
});
elNewChat.addEventListener('click', onNewChat);
elSummarize.addEventListener('click', onSummarize);
  elToggleSidebar?.addEventListener('click', () => {
    const app = document.getElementById('app');
    app.classList.toggle('sidebar-hidden');
    elToggleSidebar.textContent = app.classList.contains('sidebar-hidden') ? '显示会话列表' : '隐藏会话列表';
  });
elDeleteCurrent?.addEventListener('click', async () => {
  if (!state.currentId) return;
  await deleteConversationById(state.currentId);
});

elOpenSettings.addEventListener('click', async () => { fillSettingsForm(); await refreshLogs(); show(elSettingsModal); });
elCloseSettings.addEventListener('click', () => hide(elSettingsModal));
elSaveSettings.addEventListener('click', saveSettings);
elTestApi.addEventListener('click', testApiSettings);
elBtnTestNotif?.addEventListener('click', async () => {
  elBtnTestNotif.disabled = true;
  elProactiveStatus.textContent = '发送测试通知...';
  try {
    const res = await window.api.testNotify();
    elProactiveStatus.textContent = res?.ok ? '已发送通知（若未前台显示，请在系统设置中查看并允许）' : `失败：${res?.error || ''}`;
  } catch (e) {
    elProactiveStatus.textContent = `失败：${e.message}`;
  } finally {
    elBtnTestNotif.disabled = false;
  }
});

elBtnProactiveOnce?.addEventListener('click', async () => {
  elBtnProactiveOnce.disabled = true;
  elProactiveStatus.textContent = '立即检查中...';
  try {
    const res = await window.api.proactiveOnce();
    if (res?.ok) {
      elProactiveStatus.textContent = `检查完成：发送 ${res.sent} 条 / 会话 ${res.checked}`;
      // refresh after sending
      state.conversationsStore = await window.api.listConversations();
      renderConversations();
      renderMessages();
    } else {
      elProactiveStatus.textContent = `失败：${res?.error || ''}`;
    }
  } catch (e) {
    elProactiveStatus.textContent = `失败：${e.message}`;
  } finally {
    elBtnProactiveOnce.disabled = false;
  }
});
elPickAvatarUser.addEventListener('click', () => pickAvatar('user'));
elPickAvatarAgent.addEventListener('click', () => pickAvatar('agent'));

elOpenMemory.addEventListener('click', async () => { state.memory = await window.api.listMemory(); renderMemoryList(); show(elMemoryModal); });
elCloseMemory.addEventListener('click', () => hide(elMemoryModal));
elMemNew.addEventListener('click', memNew);
elMemSave.addEventListener('click', memSave);
elMemDelete.addEventListener('click', memDelete);

elLogsRefresh?.addEventListener('click', refreshLogs);
elLogsClear?.addEventListener('click', async () => { await window.api.clearLogs(); await refreshLogs(); });

init();

function setupChatResizer() {
  if (!elChat || !elChatResizer) return;
  let dragging = false;
  function onMove(e) {
    if (!dragging) return;
    const rect = elChat.getBoundingClientRect();
    const resizerHeight = parseInt(getComputedStyle(elChat).getPropertyValue('--resizer-height')) || 6;
    let newH = rect.bottom - e.clientY - 0; // space below cursor to bottom
    const minH = 80;
    const maxH = Math.max(120, Math.min(500, rect.height - 160));
    newH = Math.max(minH, Math.min(maxH, newH));
    elChat.style.setProperty('--composer-height', `${Math.round(newH)}px`);
  }
  function onUp() {
    dragging = false;
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  }
  elChatResizer.addEventListener('mousedown', (e) => {
    dragging = true;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'row-resize';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });
}

function startInlineRename(container, titleEl, conv) {
  if (!container || !titleEl) return;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'title-edit';
  input.value = conv.title || '';
  input.addEventListener('click', (e) => e.stopPropagation());
  input.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') { e.preventDefault(); await commit(); }
    if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  });
  input.addEventListener('blur', commit);
  container.replaceChild(input, titleEl);
  input.focus();
  input.select();

  async function commit() {
    input.removeEventListener('blur', commit);
    const next = (input.value || '').trim();
    if (next && next !== conv.title) {
      await window.api.renameConversation({ id: conv.id, title: next });
      state.conversationsStore = await window.api.listConversations();
    }
    renderConversations();
    renderMessages();
  }
  function cancel() {
    input.removeEventListener('blur', commit);
    container.replaceChild(titleEl, input);
  }
}

// Edit current chat title inline
elChatTitle.addEventListener('dblclick', () => startInlineTitleEdit());
elChatTitle.addEventListener('click', (e) => {
  // optional: single-click to edit when no selection
});

function startInlineTitleEdit() {
  const conv = (state.conversationsStore.conversations || []).find(c => c.id === state.currentId);
  if (!conv) return;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'chat-title-edit';
  input.value = conv.title || '';
  const original = elChatTitle.textContent;
  const parent = elChatTitle.parentNode;
  elChatTitle.replaceWith(input);
  input.focus();
  input.select();
  const finish = async (save) => {
    input.removeEventListener('blur', onBlur);
    input.removeEventListener('keydown', onKey);
    const newTitle = (input.value || '').trim();
    if (save && newTitle && newTitle !== conv.title) {
      await window.api.renameConversation({ id: conv.id, title: newTitle });
      state.conversationsStore = await window.api.listConversations();
    }
    // Rebuild title node
    const titleDiv = document.createElement('div');
    titleDiv.id = 'chat-title';
    titleDiv.className = 'chat-title';
    const data = (state.conversationsStore.conversations || []).find(c => c.id === state.currentId);
    titleDiv.textContent = data ? data.title : (save ? newTitle : original);
    parent.replaceChild(titleDiv, input);
    // rebind inline edit events
    titleDiv.addEventListener('dblclick', () => startInlineTitleEdit());
  };
  const onBlur = () => finish(true);
  const onKey = (e) => {
    if (e.key === 'Enter') finish(true);
    if (e.key === 'Escape') finish(false);
  };
  input.addEventListener('blur', onBlur);
  input.addEventListener('keydown', onKey);
}
