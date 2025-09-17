// Minimal i18n utility for the renderer process.
// Exposes: window.i18n (setLang, resolveLang, applyStatic, t) and window.t
// Usage: i18n.setLang(lang); i18n.applyStatic(); const s = t('key', {var:1});

(function () {
  const DICT = {
    'zh-CN': {
      'nav.memory': '记忆库',
      'nav.settings': '设置',
      'chat.loading': '加载中...',
      'chat.newChat': '新建对话',
      'chat.summarize': '记忆',
      'export.menu': '导出 ▾',
      'export.includeTs': '包含时间戳',
      'export.includeFiles': '包含附件',
      'export.currentJson': '导出当前（JSON）',
      'export.currentMd': '导出当前（Markdown）',
      'export.allJson': '导出全部（JSON）',
      'export.allMd': '导出全部（Markdown）',
      'chat.resizeHint': '拖动调整输入区高度',
      'chat.inputPlaceholder': '输入内容，按发送...',
      'chat.attachImage': '图片',
      'chat.attachPdf': 'PDF',
      'chat.addImage': '添加图片',
      'chat.addPdf': '添加PDF',
      'chat.send': '发送',
      'settings.title': '设置',
      'settings.persona': '人格设定（System Prompt）',
      'settings.api': 'API 配置',
      'settings.apiHistory': '上下文消息条数',
      'settings.apiSummaryHistory': '总结上下文条数',
      'settings.testApi': '测试 API',
      'settings.names': '角色',
      'settings.nameUser': '用户称呼',
      'settings.nameModel': '助手称呼',
      'settings.avatars': '头像',
      'settings.avatarUser': '我的头像',
      'settings.avatarAgent': '模型头像',
      'settings.chooseImage': '选择图片',
      'settings.proactive': '通知与主动联系',
      'settings.proactiveEnabled': '启用主动联系',
      'settings.proactiveInterval': '间隔（分钟）',
      'settings.notifProactive': '新消息显示系统通知',
      'settings.greetOnCreate': '新建对话时自动打招呼',
      'settings.sendTestNotif': '发送测试通知',
      'settings.runOnce': '立即检查一次',
      'settings.appearance': '外观',
      'settings.language': '界面语言',
      'settings.vibrancy': '启用毛玻璃（macOS）',
      'settings.vibrancyStrength': '半透明强度',
      'settings.vibrancySidebar': '侧栏半透明强度',
      'settings.vibrancyHint': '提示：较高强度更透明。轻度可读性更强。',
      'settings.debug': '调试与日志',
      'settings.logsRefresh': '刷新日志',
      'settings.logsClear': '清空日志',
      'settings.logsHint': '显示最近 200 条记录（包含 SKIP）',
      'common.save': '保存',
      'common.new': '新建',
      'common.delete': '删除',
      'common.cancel': '取消',
      'proactive.pinOnTitle': '已设为主动联系上下文，点击取消',
      'proactive.pinOffTitle': '设为主动联系上下文',
      'memory.title': '记忆库',
      'memory.titlePlaceholder': '标题',
      'memory.contentPlaceholder': '内容',
      'avatar.cropTitle': '裁剪头像',
      'avatar.cropAlt': '要裁剪的图片',
      'avatar.apply': '使用',
      'tip.pdfAttachment': '📄 PDF 附件',
      'tip.attachedPdf': '📄 已附加 PDF',
      'tip.copy': '复制',
      'tip.edit': '编辑',
      'tip.delete': '删除',
      'err.updateProactiveContext': '更新主动联系上下文失败：',
      'err.deleteFailed': '删除失败：',
      'err.sendFailed': '发送失败: ',
      'err.updateFailed': '更新失败',
      'err.editFailed': '编辑失败：',
      'err.newChatFailed': '新建对话失败：',
      'err.saveFailed': '保存失败：',
      'err.readFailed': '读取失败：',
      'err.statusFailed': '状态获取失败',
      'err.unknown': '未知错误',
      'confirm.deleteConv': '确定删除“{name}”吗？此操作不可撤销。',
      'confirm.deleteMsg': '确定删除该消息吗？',
      'confirm.deleteMem': '确定删除该记忆吗？',
      'confirm.summarize': '将当前对话的要点总结并加入记忆库？',
      'label.sidebar.expand': '展开会话列表',
      'label.sidebar.collapse': '收回会话列表',
      'label.testing': '测试中...',
      'label.success': '成功：{preview}',
      'label.emptyReply': '收到空响应',
      'label.failure': '失败：{msg}',
      'label.mem.defaultTitle': '记忆',
      'label.mem.saving': '保存中...',
      'label.mem.saved': '已保存 ✓',
      'label.testNotify.sending': '发送测试通知...',
      'label.testNotify.sent': '已发送通知（若未前台显示，请在系统设置中查看并允许）',
      'label.checkingNow': '立即检查中...',
      'label.checkDone': '检查完成：发送 {sent} 条 / 会话 {checked}',
      'label.disabled': '已关闭',
      'label.timerNotStarted': '计时未启动',
      'label.nextCheck': '下一次检查：{duration}',
      'label.noSelectedConversation': '没有选中的对话',
      'label.exportSuccess': '导出成功：\n{path}',
      'label.attachmentsMeta': '将发送 {n} 个附件',
      'label.clickToRemove': '点击单项移除',
      'label.clear': '清空',
      'label.pickImageFailed': '选择图片失败：',
      'label.pickPdfFailed': '选择 PDF 失败：',
    },
    'en-US': {
      'nav.memory': 'Memory',
      'nav.settings': 'Settings',
      'chat.loading': 'Loading...',
      'chat.newChat': 'New chat',
      'chat.summarize': 'Summarize',
      'export.menu': 'Export ▾',
      'export.includeTs': 'Include timestamp',
      'export.includeFiles': 'Include attachments',
      'export.currentJson': 'Export current (JSON)',
      'export.currentMd': 'Export current (Md)',
      'export.allJson': 'Export all (JSON)',
      'export.allMd': 'Export all (Md)',
      'chat.resizeHint': 'Drag to resize input',
      'chat.inputPlaceholder': 'Type your message…',
      'chat.attachImage': 'Image',
      'chat.attachPdf': 'PDF',
      'chat.addImage': 'Add image',
      'chat.addPdf': 'Add PDF',
      'chat.send': 'Send',
      'settings.title': 'Settings',
      'settings.persona': 'Persona (System Prompt)',
      'settings.api': 'API',
      'settings.apiHistory': 'History messages',
      'settings.apiSummaryHistory': 'Summary history messages',
      'settings.testApi': 'Test API',
      'settings.names': 'Characters',
      'settings.nameUser': 'You',
      'settings.nameModel': 'Assistant',
      'settings.avatars': 'Avatars',
      'settings.avatarUser': 'Your avatar',
      'settings.avatarAgent': 'Assistant avatar',
      'settings.chooseImage': 'Choose Image',
      'settings.proactive': 'Notifications & Proactive',
      'settings.proactiveEnabled': 'Enable proactive',
      'settings.proactiveInterval': 'Interval (minutes)',
      'settings.notifProactive': 'System notifications on new messages',
      'settings.greetOnCreate': 'Greet on new chat',
      'settings.sendTestNotif': 'Test notification',
      'settings.runOnce': 'Run once now',
      'settings.appearance': 'Appearance',
      'settings.language': 'Language',
      'settings.vibrancy': 'Enable vibrancy (macOS)',
      'settings.vibrancyStrength': 'Translucency strength',
      'settings.vibrancySidebar': 'Sidebar translucency',
      'settings.vibrancyHint': 'Tip: greater value = more transparent; lighter is more legible.',
      'settings.debug': 'Debug & Logs',
      'settings.logsRefresh': 'Refresh logs',
      'settings.logsClear': 'Clear logs',
      'settings.logsHint': 'Show latest 200 entries (incl. SKIP)',
      'common.save': 'Save',
      'common.new': 'New',
      'common.delete': 'Delete',
      'common.cancel': 'Cancel',
      'proactive.pinOnTitle': 'Pinned as proactive context; click to unpin',
      'proactive.pinOffTitle': 'Pin as proactive context',
      'memory.title': 'Memory',
      'memory.titlePlaceholder': 'Title',
      'memory.contentPlaceholder': 'Content',
      'avatar.cropTitle': 'Crop Avatar',
      'avatar.cropAlt': 'Image to crop',
      'avatar.apply': 'Apply',
      'tip.pdfAttachment': '📄 PDF attachment',
      'tip.attachedPdf': '📄 Attached PDF',
      'tip.copy': 'Copy',
      'tip.edit': 'Edit',
      'tip.delete': 'Delete',
      'err.updateProactiveContext': 'Failed to update proactive context: ',
      'err.deleteFailed': 'Delete failed: ',
      'err.sendFailed': 'Send failed: ',
      'err.updateFailed': 'Update failed',
      'err.editFailed': 'Edit failed: ',
      'err.newChatFailed': 'New chat failed: ',
      'err.saveFailed': 'Save failed: ',
      'err.readFailed': 'Read failed: ',
      'err.statusFailed': 'Status fetch failed',
      'err.unknown': 'Unknown error',
      'confirm.deleteConv': 'Delete "{name}"? This cannot be undone.',
      'confirm.deleteMsg': 'Delete this message?',
      'confirm.deleteMem': 'Delete this memory?',
      'confirm.summarize': 'Summarize current chat into memory?',
      'label.sidebar.expand': 'Show conversation list',
      'label.sidebar.collapse': 'Hide conversation list',
      'label.testing': 'Testing...',
      'label.success': 'Success: {preview}',
      'label.emptyReply': 'Empty reply',
      'label.failure': 'Failed: {msg}',
      'label.mem.defaultTitle': 'Memory',
      'label.mem.saving': 'Saving...',
      'label.mem.saved': 'Saved ✓',
      'label.testNotify.sending': 'Sending test notification...',
      'label.testNotify.sent': 'Notification sent (if not visible, check system settings).',
      'label.checkingNow': 'Checking now...',
      'label.checkDone': 'Done: sent {sent} / chats {checked}',
      'label.disabled': 'Disabled',
      'label.timerNotStarted': 'Timer not started',
      'label.nextCheck': 'Next check: {duration}',
      'label.noSelectedConversation': 'No conversation selected',
      'label.exportSuccess': 'Exported:\n{path}',
      'label.attachmentsMeta': 'Will send {n} attachment(s)',
      'label.clickToRemove': 'Click to remove',
      'label.clear': 'Clear',
      'label.pickImageFailed': 'Pick image failed: ',
      'label.pickPdfFailed': 'Pick PDF failed: ',
    },
  };

  let current = 'zh-CN';

  function resolveLang(pref) {
    const p = String(pref || '').trim();
    if (!p || p === 'system') {
      try {
        const list = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language];
        for (const l of (list || [])) { if (String(l).toLowerCase().startsWith('zh')) return 'zh-CN'; }
        return 'en-US';
      } catch { return 'zh-CN'; }
    }
    if (DICT[p]) return p;
    return 'zh-CN';
  }

  function setLang(lang) {
    current = DICT[lang] ? lang : 'zh-CN';
    try { document.documentElement.lang = current; } catch {}
  }

  function t(key, vars) {
    const dict = DICT[current] || DICT['zh-CN'];
    let s = dict[key] || DICT['zh-CN'][key] || key;
    if (vars && typeof vars === 'object') {
      for (const k of Object.keys(vars)) {
        s = s.replace(new RegExp('\\{' + k + '\\}', 'g'), String(vars[k]));
      }
    }
    return s;
  }

  function applyStatic() {
    try {
      document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n'); if (!key) return;
        const txt = t(key);
        const wantSpace = String(el.tagName || '').toUpperCase() === 'LABEL';
        let updated = false;
        const nodes = Array.from(el.childNodes || []);
        for (const n of nodes) {
          if (n.nodeType === Node.TEXT_NODE) {
            const cur = String(n.nodeValue || '');
            if (cur.trim().length > 0 && !updated) {
              n.nodeValue = wantSpace ? (txt + ' ') : txt;
              updated = true;
            }
          }
        }
        if (!updated) {
          // No non-empty text node found; prepend a new one
          el.insertBefore(document.createTextNode(wantSpace ? (txt + ' ') : txt), el.firstChild || null);
        }
      });
      document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title'); el.title = t(key); el.setAttribute('aria-label', t(key));
      });
      document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder'); el.placeholder = t(key);
      });
      document.querySelectorAll('[data-i18n-alt]').forEach(el => {
        const key = el.getAttribute('data-i18n-alt'); el.alt = t(key);
      });
      // Export dropdown header labels: keep input children intact
      const lblTs = document.getElementById('label-export-ts');
      if (lblTs) { try { lblTs.childNodes[0].nodeValue = t('export.includeTs') + ' '; } catch {} }
      const lblFiles = document.getElementById('label-export-files');
      if (lblFiles) { try { lblFiles.childNodes[0].nodeValue = t('export.includeFiles') + ' '; } catch {} }
    } catch {}
  }

  window.i18n = { setLang, resolveLang, applyStatic, t };
  window.t = t; // convenience global
})();
