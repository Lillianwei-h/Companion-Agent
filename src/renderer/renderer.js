// i18n helpers are provided by src/renderer/i18n.js
// Tag body with platform class for OS-specific tweaks (e.g., macOS traffic lights spacing)
try {
  const isMac = navigator.platform && /Mac/i.test(navigator.platform);
  if (isMac) document.body.classList.add('macos');
} catch {}
function applyI18nFromState() {
  try {
    const pref = state?.settings?.ui?.language || 'zh-CN';
    const lang = window.i18n.resolveLang(pref);
    window.i18n.setLang(lang);
    window.i18n.applyStatic();
  } catch {}
}

// Default avatars packaged with the app (relative to renderer index.html)
const DEFAULT_AVATARS = {
  user: '../media/user.png',
  agent: '../media/agent.png',
};

const state = {
  settings: null,
  conversationsStore: { conversations: [] },
  currentId: null,
  memory: { items: [] },
  ui: {
    sending: false,
    attachments: [], // [{ path, mime }]
    previewImagePath: '',
    avatarCrop: null,
    lastSidebarToggleTs: 0,
  },
};

// Elements
const elConversations = document.getElementById('conversations');
const elMessages = document.getElementById('messages');
const elInput = document.getElementById('input');
const elSend = document.getElementById('btn-send');
let elChatTitle = document.getElementById('chat-title');
const elNewChat = document.getElementById('btn-new-chat');
const elSummarize = document.getElementById('btn-summarize');
// Legacy header toggle removed; using boundary handle instead
const elExportMenuBtn = document.getElementById('btn-export-menu');
const elExportDropdown = document.getElementById('export-dropdown');
const elExportIncludeTs = document.getElementById('export-include-ts');
const elExportIncludeFiles = document.getElementById('export-include-files');
const elDeleteCurrent = document.getElementById('btn-delete-current');
const elSidebarToggle = document.getElementById('btn-sidebar-toggle');

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
// const elMigrateAttachments = document.getElementById('btn-migrate-attachments');
const elChat = document.querySelector('.chat');
const elChatResizer = document.getElementById('chat-resize');
const elAttachBtn = document.getElementById('btn-attach-image');
const elAttachPdfBtn = document.getElementById('btn-attach-pdf');
const elComposerAttachment = document.getElementById('composer-attachment');
const elComposer = document.querySelector('.composer');
// Image viewer
const elImageModal = document.getElementById('image-modal');
const elImageModalImg = document.getElementById('image-modal-img');
const elImageDownload = document.getElementById('image-download');
// Avatar crop modal elements
const elAvatarCropModal = document.getElementById('avatar-crop-modal');
const elAvatarCropImg = document.getElementById('avatar-crop-img');
const elAvatarCropClose = document.getElementById('avatar-crop-close');
const elAvatarCropCancel = document.getElementById('avatar-crop-cancel');
const elAvatarCropApply = document.getElementById('avatar-crop-apply');
const elCropStage = document.getElementById('crop-stage');
const elCropLayer = document.getElementById('crop-layer');
const elCropRect = document.getElementById('crop-rect');

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
const elGreetOnCreate = document.getElementById('greet-on-create');
const elVibrancyEnabled = document.getElementById('vibrancy-enabled');
const elVibrancyStrength = document.getElementById('vibrancy-strength');
const elVibrancySidebarStrength = document.getElementById('vibrancy-sidebar-strength');
const elLanguage = document.getElementById('ui-language');
const elNameUser = document.getElementById('name-user');
const elNameModel = document.getElementById('name-model');
const elAvatarUserPreview = document.getElementById('avatar-user-preview');
const elAvatarAgentPreview = document.getElementById('avatar-agent-preview');

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
  // Apply i18n for initial UI
  try { applyI18nFromState(); } catch {}
  // Force auto ordering if manual was previously enabled
  if (state.settings?.ui?.listOrderMode === 'manual') {
    try {
      const ui = state.settings.ui || {};
      state.settings = await window.api.updateSettings({ ui: { ...ui, listOrderMode: 'auto', conversationOrder: [] } });
    } catch {}
  }
  state.conversationsStore = await window.api.listConversations();
  let createdNow = false;
  if (!state.conversationsStore.conversations.length) {
    const conv = await window.api.createConversation();
    state.conversationsStore = await window.api.listConversations();
    // Refresh settings to reflect any auto-pinning performed in main process
    try { state.settings = await window.api.getSettings(); } catch {}
    state.currentId = conv.id;
    createdNow = true;
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
  // If first boot created a conversation, show typing only if greeting enabled
  if (createdNow) {
    try {
      const enabled = !!(state.settings?.ui?.initialGreetingOnManualCreate ?? true);
      if (enabled) startTypingPlaceholder();
    } catch {}
  }

  // Initialize composer height from CSS var if present
  if (!getComputedStyle(elChat).getPropertyValue('--composer-height')) {
    // Slightly taller default composer height for better typing comfort
    elChat.style.setProperty('--composer-height', '160px');
  }
  setupChatResizer();
  // Initial autosize for empty input
  try { autoResizeComposer(); } catch {}
  // Initialize export include timestamp toggle from settings
  if (elExportIncludeTs) {
    elExportIncludeTs.checked = state.settings?.ui?.exportIncludeTimestamp ?? true;
  }
  // Apply initial translucency from settings
  applyTranslucencyFromSettings();
  // Start proactive countdown updater
  startProactiveCountdown();
  // Reapply when system theme changes
  try {
    const mm = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
    mm && mm.addEventListener('change', () => applyTranslucencyFromSettings());
  } catch {}

  window.api.onConversationsUpdated(async () => {
    const prevStore = state.conversationsStore || { conversations: [] };
    const prevCounts = Object.fromEntries((prevStore.conversations || []).map(c => [c.id, (c.messages || []).length]));
    const nextStore = await window.api.listConversations();
    // Detect any conversation that received new assistant message
    let targetConvId = null;
    for (const conv of (nextStore.conversations || [])) {
      const prevLen = prevCounts[conv.id] || 0;
      const nextLen = (conv.messages || []).length;
      if (nextLen > prevLen) {
        const last = conv.messages[nextLen - 1];
        if (last && last.role === 'assistant') {
          targetConvId = conv.id;
          break;
        }
      }
    }
    state.conversationsStore = nextStore;
    // Keep local settings in sync (e.g., auto-pin updates from main)
    try { state.settings = await window.api.getSettings(); } catch {}
    // Auto-switch to conversation that just received an assistant message
    if (targetConvId && targetConvId !== state.currentId) {
      state.currentId = targetConvId;
      try { await window.api.setCurrentConversation(state.currentId); } catch {}
    }
    renderConversations();
    renderMessages();
    // If typing placeholder is visible and an assistant message has arrived, stop it
    try {
      const ph = document.getElementById('assistant-typing-placeholder');
      if (ph) {
        const conv = (state.conversationsStore.conversations || []).find(c => c.id === state.currentId);
        const last = conv && (conv.messages || [])[conv.messages.length - 1];
        if (last && last.role === 'assistant') stopTypingPlaceholder();
      }
    } catch {}
  });

  // Initialize sidebar toggle arrow according to current state
  updateSidebarToggleLabel();
  // Sync minWidth based on initial sidebar state
  try {
    const app = document.getElementById('app');
    const hidden = app.classList.contains('sidebar-hidden');
    if (window.api && typeof window.api.setMinWidth === 'function') {
      window.api.setMinWidth(400).catch(() => {});
    }
  } catch {}
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
    // Drag sorting disabled: keep list auto-ordered by last activity
    div.dataset.id = conv.id;
    const titleEl = document.createElement('div');
    titleEl.className = 'conversation-title';
    titleEl.textContent = conv.title;
    const proactiveBtn = document.createElement('button');
    const pinned = state.settings?.ui?.proactiveConversationId === conv.id;
    proactiveBtn.className = 'proactive' + (pinned ? ' active' : '');
    proactiveBtn.title = pinned ? t('proactive.pinOnTitle') : t('proactive.pinOffTitle');
    proactiveBtn.textContent = pinned ? '★' : '☆';
    const renameBtn = document.createElement('button');
    renameBtn.className = 'rename';
    renameBtn.title = t('tip.edit');
    renameBtn.textContent = '✎';
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete';
    deleteBtn.title = t('common.delete');
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
    proactiveBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        const ui = state.settings?.ui || {};
        const nextId = (state.settings?.ui?.proactiveConversationId === conv.id) ? '' : conv.id;
        const next = await window.api.updateSettings({ ui: { ...ui, proactiveConversationId: nextId } });
        state.settings = next;
        renderConversations();
      } catch (err) {
        alert(t('err.updateProactiveContext') + (err?.message || err));
      }
    });
    renameBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      startInlineRename(div, titleEl, conv);
    });
    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await deleteConversationById(conv.id);
    });
    div.appendChild(proactiveBtn);
    div.appendChild(titleEl);
    div.appendChild(renameBtn);
    div.appendChild(deleteBtn);
    elConversations.appendChild(div);
  });

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
  const name = conv?.title || t('label.mem.defaultTitle');
  const ok = confirm(t('confirm.deleteConv', { name }));
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
    // Clear proactive pinned context if it was this conversation
    if (ui.proactiveConversationId === id) {
      const freshUi = state.settings?.ui || ui;
      state.settings = await window.api.updateSettings({ ui: { ...freshUi, proactiveConversationId: '' } });
    }
    // Reselect a conversation
    const ordered = orderConversations(state.conversationsStore.conversations || []);
    if (ordered.length) {
      state.currentId = ordered[0].id;
      window.api.setCurrentConversation(state.currentId).catch(() => {});
    } else {
      // Create a new empty conversation to keep UI stable
      const created = await window.api.createConversation();
      state.conversationsStore = await window.api.listConversations();
      // Refresh settings to reflect any auto-pinning on creation
      try { state.settings = await window.api.getSettings(); } catch {}
      state.currentId = created.id;
      window.api.setCurrentConversation(state.currentId).catch(() => {});
    }
    renderConversations();
    renderMessages();
  } catch (e) {
    alert(t('err.deleteFailed') + e.message);
  }
}

function avatarSrc(role) {
  // Prefer user-configured avatars; fall back to packaged defaults
  if (role === 'user') return state.settings?.avatars?.user || DEFAULT_AVATARS.user;
  if (role === 'assistant') return state.settings?.avatars?.agent || DEFAULT_AVATARS.agent;
  return '';
}

function renderMessages() {
  const conv = (state.conversationsStore.conversations || []).find(c => c.id === state.currentId);
  if (!conv) return;
  const ttl = document.getElementById('chat-title');
  if (ttl) ttl.innerText = conv.title;
  elMessages.innerHTML = '';
  conv.messages.forEach(msg => {
    const row = document.createElement('div');
    row.className = `message ${msg.role}`;
    row.dataset.mid = msg.id;
    const img = document.createElement('img');
    img.className = 'avatar';
    const src = avatarSrc(msg.role);
    if (src) img.src = src; else img.alt = msg.role === 'user' ? '👤' : '🤖';
    const wrap = document.createElement('div');
    wrap.className = 'bubble-wrap';
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = msg.content || '';
    // Prefer new attachments array; fallback to legacy fields when absent
    const hasAttach = Array.isArray(msg.attachments) && msg.attachments.length > 0;
    if (hasAttach) {
      for (const a of msg.attachments) {
        if (!a?.path) continue;
        if (a.mime === 'application/pdf' || String(a.path).toLowerCase().endsWith('.pdf')) {
          const tag = document.createElement('div');
          tag.style.fontSize = '12px';
          tag.style.color = 'var(--muted)';
          const name = (a.path || '').split(/[\\/]/).pop();
          tag.textContent = `${t('tip.pdfAttachment')}${name ? ' · ' + name : ''}`;
          tag.style.cursor = 'pointer';
          tag.addEventListener('click', () => { try { window.api.openPath(a.path); } catch {} });
          wrap.appendChild(tag);
        } else {
          const pic = document.createElement('img');
          pic.className = 'msg-image';
          pic.src = 'file://' + a.path;
          try { pic.dataset.path = a.path; } catch {}
          pic.alt = 'image';
          wrap.appendChild(pic);
        }
      }
    } else {
      // Legacy imagePath
      if (msg.imagePath) {
        const pic = document.createElement('img');
        pic.className = 'msg-image';
        pic.src = 'file://' + msg.imagePath;
        try { pic.dataset.path = msg.imagePath; } catch {}
        pic.alt = 'image';
        wrap.appendChild(pic);
      }
      // Legacy pdfPath (show a small tag with file name)
      if (msg.pdfPath) {
        const tag = document.createElement('div');
        tag.style.fontSize = '12px';
        tag.style.color = 'var(--muted)';
        const name = (msg.pdfPath || '').split(/[\\/]/).pop();
        tag.textContent = `${t('tip.pdfAttachment')}${name ? ' · ' + name : ''}`;
        tag.style.cursor = 'pointer';
        tag.addEventListener('click', () => { try { window.api.openPath(msg.pdfPath); } catch {} });
        wrap.appendChild(tag);
      }
    }
    const time = document.createElement('div');
    time.className = 'timestamp';
    time.textContent = formatTime(msg.timestamp);
    wrap.appendChild(bubble);
    wrap.appendChild(time);

    // actions
    const actions = document.createElement('div');
    actions.className = 'msg-actions';
    const btnCopy = document.createElement('button');
    btnCopy.title = t('tip.copy');
    btnCopy.textContent = '📋';
    btnCopy.className = 'msg-btn';
    btnCopy.setAttribute('data-action', 'copy');
    btnCopy.setAttribute('data-mid', msg.id);
    const btnEdit = document.createElement('button');
    btnEdit.title = t('tip.edit');
    btnEdit.textContent = '✎';
    btnEdit.className = 'msg-btn';
    btnEdit.setAttribute('data-action', 'edit');
    btnEdit.setAttribute('data-mid', msg.id);
    const btnDel = document.createElement('button');
    btnDel.title = t('common.delete');
    btnDel.textContent = '🗑';
    btnDel.className = 'msg-btn';
    btnDel.setAttribute('data-action', 'delete');
    btnDel.setAttribute('data-mid', msg.id);
    actions.appendChild(btnCopy);
    actions.appendChild(btnEdit);
    actions.appendChild(btnDel);

    // Place action buttons relative to bubble wrap so absolute positioning works
    wrap.appendChild(actions);
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
  // Rebind title edit after DOM updates
  bindTitleInlineEdit();
}

// Delegate clicks for msg actions to avoid stale handlers
elMessages.addEventListener('click', async (e) => {
  const target = e.target;
  if (!(target instanceof HTMLElement)) return;
  const btn = target.closest('.msg-btn');
  if (!btn) return;
  e.stopPropagation();
  const action = btn.getAttribute('data-action');
  const mid = btn.getAttribute('data-mid') || btn.closest('.message')?.getAttribute('data-mid');
  const cid = state.currentId;
  if (!mid || !cid) return;
  const conv = (state.conversationsStore.conversations || []).find(c => c.id === cid);
  const msg = conv?.messages?.find(m => m.id === mid);
  if (!conv || !msg) return;
  if (action === 'edit') {
    await onEditMessage(cid, mid, msg.content);
  } else if (action === 'delete') {
    await onDeleteMessage(cid, mid);
  } else if (action === 'copy') {
    const text = String(msg.content || '');
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else if (window.api && typeof window.api.writeClipboardText === 'function') {
        await window.api.writeClipboardText(text);
      } else {
        throw new Error('no-clipboard');
      }
      // Optional quick feedback
      const original = btn.textContent;
      btn.textContent = '✓';
      setTimeout(() => { try { btn.textContent = original; } catch {} }, 600);
    } catch (e) {
      alert(t('label.failure', { msg: e?.message || e }));
    }
  }
});

// Open image viewer on single click
elMessages.addEventListener('click', (e) => {
  const target = e.target;
  if (!(target instanceof HTMLElement)) return;
  const img = target.closest('img.msg-image');
  if (!img) return;
  // Prefer dataset path; fallback to stripping file:// from src
  let p = img.getAttribute('data-path') || '';
  if (!p) {
    const src = img.getAttribute('src') || '';
    if (src.startsWith('file://')) p = src.replace('file://', '');
  }
  if (!p) return;
  openImageModal(p);
});

function openImageModal(absPath) {
  try {
    state.ui.previewImagePath = absPath;
    if (elImageModalImg) elImageModalImg.src = 'file://' + absPath;
    if (elImageModal) elImageModal.classList.remove('hidden');
  } catch {}
}

function closeImageModal() {
  try {
    if (elImageModal) elImageModal.classList.add('hidden');
    state.ui.previewImagePath = '';
    if (elImageModalImg) elImageModalImg.src = '';
  } catch {}
}

// Close when clicking outside content
elImageModal?.addEventListener('mousedown', (e) => {
  if (e.target === elImageModal) closeImageModal();
});
// Close on Escape
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && elImageModal && !elImageModal.classList.contains('hidden')) closeImageModal();
});
// Download button
elImageDownload?.addEventListener('click', async () => {
  const p = state.ui.previewImagePath;
  if (!p) return;
  try { await window.api.saveCopy(p); } catch {}
});

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
  const attach = (state.ui.attachments || []).slice(); // snapshot before clearing
  if (state.ui.sending) return;
  state.ui.sending = true;
  elSend.disabled = true;
  // Clear input immediately and keep focus
  elInput.value = '';
  elInput.focus();
  // Optimistically render user message (with attachments if any)
  const hasContent = !!text || (attach && attach.length);
  if (hasContent) appendOptimisticUser(text, attach);
  // Immediately clear composer attachments preview to avoid overlay while waiting
  try { clearAttachments(); } catch {}
  // Recalculate composer height after clearing input
  try { autoResizeComposer(); } catch {}
  // Show typing indicator and placeholder
  startTypingPlaceholder();
  try {
    const payload = { conversationId: state.currentId, userText: text };
    if (Array.isArray(attach) && attach.length) {
      payload.attachments = attach.map(a => ({ path: a.path, mime: a.mime }));
    }
    await window.api.sendMessage(payload);
    state.conversationsStore = await window.api.listConversations();
    stopTypingPlaceholder();
    renderMessages();
  } catch (e) {
    alert(t('err.sendFailed') + e.message);
    stopTypingPlaceholder();
    // Refresh from store to reflect any persisted user message
    state.conversationsStore = await window.api.listConversations();
    renderMessages();
  } finally {
    state.ui.sending = false;
    elSend.disabled = false;
    clearAttachments();
  }
}

function appendOptimisticUser(text, attachments) {
  const row = document.createElement('div');
  row.className = 'message user';
  const img = document.createElement('img');
  img.className = 'avatar';
  const src = avatarSrc('user');
  if (src) img.src = src; else img.alt = '👤';
  const wrap = document.createElement('div');
  wrap.className = 'bubble-wrap';
  // Optional attachments (optimistic)
  if (Array.isArray(attachments) && attachments.length) {
    for (const a of attachments) {
      if (a?.mime === 'application/pdf') {
        const fileTag = document.createElement('div');
        fileTag.style.fontSize = '12px';
        fileTag.style.color = 'var(--muted)';
        const name = (a.path || '').split(/[\\/]/).pop();
        fileTag.textContent = `${t('tip.attachedPdf')}${name ? ' · ' + name : ''}`;
        wrap.appendChild(fileTag);
      } else if (a?.path) {
        const pic = document.createElement('img');
        pic.className = 'msg-image';
        pic.src = 'file://' + a.path;
        try { pic.dataset.path = a.path; } catch {}
        pic.alt = 'image';
        wrap.appendChild(pic);
      }
    }
  }
  // Text bubble (if any)
  if (text) {
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = text;
    wrap.appendChild(bubble);
  }
  const time = document.createElement('div');
  time.className = 'timestamp';
  time.textContent = formatTime(new Date().toISOString());
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

async function onEditMessage(conversationId, messageId, oldContent) {
  const row = elMessages.querySelector(`.message[data-mid="${messageId}"]`);
  if (!row) return;
  const wrap = row.querySelector('.bubble-wrap');
  const bubble = row.querySelector('.bubble');
  const ts = row.querySelector('.timestamp');
  if (!wrap || !bubble) return;
  // Prevent duplicate editors
  if (wrap.querySelector('.msg-edit')) return;

  bubble.style.display = 'none';
  if (ts) ts.style.display = 'none';
  const editor = document.createElement('div');
  editor.className = 'msg-edit';
  const textarea = document.createElement('textarea');
  textarea.value = oldContent || '';
  const bar = document.createElement('div');
  bar.className = 'msg-edit-actions';
  const btnCancel = document.createElement('button');
  btnCancel.textContent = t('common.cancel');
  const btnSave = document.createElement('button');
  btnSave.textContent = t('common.save');
  btnSave.className = 'primary';
  bar.appendChild(btnCancel);
  bar.appendChild(btnSave);
  editor.appendChild(textarea);
  editor.appendChild(bar);
  wrap.appendChild(editor);
  textarea.focus();

  btnCancel.addEventListener('click', () => {
    editor.remove();
    bubble.style.display = '';
    if (ts) ts.style.display = '';
  });

  btnSave.addEventListener('click', async () => {
    const text = textarea.value.trim();
    try {
      const res = await window.api.updateMessage({ conversationId, messageId, content: text });
      if (!res?.ok) throw new Error(res?.error || t('err.updateFailed'));
      state.conversationsStore = await window.api.listConversations();
      renderMessages();
    } catch (e) {
      alert(t('err.editFailed') + e.message);
    }
  });
}

async function onDeleteMessage(conversationId, messageId) {
  const ok = confirm(t('confirm.deleteMsg'));
  if (!ok) return;
  try {
    const res = await window.api.deleteMessage({ conversationId, messageId });
    if (!res?.ok) throw new Error(res?.error || t('err.deleteFailed'));
    state.conversationsStore = await window.api.listConversations();
    renderMessages();
  } catch (e) {
    alert(t('err.deleteFailed') + e.message);
  }
}

async function onNewChat() {
  try {
    const conv = await window.api.createConversation();
    // Optimistically select and show the new conversation immediately
    state.currentId = conv.id;
    try { window.api.setCurrentConversation(state.currentId).catch(() => {}); } catch {}
    // Optimistically add to local store if missing
    const list = Array.isArray(state.conversationsStore?.conversations) ? state.conversationsStore.conversations : [];
    if (!list.find(c => c.id === conv.id)) {
      state.conversationsStore.conversations = [conv, ...list];
    }
    renderConversations();
    renderMessages();
    // Refresh from disk to sync any auto-pinning etc., without blocking initial UX
    state.conversationsStore = await window.api.listConversations();
    try { state.settings = await window.api.getSettings(); } catch {}
    renderConversations();
    renderMessages();
    // After final render, show typing placeholder only if greeting enabled
    try {
      const enabled = !!(state.settings?.ui?.initialGreetingOnManualCreate ?? true);
      if (enabled) startTypingPlaceholder();
    } catch {}
  } catch (e) {
    alert(t('err.newChatFailed') + e.message);
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
  if (elGreetOnCreate) elGreetOnCreate.checked = s.ui?.initialGreetingOnManualCreate ?? true;
  const vDefault = navigator.userAgent.includes('Mac') ? true : false;
  elVibrancyEnabled.checked = s.ui?.vibrancy?.enabled ?? vDefault;
  elVibrancyStrength.value = Math.round((s.ui?.vibrancy?.strength ?? 0.65) * 100);
  elVibrancySidebarStrength.value = Math.round((s.ui?.vibrancy?.sidebarStrength ?? 0.35) * 100);
  if (elLanguage) elLanguage.value = s.ui?.language || 'zh-CN';
  elNameUser.value = s.ui?.names?.user || '我';
  elNameModel.value = s.ui?.names?.model || '小助手';
  // Preview packaged defaults when user has not set custom avatars yet
  elAvatarUserPreview.src = (s.avatars?.user && String(s.avatars.user).trim()) ? s.avatars.user : DEFAULT_AVATARS.user;
  elAvatarAgentPreview.src = (s.avatars?.agent && String(s.avatars.agent).trim()) ? s.avatars.agent : DEFAULT_AVATARS.agent;
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
    ui: {
      ...(state.settings.ui || {}),
      language: (elLanguage && elLanguage.value) || (state.settings.ui?.language || 'zh-CN'),
      initialGreetingOnManualCreate: !!(elGreetOnCreate && elGreetOnCreate.checked),
      vibrancy: {
        enabled: !!elVibrancyEnabled.checked,
        strength: Math.max(0, Math.min(1, Number(elVibrancyStrength.value) / 100 || 0.65)),
        sidebarStrength: Math.max(0, Math.min(1, Number(elVibrancySidebarStrength.value) / 100 || 0.35)),
      },
      names: {
        user: elNameUser.value.trim() || '我',
        model: elNameModel.value.trim() || '小助手',
      },
    },
  };
}

async function saveSettings() {
  const patch = buildSettingsPatchFromForm();
  state.settings = await window.api.updateSettings(patch);
  // Apply vibrancy without restart (macOS)
  try { await window.api.applyVibrancy(!!state.settings.ui?.vibrancy?.enabled); } catch {}
  applyTranslucencyFromSettings();
  // Re-apply i18n if language changed
  try { applyI18nFromState(); renderConversations(); renderMessages(); updateSidebarToggleLabel(); } catch {}
  hide(elSettingsModal);
}

async function testApiSettings() {
  const patch = buildSettingsPatchFromForm();
  elTestApi.disabled = true;
  elTestApiStatus.textContent = t('label.testing');
  try {
    const res = await window.api.testApi(patch);
    if (res?.ok) {
      const preview = (res.content || '').slice(0, 60).replace(/\s+/g, ' ');
      elTestApiStatus.textContent = t('label.success', { preview: preview || t('label.emptyReply') });
    } else {
      elTestApiStatus.textContent = t('label.failure', { msg: res?.error || t('err.unknown') });
    }
  } catch (e) {
    elTestApiStatus.textContent = t('label.failure', { msg: e.message });
  } finally {
    elTestApi.disabled = false;
  }
}

async function pickAvatar(kind) {
  const file = await window.api.pickAvatar();
  if (!file) return;
  openAvatarCrop(kind, file);
}

function openAvatarCrop(kind, filePath) {
  try {
    if (!elAvatarCropModal || !elAvatarCropImg || !elCropStage || !elCropRect) return;
    state.ui.avatarCrop = {
      kind,
      path: filePath,
      natural: { w: 0, h: 0 },
      imgRect: { left: 0, top: 0, width: 0, height: 0 },
      crop: { left: 0, top: 0, size: 0 },
      mode: '',
      start: { x: 0, y: 0, left: 0, top: 0, size: 0 },
      handle: '',
    };
    // Show modal first to ensure elements have layout when measuring
    show(elAvatarCropModal);
    elAvatarCropImg.onload = () => {
      try {
        state.ui.avatarCrop.natural = { w: elAvatarCropImg.naturalWidth, h: elAvatarCropImg.naturalHeight };
        requestAnimationFrame(() => layoutCropElements());
      } catch {}
    };
    elAvatarCropImg.src = (String(filePath || '').startsWith('file://')) ? filePath : ('file://' + filePath);
  } catch {}
}

function closeAvatarCrop() {
  try {
    if (elAvatarCropModal) hide(elAvatarCropModal);
    if (elAvatarCropImg) elAvatarCropImg.src = '';
    state.ui.avatarCrop = null;
  } catch {}
}

function layoutCropElements() {
  try {
    const s = state.ui.avatarCrop;
    if (!s || !elAvatarCropImg || !elCropStage || !elCropRect) return;
    // Compute displayed image box via object-fit: contain
    const stageRect = elCropStage.getBoundingClientRect();
    const stageW = stageRect.width;
    const stageH = stageRect.height;
    const natW = Math.max(1, s.natural.w || elAvatarCropImg.naturalWidth || 1);
    const natH = Math.max(1, s.natural.h || elAvatarCropImg.naturalHeight || 1);
    const scale = Math.min(stageW / natW, stageH / natH);
    const dispW = Math.max(1, Math.floor(natW * scale));
    const dispH = Math.max(1, Math.floor(natH * scale));
    const left = Math.floor((stageW - dispW) / 2);
    const top = Math.floor((stageH - dispH) / 2);
    s.imgRect = { left, top, width: dispW, height: dispH };
    if (!s.crop || !s.crop.size) {
      // 默认：正方形裁剪框居中且尽可能大
      const size = Math.max(40, Math.floor(Math.min(dispW, dispH)));
      const cx = left + (dispW - size) / 2;
      const cy = top + (dispH - size) / 2;
      s.crop = { left: cx, top: cy, size };
    } else {
      const maxLeft = s.imgRect.left + s.imgRect.width - s.crop.size;
      const maxTop = s.imgRect.top + s.imgRect.height - s.crop.size;
      s.crop.left = clamp(s.crop.left, s.imgRect.left, Math.max(s.imgRect.left, maxLeft));
      s.crop.top = clamp(s.crop.top, s.imgRect.top, Math.max(s.imgRect.top, maxTop));
      const maxSize = Math.min(s.imgRect.width, s.imgRect.height);
      s.crop.size = clamp(s.crop.size, 40, maxSize);
    }
    elCropRect.style.left = s.crop.left + 'px';
    elCropRect.style.top = s.crop.top + 'px';
    elCropRect.style.width = s.crop.size + 'px';
    elCropRect.style.height = s.crop.size + 'px';
  } catch {}
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function onCropMouseDown(e) {
  try {
    const s = state.ui.avatarCrop;
    if (!s) return;
    const target = e.target;
    const isHandle = target && target.classList && target.classList.contains('handle');
    let handle = isHandle ? (target.getAttribute('data-dir') || '') : '';
    if (!isHandle) {
      // 允许拖拽边框进行缩放（不必命中小手柄）
      handle = detectEdgeHandleAtClient(e) || '';
    }
    s.mode = handle ? 'resize' : 'move';
    s.handle = handle;
    s.start = { x: e.clientX, y: e.clientY, left: s.crop.left, top: s.crop.top, size: s.crop.size };
    window.addEventListener('mousemove', onCropMouseMove);
    window.addEventListener('mouseup', onCropMouseUp, { once: true });
    e.preventDefault();
    e.stopPropagation();
  } catch {}
}

function detectEdgeHandleAtClient(e) {
  try {
    const s = state.ui.avatarCrop;
    if (!s) return '';
    const stageRect = elCropStage.getBoundingClientRect();
    const px = e.clientX - stageRect.left;
    const py = e.clientY - stageRect.top;
    const r = s.crop;
    const tol = 8; // 容差像素
    const nearLeft = Math.abs(px - r.left) <= tol;
    const nearRight = Math.abs(px - (r.left + r.size)) <= tol;
    const nearTop = Math.abs(py - r.top) <= tol;
    const nearBottom = Math.abs(py - (r.top + r.size)) <= tol;
    const insideX = px >= r.left - tol && px <= r.left + r.size + tol;
    const insideY = py >= r.top - tol && py <= r.top + r.size + tol;
    if (!(insideX && insideY)) return '';
    if (nearLeft && nearTop) return 'nw';
    if (nearRight && nearTop) return 'ne';
    if (nearLeft && nearBottom) return 'sw';
    if (nearRight && nearBottom) return 'se';
    if (nearTop) return 'n';
    if (nearBottom) return 's';
    if (nearLeft) return 'w';
    if (nearRight) return 'e';
    return '';
  } catch { return ''; }
}

// Hover 时显示对应的光标
function onCropHoverMove(e) {
  try {
    const s = state.ui.avatarCrop;
    if (!s || s.mode) return; // 正在拖拽时不改变光标
    const h = detectEdgeHandleAtClient(e);
    const map = { n: 'ns-resize', s: 'ns-resize', w: 'ew-resize', e: 'ew-resize', nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize' };
    elCropLayer.style.cursor = h ? (map[h] || 'move') : 'move';
  } catch {}
}

function onCropMouseMove(e) {
  try {
    const s = state.ui.avatarCrop;
    if (!s) return;
    const dx = e.clientX - s.start.x;
    const dy = e.clientY - s.start.y;
    const img = s.imgRect;
    let left = s.start.left;
    let top = s.start.top;
    let size = s.start.size;
    const minSize = 40;
    const right0 = s.start.left + s.start.size;
    const bottom0 = s.start.top + s.start.size;

    if (s.mode === 'move') {
      left = clamp(s.start.left + dx, img.left, img.left + img.width - size);
      top = clamp(s.start.top + dy, img.top, img.top + img.height - size);
    } else if (s.mode === 'resize') {
      const dir = s.handle;
      if (dir === 'n') {
        const topCand = clamp(s.start.top + dy, img.top, bottom0 - minSize);
        size = bottom0 - topCand;
        top = topCand;
      } else if (dir === 's') {
        size = clamp(s.start.size + dy, minSize, (img.top + img.height) - s.start.top);
      } else if (dir === 'w') {
        const leftCand = clamp(s.start.left + dx, img.left, right0 - minSize);
        size = right0 - leftCand;
        left = leftCand;
      } else if (dir === 'e') {
        size = clamp(s.start.size + dx, minSize, (img.left + img.width) - s.start.left);
      } else if (dir === 'nw') {
        const leftCand = clamp(s.start.left + dx, img.left, right0 - minSize);
        const topCand = clamp(s.start.top + dy, img.top, bottom0 - minSize);
        size = Math.min(right0 - leftCand, bottom0 - topCand);
        left = right0 - size;
        top = bottom0 - size;
      } else if (dir === 'ne') {
        const rightCand = clamp(right0 + dx, s.start.left + minSize, img.left + img.width);
        const topCand = clamp(s.start.top + dy, img.top, bottom0 - minSize);
        size = Math.min(rightCand - s.start.left, bottom0 - topCand);
        left = s.start.left;
        top = bottom0 - size;
      } else if (dir === 'sw') {
        const leftCand = clamp(s.start.left + dx, img.left, right0 - minSize);
        const bottomCand = clamp(bottom0 + dy, s.start.top + minSize, img.top + img.height);
        size = Math.min(right0 - leftCand, bottomCand - s.start.top);
        left = right0 - size;
        top = s.start.top;
      } else if (dir === 'se') {
        const rightCand = clamp(right0 + dx, s.start.left + minSize, img.left + img.width);
        const bottomCand = clamp(bottom0 + dy, s.start.top + minSize, img.top + img.height);
        size = Math.min(rightCand - s.start.left, bottomCand - s.start.top);
        left = s.start.left;
        top = s.start.top;
      }
      size = clamp(size, minSize, Math.min(img.width, img.height));
      left = clamp(left, img.left, img.left + img.width - size);
      top = clamp(top, img.top, img.top + img.height - size);
    }
    s.crop = { left, top, size };
    if (elCropRect) {
      elCropRect.style.left = left + 'px';
      elCropRect.style.top = top + 'px';
      elCropRect.style.width = size + 'px';
      elCropRect.style.height = size + 'px';
    }
  } catch {}
}

function onCropMouseUp() {
  try {
    const s = state.ui.avatarCrop;
    if (!s) return;
    s.mode = '';
    s.handle = '';
    window.removeEventListener('mousemove', onCropMouseMove);
  } catch {}
}

async function applyAvatarCrop() {
  try {
    const s = state.ui.avatarCrop;
    if (!s || !elAvatarCropImg) return;
    const { left, top, size } = s.crop;
    const { left: il, top: it, width: iw, height: ih } = s.imgRect;
    const natW = Math.max(1, s.natural.w || elAvatarCropImg.naturalWidth || 1);
    const natH = Math.max(1, s.natural.h || elAvatarCropImg.naturalHeight || 1);
    // From displayed box -> natural coordinates
    const scale = Math.min(iw / natW, ih / natH);
    const scaleX = 1 / scale;
    const scaleY = 1 / scale;
    const sx = (left - il) * scaleX;
    const sy = (top - it) * scaleY;
    const sw = size * scaleX;
    const sh = size * scaleY;
    const dest = 256;
    const canvas = document.createElement('canvas');
    canvas.width = dest;
    canvas.height = dest;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(elAvatarCropImg, sx, sy, sw, sh, 0, 0, dest, dest);
    const dataUrl = canvas.toDataURL('image/png');
    if (!state.settings.avatars) state.settings.avatars = {};
    state.settings.avatars[s.kind] = dataUrl;
    state.settings = await window.api.updateSettings({ avatars: state.settings.avatars });
    fillSettingsForm();
    renderMessages();
    closeAvatarCrop();
  } catch (e) {
    alert(t('label.failure', { msg: e?.message || e }));
  }
}

// Memory modal logic
async function openMemoryModal() {
  try { state.memory = await window.api.listMemory(); } catch {}
  renderMemoryList();
  show(elMemoryModal);
}
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
  const title = elMemTitle.value.trim() || t('label.mem.defaultTitle');
  const content = elMemContent.value.trim();
  const prev = elMemSave.textContent;
  try {
    elMemSave.disabled = true;
    elMemSave.textContent = t('label.mem.saving');
    if (!selectedMemId) {
      await window.api.addMemory({ title, content });
    } else {
      await window.api.updateMemory({ id: selectedMemId, title, content, tags: [] });
    }
    state.memory = await window.api.listMemory();
    renderMemoryList();
    elMemSave.textContent = t('label.mem.saved');
    setTimeout(() => { try { elMemSave.textContent = prev; elMemSave.disabled = false; } catch {} }, 900);
  } catch (e) {
    alert(t('err.saveFailed') + (e?.message || t('err.unknown')));
    elMemSave.textContent = prev;
    elMemSave.disabled = false;
  }
}

async function memDelete() {
  if (!selectedMemId) return;
  if (!confirm(t('confirm.deleteMem'))) return;
  await window.api.deleteMemory(selectedMemId);
  state.memory = await window.api.listMemory();
  selectedMemId = null;
  fillMemoryEditor({});
  renderMemoryList();
}

async function onSummarize() {
  if (!state.currentId) return;
  const ok = confirm(t('confirm.summarize'));
  if (!ok) return;
  try {
    const text = await window.api.summarizeToMemory({ conversationId: state.currentId });
    alert((t('memory.title') + ':\n\n') + text.slice(0, 400));
    state.memory = await window.api.listMemory();
  } catch (e) {
    alert(t('label.failure', { msg: e.message }));
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
    if (elLogsList) elLogsList.textContent = t('err.readFailed') + e.message;
  }
}

// Events wiring
elSend.addEventListener('click', onSend);
elInput.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') onSend();
});
// Auto-resize while typing (when not manually resized)
elInput.addEventListener('input', () => { try { autoResizeComposer(); } catch {} });
// Paste: if clipboard has image, add as attachment (text continues to paste normally)
elInput.addEventListener('paste', async (e) => {
  try {
    const items = Array.from(e.clipboardData?.items || []);
    const imgItems = items.filter(it => it && it.kind === 'file' && String(it.type || '').startsWith('image/'));
    const saved = [];
    if (imgItems.length && window.api && typeof window.api.saveImageBuffer === 'function') {
      for (const it of imgItems) {
        const file = it.getAsFile && it.getAsFile();
        if (!file) continue;
        const buf = await file.arrayBuffer();
        const res = await window.api.saveImageBuffer(new Uint8Array(buf), file.type || 'image/png');
        if (res && res.ok && res.path) saved.push({ path: res.path, mime: res.mime || file.type || 'image/png' });
      }
    }
    // Fallback to system clipboard image if event items not present
    if (!saved.length && window.api && typeof window.api.pasteImageFromClipboard === 'function') {
      const res = await window.api.pasteImageFromClipboard();
      if (res && res.ok && res.path) saved.push({ path: res.path, mime: res.mime || detectMimeFromPath(res.path) || 'image/png' });
    }
    if (saved.length) {
      const list = Array.isArray(state.ui.attachments) ? state.ui.attachments : [];
      for (const a of saved) list.push(a);
      state.ui.attachments = list;
      renderAttachment();
      try { autoResizeComposer(); } catch {}
    }
  } catch {}
});
window.addEventListener('resize', () => { try { autoResizeComposer(); } catch {} });
elNewChat.addEventListener('click', onNewChat);
elSummarize.addEventListener('click', onSummarize);
elSidebarToggle?.addEventListener('click', () => { toggleSidebar(); });
elExportMenuBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleExportMenu();
});
elExportDropdown?.addEventListener('click', async (e) => {
  e.stopPropagation();
  const target = e.target;
  if (!(target instanceof HTMLElement)) return;
  const action = target.getAttribute('data-action');
  if (!action) return;
  hideExportMenu();
  const includeTs = !!elExportIncludeTs?.checked;
  const includeFiles = !!elExportIncludeFiles?.checked;
  if (action === 'current-json') return onExport('json', includeTs, includeFiles);
  if (action === 'current-md') return onExport('md', includeTs, includeFiles);
  if (action === 'all-json') return onExportAll('json', includeTs, includeFiles);
  if (action === 'all-md') return onExportAll('md', includeTs, includeFiles);
});
elExportIncludeTs?.addEventListener('change', async () => {
  try {
    const nextUi = { ...(state.settings.ui || {}), exportIncludeTimestamp: !!elExportIncludeTs.checked };
    state.settings = await window.api.updateSettings({ ui: nextUi });
  } catch {}
});
elExportIncludeFiles?.addEventListener('change', async () => {
  try {
    const nextUi = { ...(state.settings.ui || {}), exportIncludeAttachments: !!elExportIncludeFiles.checked };
    state.settings = await window.api.updateSettings({ ui: nextUi });
  } catch {}
});
document.addEventListener('click', hideExportMenu);
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    hideExportMenu();
    // Close settings modal with ESC
    try { if (elSettingsModal && !elSettingsModal.classList.contains('hidden')) hide(elSettingsModal); } catch {}
    // Close memory modal with ESC
    try { if (elMemoryModal && !elMemoryModal.classList.contains('hidden')) hide(elMemoryModal); } catch {}
    // Collapse sidebar if visible
    try {
      const app = document.getElementById('app');
      if (app && !app.classList.contains('sidebar-hidden')) {
        app.classList.add('sidebar-hidden');
        updateSidebarToggleLabel();
        if (window.api && typeof window.api.setMinWidth === 'function') {
          window.api.setMinWidth(400).catch(() => {});
        }
      }
    } catch {}
  }
  // Cmd/Ctrl + N: New chat
  try {
    if ((e.metaKey || e.ctrlKey) && String(e.key || '').toLowerCase() === 'n') {
      e.preventDefault();
      onNewChat();
    }
  } catch {}
  // Cmd/Ctrl + M: Open Memory
  try {
    if ((e.metaKey || e.ctrlKey) && String(e.key || '').toLowerCase() === 'm') {
      e.preventDefault();
      openMemoryModal();
    }
  } catch {}
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
  elProactiveStatus.textContent = t('label.testNotify.sending');
  try {
    const res = await window.api.testNotify();
    elProactiveStatus.textContent = res?.ok ? t('label.testNotify.sent') : t('label.failure', { msg: res?.error || '' });
  } catch (e) {
    elProactiveStatus.textContent = t('label.failure', { msg: e.message });
  } finally {
    elBtnTestNotif.disabled = false;
  }
});

// Menu accelerator: listen for menu events from main
try { window.api.onNewChat?.(() => onNewChat()); } catch {}
try { window.api.onOpenMemory?.(() => openMemoryModal()); } catch {}

elBtnProactiveOnce?.addEventListener('click', async () => {
  elBtnProactiveOnce.disabled = true;
  elProactiveStatus.textContent = t('label.checkingNow');
  try {
    const res = await window.api.proactiveOnce();
    if (res?.ok) {
      elProactiveStatus.textContent = t('label.checkDone', { sent: res.sent, checked: res.checked });
      // refresh after sending
      state.conversationsStore = await window.api.listConversations();
      renderConversations();
      renderMessages();
    } else {
      elProactiveStatus.textContent = t('label.failure', { msg: res?.error || '' });
    }
  } catch (e) {
    elProactiveStatus.textContent = t('label.failure', { msg: e.message });
  } finally {
    elBtnProactiveOnce.disabled = false;
  }
});
// Click on avatar images to choose and crop
elAvatarUserPreview?.addEventListener('click', () => pickAvatar('user'));
elAvatarAgentPreview?.addEventListener('click', () => pickAvatar('agent'));

// Avatar crop modal events
elAvatarCropClose?.addEventListener('click', () => { try { closeAvatarCrop(); } catch {} });
elAvatarCropCancel?.addEventListener('click', () => { try { closeAvatarCrop(); } catch {} });
elAvatarCropApply?.addEventListener('click', () => { try { applyAvatarCrop(); } catch {} });
elCropLayer?.addEventListener('mousedown', (e) => { try { onCropMouseDown(e); } catch {} });
elCropLayer?.addEventListener('mousemove', (e) => { try { onCropHoverMove(e); } catch {} });
window.addEventListener('resize', () => { try { layoutCropElements(); } catch {} });

elOpenMemory.addEventListener('click', openMemoryModal);
elCloseMemory.addEventListener('click', () => hide(elMemoryModal));
elMemNew.addEventListener('click', memNew);
elMemSave.addEventListener('click', memSave);
elMemDelete.addEventListener('click', memDelete);

elLogsRefresh?.addEventListener('click', refreshLogs);
elLogsClear?.addEventListener('click', async () => { await window.api.clearLogs(); await refreshLogs(); });
// elMigrateAttachments?.addEventListener('click', async () => {
//   try {
//     elMigrateAttachments.disabled = true;
//     elMigrateAttachments.textContent = '迁移中...';
//     const res = await window.api.migrateAttachments();
//     if (res?.ok) {
//       alert(`迁移完成：\n复制/移动 ${res.moved || 0} 个文件；\n更新 ${res.updated || 0} 处引用；\n错误 ${res.errors || 0}。`);
//       // Reload store to reflect updated paths
//       state.conversationsStore = await window.api.listConversations();
//       renderConversations();
//       renderMessages();
//     } else {
//       alert('迁移失败：' + (res?.error || '未知错误'));
//     }
//   } catch (e) {
//     alert('迁移异常：' + e.message);
//   } finally {
//     elMigrateAttachments.disabled = false;
//     elMigrateAttachments.textContent = '迁移历史附件';
//   }
// });

// CmdOrCtrl+, to open Settings quickly
window.addEventListener('keydown', async (e) => {
  try {
    const isMac = navigator.platform && /Mac/i.test(navigator.platform);
    const hit = ((isMac && e.metaKey) || (!isMac && e.ctrlKey)) && (e.key === ',' || e.code === 'Comma');
    if (!hit) return;
    e.preventDefault();
    e.stopPropagation();
    // Toggle open; keep simple: open if hidden
    if (elSettingsModal && elSettingsModal.classList.contains('hidden')) {
      fillSettingsForm();
      await refreshLogs();
      show(elSettingsModal);
    }
  } catch {}
});

// CmdOrCtrl+B to expand sidebar
window.addEventListener('keydown', (e) => {
  try {
    const isMac = navigator.platform && /Mac/i.test(navigator.platform);
    const hit = ((isMac && e.metaKey) || (!isMac && e.ctrlKey)) && (e.key.toLowerCase?.() === 'b' || e.code === 'KeyB');
    if (!hit) return;
    e.preventDefault();
    e.stopPropagation();
    toggleSidebarWithGuard();
  } catch {}
});

// Live preview translucency while sliding
elVibrancyStrength?.addEventListener('input', () => {
  const strength = Math.max(0, Math.min(1, Number(elVibrancyStrength.value) / 100 || 0.65));
  const side = Math.max(0, Math.min(1, Number(elVibrancySidebarStrength.value) / 100 || 0.35));
  applyTranslucency(strength, side);
});
elVibrancyEnabled?.addEventListener('change', async () => {
  try { await window.api.applyVibrancy(!!elVibrancyEnabled.checked); } catch {}
});
elVibrancySidebarStrength?.addEventListener('input', () => {
  const strength = Math.max(0, Math.min(1, Number(elVibrancyStrength.value) / 100 || 0.65));
  const side = Math.max(0, Math.min(1, Number(elVibrancySidebarStrength.value) / 100 || 0.35));
  applyTranslucency(strength, side);
});
// Live preview language switch in Settings (does not persist until Save)
elLanguage?.addEventListener('change', () => {
  try {
    const ui = state.settings.ui || {};
    state.settings.ui = { ...ui, language: elLanguage.value };
    applyI18nFromState();
    renderConversations();
    renderMessages();
    updateSidebarToggleLabel();
  } catch {}
});

init();

// Close sidebar when clicking outside of it
document.addEventListener('mousedown', (e) => {
  try {
    const app = document.getElementById('app');
    const sidebar = document.querySelector('.sidebar');
    const toggle = document.getElementById('btn-sidebar-toggle');
    if (!app || !sidebar) return;
    // Only when sidebar is open
    if (app.classList.contains('sidebar-hidden')) return;
    const target = e.target;
    if (!(target instanceof Element)) return;
    // Ignore clicks inside sidebar or on the toggle button
    if (target.closest('.sidebar')) return;
    if (toggle && target.closest('#btn-sidebar-toggle')) return;
    // Clicked outside: close
    toggleSidebar();
  } catch {}
});

// Attachments handling
function detectMimeFromPath(p) {
  const lower = String(p || '').toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.bmp')) return 'image/bmp';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  return '';
}

function renderAttachment() {
  if (!elComposerAttachment) return;
  const arr = state.ui.attachments || [];
  if (!arr.length) {
    elComposerAttachment.classList.add('hidden');
    elComposerAttachment.innerHTML = '';
    return;
  }
  elComposerAttachment.classList.remove('hidden');
  elComposerAttachment.innerHTML = '';
  const list = document.createElement('div');
  list.className = 'attachment-list';
  arr.forEach((a, idx) => {
    if (a?.mime === 'application/pdf') {
      const chip = document.createElement('div');
      chip.className = 'file-chip';
      chip.title = a.path;
      chip.textContent = '📄 ' + ((a.path || '').split(/[\\/]/).pop() || 'PDF');
      chip.addEventListener('click', () => removeAttachmentAt(idx));
      list.appendChild(chip);
    } else if (a?.path) {
      const img = document.createElement('img');
      img.className = 'thumb';
      img.src = 'file://' + a.path;
      img.alt = 'image';
      img.title = a.path;
      img.addEventListener('click', () => removeAttachmentAt(idx));
      list.appendChild(img);
  }
});

// Respond to native menu “Preferences…” event from main process
try {
  window.api.onOpenSettings(async () => {
    fillSettingsForm();
    await refreshLogs();
    show(elSettingsModal);
  });
} catch {}

// Respond to native menu “Toggle Sidebar” accelerator
try {
  window.api.onToggleSidebar(() => { try { toggleSidebarWithGuard(); } catch {} });
} catch {}
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.style.minWidth = '160px';
  meta.style.display = 'flex';
  meta.style.flexDirection = 'column';
  meta.style.gap = '2px';
  meta.innerHTML = `<div>${t('label.attachmentsMeta', { n: arr.length })}</div><div class=\"muted\">${t('label.clickToRemove')}</div>`;
  const actions = document.createElement('div');
  actions.className = 'actions';
  const btn = document.createElement('button');
  btn.textContent = t('label.clear');
  btn.addEventListener('click', clearAttachments);
  actions.appendChild(btn);
  elComposerAttachment.appendChild(list);
  elComposerAttachment.appendChild(meta);
  elComposerAttachment.appendChild(actions);
}

function clearAttachments() {
  state.ui.attachments = [];
  renderAttachment();
  try {
    // Reset composer to default height and re-enable autosize
    state.ui.manualComposer = false;
    if (elChat) elChat.style.setProperty('--composer-height', '160px');
    if (elInput) elInput.style.height = '';
    autoResizeComposer();
  } catch {}
}

function removeAttachmentAt(i) {
  const arr = state.ui.attachments || [];
  if (i < 0 || i >= arr.length) return;
  arr.splice(i, 1);
  state.ui.attachments = arr;
  renderAttachment();
  try {
    if (!state.ui.attachments.length) {
      // Last one removed: reset to default height
      state.ui.manualComposer = false;
      if (elChat) elChat.style.setProperty('--composer-height', '160px');
      if (elInput) elInput.style.height = '';
    }
    autoResizeComposer();
  } catch {}
}

async function onPickImage() {
  try {
    const sel = await window.api.pickImage();
    if (!sel) return;
    const files = Array.isArray(sel) ? sel : [sel];
    const list = state.ui.attachments || [];
    files.forEach(fp => { if (fp) list.push({ path: fp, mime: detectMimeFromPath(fp) }); });
    state.ui.attachments = list;
    renderAttachment();
    try { autoResizeComposer(); } catch {}
  } catch (e) {
    alert(t('label.pickImageFailed') + e.message);
  }
}

elAttachBtn?.addEventListener('click', onPickImage);

async function onPickPdf() {
  try {
    const sel = await window.api.pickPdf();
    if (!sel) return;
    const files = Array.isArray(sel) ? sel : [sel];
    const list = state.ui.attachments || [];
    files.forEach(fp => { if (fp) list.push({ path: fp, mime: 'application/pdf' }); });
    state.ui.attachments = list;
    renderAttachment();
    try { autoResizeComposer(); } catch {}
  } catch (e) {
    alert(t('label.pickPdfFailed') + e.message);
  }
}

elAttachPdfBtn?.addEventListener('click', onPickPdf);

// Proactive countdown in settings
function startProactiveCountdown() {
  try { if (state.ui.proactiveTicker) clearInterval(state.ui.proactiveTicker); } catch {}
  const tick = async () => {
    try {
      const res = await window.api.proactiveStatus();
      if (!elProactiveStatus) return;
      if (!res?.ok) { elProactiveStatus.textContent = t('err.statusFailed'); return; }
      if (!res.enabled) { elProactiveStatus.textContent = t('label.disabled'); return; }
      const now = res.now || Date.now();
      const nextAt = res.nextAt || 0;
      if (!nextAt || !res.intervalMs) { elProactiveStatus.textContent = t('label.timerNotStarted'); return; }
      const left = Math.max(0, nextAt - now);
      elProactiveStatus.textContent = t('label.nextCheck', { duration: formatDuration(left) });
    } catch {
      if (elProactiveStatus) elProactiveStatus.textContent = '';
    }
  };
  tick();
  state.ui.proactiveTicker = setInterval(tick, 1000);
}

function formatDuration(ms) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${m}:${pad(s)}`;
}

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
    // While dragging, keep textarea filling available area
    try { autoResizeComposer(); } catch {}
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
    // Mark manual override to pause autosize until reset
    state.ui.manualComposer = true;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'row-resize';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });
  // Double-click resizer to re-enable autosize
  elChatResizer.addEventListener('dblclick', () => {
    state.ui.manualComposer = false;
    try { autoResizeComposer(); } catch {}
  });
}

// Auto-size the composer area to fit input (unless manually resized)
function autoResizeComposer() {
  if (!elChat || !elInput || !elComposer) return;
  // Measure paddings and gaps
  const compStyle = getComputedStyle(elComposer);
  const padTop = parseInt(compStyle.paddingTop) || 0;
  const padBottom = parseInt(compStyle.paddingBottom) || 0;
  const rowGap = parseInt(compStyle.gap) || 0;
  const pad = padTop + padBottom;
  // Measure optional attachment height
  const attachVisible = elComposerAttachment && !elComposerAttachment.classList.contains('hidden') && elComposerAttachment.childElementCount > 0;
  const attachH = attachVisible ? (elComposerAttachment.offsetHeight || 0) : 0;
  // Measure actions height
  const actions = document.querySelector('.composer-actions');
  const actionsH = actions ? (actions.offsetHeight || 0) : 0;
  // Measure text content height
  const prev = elInput.style.height;
  // Current composer height from CSS variable (keep if empty input)
  const cssH = getComputedStyle(elChat).getPropertyValue('--composer-height').trim();
  let curH = Number((cssH || '160px').replace('px', '')) || 160;
  // If an attachment is visible, ensure composer height is tall enough
  if (attachVisible) {
    const rect = elChat.getBoundingClientRect();
    const minText = 80; // at least this much space for textarea
    const required = pad + (attachH ? (attachH + rowGap) : 0) + Math.max(actionsH, minText);
    const maxH = Math.max(120, Math.min(500, rect.height - 160));
    const target = Math.min(Math.max(required, 80), maxH);
    if (curH < target) {
      curH = target;
      elChat.style.setProperty('--composer-height', `${Math.round(curH)}px`);
    }
  }
  const empty = elInput.value.trim().length === 0;

  if (empty) {
    // Keep current composer height; let textarea fill remaining space
    const base = curH - pad - (attachH ? (attachH + rowGap) : 0);
    const avail = Math.max(24, Math.min(420, base));
    elInput.style.height = `${Math.round(avail)}px`;
  } else {
    elInput.style.height = 'auto';
    const desiredTextH = Math.max(38, Math.min(420, elInput.scrollHeight || 0));
    if (state.ui.manualComposer) {
      // Respect manual composer height: fit textarea within available area
      const base = curH - pad - (attachH ? (attachH + rowGap) : 0);
      const avail = Math.max(24, Math.min(420, base));
      const textH = Math.min(desiredTextH, avail);
      elInput.style.height = `${Math.round(textH)}px`;
    } else {
      const rowH = Math.max(desiredTextH, actionsH);
      let newH = pad + (attachH ? (attachH + rowGap) : 0) + rowH;
      // Clamp based on chat container height
      const rect = elChat.getBoundingClientRect();
      const minH = 80;
      const maxH = Math.max(120, Math.min(500, rect.height - 160));
      newH = Math.max(minH, Math.min(maxH, newH));
      elChat.style.setProperty('--composer-height', `${Math.round(newH)}px`);
      // Apply explicit textarea height to avoid inner scroll
      elInput.style.height = `${Math.round(desiredTextH)}px`;
    }
  }
  // Keep scrolled to newest content
  try { elMessages.scrollTop = elMessages.scrollHeight; } catch {}
}

function applyTranslucencyFromSettings() {
  const s = state.settings || {};
  const strength = Math.max(0, Math.min(1, Number(s.ui?.vibrancy?.strength ?? 0.65)));
  const side = Math.max(0, Math.min(1, Number(s.ui?.vibrancy?.sidebarStrength ?? 0.35)));
  applyTranslucency(strength, side);
}

function applyTranslucency(strength, sidebarStrength) {
  const dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const root = document.documentElement;
  const rgb = dark
    ? { bg: '15,17,21', panel: '21,24,34', panel2: '27,31,43', field: '255,255,255' }
    : { bg: '248,250,253', panel: '255,255,255', panel2: '246,248,251', field: '255,255,255' };
  const a = (min, max) => (min + (max - min) * strength).toFixed(2);
  const alpha = dark
    ? { bg: a(0.45, 0.80), panel: a(0.50, 0.85), panel2: a(0.40, 0.75), field: a(0.06, 0.22) }
    : { bg: a(0.50, 0.90), panel: a(0.60, 0.95), panel2: a(0.55, 0.85), field: a(0.85, 0.95) };
  root.style.setProperty('--bg', `rgba(${rgb.bg}, ${alpha.bg})`);
  root.style.setProperty('--panel', `rgba(${rgb.panel}, ${alpha.panel})`);
  // Make header match modal/panel color (no gradient, same tone)
  root.style.setProperty('--panel-header', `rgba(${rgb.panel}, ${alpha.panel})`);
  root.style.setProperty('--panel-2', `rgba(${rgb.panel2}, ${alpha.panel2})`);
  root.style.setProperty('--field-bg', `rgba(${rgb.field}, ${alpha.field})`);
  // Sidebar transparency independent control
  const sMap = (min, max) => (min + (max - min) * (sidebarStrength ?? 0.35)).toFixed(2);
  const sAlpha = dark ? sMap(0.30, 0.60) : sMap(0.15, 0.50);
  root.style.setProperty('--sidebar-panel', `rgba(${rgb.panel}, ${sAlpha})`);
}

function toggleSidebar() {
  const app = document.getElementById('app');
  app.classList.toggle('sidebar-hidden');
  updateSidebarToggleLabel();
  try {
    const hidden = app.classList.contains('sidebar-hidden');
    // Adjust window min width: 400 when hidden, 700 when visible
    if (window.api && typeof window.api.setMinWidth === 'function') {
      window.api.setMinWidth(hidden ? 400 : 700).catch(() => {});
    }
  } catch {}
}

function updateSidebarToggleLabel() {
  const app = document.getElementById('app');
  const hidden = app.classList.contains('sidebar-hidden');
  if (elSidebarToggle) {
    elSidebarToggle.textContent = hidden ? '⏵' : '⏴';
    elSidebarToggle.title = hidden ? t('label.sidebar.expand') : t('label.sidebar.collapse');
  }
}

function ensureSidebarVisible() {
  try {
    const app = document.getElementById('app');
    if (!app.classList.contains('sidebar-hidden')) return;
    app.classList.remove('sidebar-hidden');
    updateSidebarToggleLabel();
    if (window.api && typeof window.api.setMinWidth === 'function') {
      window.api.setMinWidth(700).catch(() => {});
    }
  } catch {}
}

function toggleSidebarWithGuard() {
  const now = Date.now();
  if (state.ui && now - (state.ui.lastSidebarToggleTs || 0) < 250) return;
  state.ui.lastSidebarToggleTs = now;
  toggleSidebar();
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
    if (conv.id === state.currentId) renderMessages();
  }
  function cancel() {
    input.removeEventListener('blur', commit);
    container.replaceChild(titleEl, input);
  }
}

// Edit current chat title inline
function bindTitleInlineEdit() {
  const cur = document.getElementById('chat-title');
  if (!cur) return;
  // Avoid duplicate listeners by cloning and replacing or checking a flag
  if (!cur._inlineBound) {
    cur.addEventListener('dblclick', () => startInlineTitleEdit());
    cur._inlineBound = true;
  }
  elChatTitle = cur;
}

function startInlineTitleEdit() {
  const conv = (state.conversationsStore.conversations || []).find(c => c.id === state.currentId);
  if (!conv) return;
  const currentTitle = document.getElementById('chat-title');
  if (!currentTitle) return;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'chat-title-edit';
  input.value = conv.title || '';
  const original = currentTitle.textContent;
  const parent = currentTitle.parentNode;
  parent.replaceChild(input, currentTitle);
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
    // rebind and refresh reference
    bindTitleInlineEdit();
  };
  const onBlur = () => finish(true);
  const onKey = (e) => {
    if (e.key === 'Enter') finish(true);
    if (e.key === 'Escape') finish(false);
  };
  input.addEventListener('blur', onBlur);
  input.addEventListener('keydown', onKey);
}

async function onExport(format, includeTs, includeFiles) {
  if (!state.currentId) return alert(t('label.noSelectedConversation'));
  try {
    const useTs = includeTs === undefined ? (!!state.settings?.ui?.exportIncludeTimestamp ?? true) : !!includeTs;
    const useFiles = includeFiles === undefined ? (!!state.settings?.ui?.exportIncludeAttachments ?? true) : !!includeFiles;
    const res = await window.api.exportConversation({ conversationId: state.currentId, format, includeTimestamp: useTs, includeAttachments: useFiles });
    if (res?.ok) {
      alert(t('label.exportSuccess', { path: res.path }));
    } else if (!res?.canceled) {
      alert(t('label.failure', { msg: res?.error || t('err.unknown') }));
    }
  } catch (e) {
    alert(t('label.failure', { msg: e.message }));
  }
}

async function onExportAll(format, includeTs, includeFiles) {
  try {
    const useTs = includeTs === undefined ? (!!state.settings?.ui?.exportIncludeTimestamp ?? true) : !!includeTs;
    const useFiles = includeFiles === undefined ? (!!state.settings?.ui?.exportIncludeAttachments ?? true) : !!includeFiles;
    const res = await window.api.exportAllConversations({ format, includeTimestamp: useTs, includeAttachments: useFiles });
    if (res?.ok) {
      alert(t('label.exportSuccess', { path: res.path }));
    } else if (!res?.canceled) {
      alert(t('label.failure', { msg: res?.error || t('err.unknown') }));
    }
  } catch (e) {
    alert(t('label.failure', { msg: e.message }));
  }
}

function toggleExportMenu() {
  if (!elExportDropdown) return;
  elExportDropdown.classList.toggle('hidden');
}
function hideExportMenu() {
  if (!elExportDropdown) return;
  elExportDropdown.classList.add('hidden');
}
