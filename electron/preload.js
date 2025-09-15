const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),

  // Conversations
  listConversations: () => ipcRenderer.invoke('conversations:list'),
  createConversation: (title) => ipcRenderer.invoke('conversations:create', title),
  renameConversation: (payload) => ipcRenderer.invoke('conversations:rename', payload),
  deleteConversation: (id) => ipcRenderer.invoke('conversations:delete', id),
  getConversation: (id) => ipcRenderer.invoke('conversations:get', id),
  appendMessage: (payload) => ipcRenderer.invoke('conversations:appendMessage', payload),
  sendMessage: (payload) => ipcRenderer.invoke('model:sendMessage', payload),
  summarizeToMemory: (payload) => ipcRenderer.invoke('conversations:summarizeToMemory', payload),
  updateMessage: (payload) => ipcRenderer.invoke('conversations:updateMessage', payload),
  deleteMessage: (payload) => ipcRenderer.invoke('conversations:deleteMessage', payload),

  // Memory
  listMemory: () => ipcRenderer.invoke('memory:list'),
  addMemory: (item) => ipcRenderer.invoke('memory:add', item),
  updateMemory: (item) => ipcRenderer.invoke('memory:update', item),
  deleteMemory: (id) => ipcRenderer.invoke('memory:delete', id),

  // Dialogs
  pickAvatar: () => ipcRenderer.invoke('dialog:pickAvatar'),
  pickImage: () => ipcRenderer.invoke('dialog:pickImage'),
  pickPdf: () => ipcRenderer.invoke('dialog:pickPdf'),

  // Files
  openPath: (path) => ipcRenderer.invoke('file:open', path),
  saveCopy: (path) => ipcRenderer.invoke('file:saveCopy', path),

  // Events
  onConversationsUpdated: (cb) => {
    ipcRenderer.on('data:conversations-updated', cb);
    return () => ipcRenderer.removeListener('data:conversations-updated', cb);
  },
  onOpenSettings: (cb) => {
    ipcRenderer.on('ui:openSettings', cb);
    return () => ipcRenderer.removeListener('ui:openSettings', cb);
  },
  onExpandSidebar: (cb) => {
    ipcRenderer.on('ui:expandSidebar', cb);
    return () => ipcRenderer.removeListener('ui:expandSidebar', cb);
  },
  onToggleSidebar: (cb) => {
    ipcRenderer.on('ui:toggleSidebar', cb);
    return () => ipcRenderer.removeListener('ui:toggleSidebar', cb);
  },

  // Diagnostics
  testApi: (settings) => ipcRenderer.invoke('api:test', settings),

  // Debug tools
  testNotify: () => ipcRenderer.invoke('debug:notify'),
  proactiveOnce: () => ipcRenderer.invoke('proactive:once'),
  proactiveStatus: () => ipcRenderer.invoke('proactive:status'),
  listLogs: (limit) => ipcRenderer.invoke('logs:list', limit),
  clearLogs: () => ipcRenderer.invoke('logs:clear'),
  migrateAttachments: () => ipcRenderer.invoke('attachments:migrate'),

  // UI state
  setCurrentConversation: (id) => ipcRenderer.invoke('ui:setCurrentConversation', id),
  applyVibrancy: (enabled) => ipcRenderer.invoke('ui:applyVibrancy', enabled),
  setMinWidth: (width) => ipcRenderer.invoke('ui:setMinWidth', width),

  // Export
  exportConversation: (payload) => ipcRenderer.invoke('conversations:export', payload),
  exportAllConversations: (payload) => ipcRenderer.invoke('conversations:exportAll', payload),
});
