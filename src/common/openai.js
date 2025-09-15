const fs = require('fs');

function safeBase(baseUrl) {
  if (!baseUrl) return 'https://api.openai.com';
  return baseUrl.replace(/\/$/, '');
}

function pickRecentMessages(messages, limit = 20) {
  return (messages || []).slice(-limit);
}

function isGeminiBase(baseUrl) {
  try {
    return typeof baseUrl === 'string' && baseUrl.includes('generativelanguage.googleapis.com');
  } catch { return false; }
}

function buildSystemPrompt(persona, memory) {
  const memItems = (memory?.items || []).slice(-5);
  const memText = memItems.length
    ? `\n\n[以下是你的记忆]\n注意：记忆是你作为第一人称记录的，记忆中的“我”代表你自己。\n${memItems.map(i => `- ${i.title}: \n${i.content}`).join('\n')}\n[结束记忆]\n\n[以下是对话内容]\n`
    : '';
  return `${persona || ''}${memText}`;
}

async function chatCompletions({ baseUrl, apiKey, body }) {
  const url = `${safeBase(baseUrl)}/v1/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey || ''}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API error ${res.status}: ${text}`);
  }
  const json = await res.json();
  return json;
}

async function geminiChatSend({ settings, history, message }) {
  let GoogleGenAI;
  try {
    const lib = require('@google/genai');
    GoogleGenAI = lib.GoogleGenAI || lib;
  } catch (e) {
    throw new Error('Gemini SDK 未安装。请执行: npm i @google/genai');
  }
  const apiKey = settings?.api?.apiKey;
  if (!apiKey) throw new Error('缺少 Gemini API Key');
  const ai = new GoogleGenAI({ apiKey });
  const model = settings?.api?.model || 'gemini-2.0-flash';
  const safetySettings = [
    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_NONE' }
  ];
  let text = '';
  const names = { user: (settings?.ui?.names?.user || 'User'), model: (settings?.ui?.names?.model || 'You') };
  for (const historyPart of history) {
    const label = historyPart.role === 'model' ? (names.model + ':') : (names.user + ':');
    text = text + `${label} ${historyPart.parts.map(p => p.text).join(' ')}\n`;
  }
  text = text + ('[对话内容结束]\nNote: ') + message + `\n你回复时不需要带上姓名和时间戳。只要回复你说的话即可。\n`;
  console.log('Gemini generate text:', { model, text });
  const resp = await ai.models.generateContent({ model, contents: text, config: { safetySettings: safetySettings } });
  console.log('Gemini response:', resp);
  const content = (resp && (resp.text || resp.output_text || '').toString().trim()) || '';
  return content;
}

async function geminiGenerateWithParts({ settings, parts }) {
  let GoogleGenAI;
  try {
    const lib = require('@google/genai');
    GoogleGenAI = lib.GoogleGenAI || lib;
  } catch (e) {
    throw new Error('Gemini SDK 未安装。请执行: npm i @google/genai');
  }
  const apiKey = settings?.api?.apiKey;
  if (!apiKey) throw new Error('缺少 Gemini API Key');
  const ai = new GoogleGenAI({ apiKey });
  const model = settings?.api?.model || 'gemini-2.5-flash';
  const safetySettings = [
    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_NONE' }
  ];
  console.log('Gemini generate parts:', { model, partsCount: (parts || []).length });
  const resp = await ai.models.generateContent({ model, contents: parts, config: { safetySettings } });
  console.log('Gemini response (parts):', resp);
  const content = (resp && (resp.text || resp.output_text || '').toString().trim()) || '';
  return content;
}

function detectMimeFromPath(p) {
  try {
    const lower = String(p || '').toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.gif')) return 'image/gif';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.bmp')) return 'image/bmp';
    if (lower.endsWith('.pdf')) return 'application/pdf';
    return 'application/octet-stream';
  } catch { return 'application/octet-stream'; }
}

async function callVision({ settings, conversation, memory, imagePath, imageMime, userText }) {
  if (!isGeminiBase(settings?.api?.baseUrl)) {
    throw new Error('当前 API Base 非 Gemini，暂不支持图片发送');
  }
  if (!imagePath) throw new Error('缺少图片路径');
  const mime = imageMime || detectMimeFromPath(imagePath);
  const b64 = fs.readFileSync(imagePath, { encoding: 'base64' });
  const persona = settings?.persona || '';
  const systemPrompt = buildSystemPrompt(persona, memory);
  const limit = Math.max(1, Math.min(500, Number(settings?.api?.historyMessages ?? 25)));
  const msgs = pickRecentMessages(conversation.messages, limit);
  const names = { user: (settings?.ui?.names?.user || 'User'), model: (settings?.ui?.names?.model || 'You') };
  let context = `SYSTEM:\n${systemPrompt}\n[以下是近期对话]\n`;
  for (const m of msgs) {
    const label = m.role === 'assistant' ? (names.model + ':') : (names.user + ':');
    const ts = m.timestamp ? `[${formatTs(m.timestamp)}] ` : '';
    context += `${label} ${ts}${m.content || ''}\n`;
  }
  context += '\n[对话结束]\n请参考以上背景信息，结合图片进行回答。';
  const parts = [
    { text: context },
    { inlineData: { mimeType: mime, data: b64 } },
    { text: (userText && userText.trim()) ? userText.trim() : '请描述这张图片。' },
  ];
  return await geminiGenerateWithParts({ settings, parts });
}

// Gemini: inline PDF analysis/summarization
async function callPdf({ settings, conversation, memory, pdfPath, userText }) {
  if (!isGeminiBase(settings?.api?.baseUrl)) {
    throw new Error('当前 API Base 非 Gemini，暂不支持 PDF 发送');
  }
  if (!pdfPath) throw new Error('缺少 PDF 路径');
  const mime = 'application/pdf';
  const b64 = fs.readFileSync(pdfPath, { encoding: 'base64' });
  const persona = settings?.persona || '';
  const systemPrompt = buildSystemPrompt(persona, memory);
  const limit = Math.max(1, Math.min(500, Number(settings?.api?.historyMessages ?? 25)));
  const msgs = pickRecentMessages(conversation.messages, limit);
  const names = { user: (settings?.ui?.names?.user || 'User'), model: (settings?.ui?.names?.model || 'You') };
  let context = `SYSTEM:\n${systemPrompt}\n[以下是近期对话]\n`;
  for (const m of msgs) {
    const label = m.role === 'assistant' ? (names.model + ':') : (names.user + ':');
    const ts = m.timestamp ? `[${formatTs(m.timestamp)}] ` : '';
    context += `${label} ${ts}${m.content || ''}\n`;
  }
  context += '\n[对话结束]\n请参考以上背景信息，结合文档进行回答。';
  const prompt = (userText && userText.trim()) ? userText.trim() : '请总结该 PDF 文档的要点，并给出关键结论。';
  const parts = [
    { text: context },
    { inlineData: { mimeType: mime, data: b64 } },
    { text: prompt },
  ];
  return await geminiGenerateWithParts({ settings, parts });
}

function formatTs(ts) {
  try { return new Date(ts).toLocaleString(); } catch { return ''; }
}

function toGeminiHistoryItem(msg) {
  const prefix = msg?.timestamp ? `[${formatTs(msg.timestamp)}] ` : '';
  return {
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: `${prefix}${msg.content || ''}` }],
  };
}

async function callChat({ settings, conversation, memory }) {
  const persona = settings?.persona || '';
  const systemPrompt = buildSystemPrompt(persona, memory);
  const limit = Math.max(1, Math.min(500, Number(settings?.api?.historyMessages ?? 25)));
  const msgs = pickRecentMessages(conversation.messages, limit);
  if (isGeminiBase(settings?.api?.baseUrl)) {
    // Build multimodal parts from conversation, including attachments
    const names = { user: (settings?.ui?.names?.user || 'User'), model: (settings?.ui?.names?.model || 'You') };
    const parts = [];
    parts.push({ text: `SYSTEM:\n${systemPrompt}` });
    for (const m of msgs) {
      const label = m.role === 'assistant' ? (names.model + ':') : (names.user + ':');
      const ts = m.timestamp ? `[${formatTs(m.timestamp)}] ` : '';
      const text = `${ts} ${label} ${m.content || ''}`.trim();
      if (text) parts.push({ text });
      // attachments array
      if (Array.isArray(m.attachments)) {
        for (const a of m.attachments) {
          try {
            const mime = a?.mime || detectMimeFromPath(a?.path || '');
            if (!a?.path) continue;
            const data = fs.readFileSync(a.path, { encoding: 'base64' });
            parts.push({ inlineData: { mimeType: mime, data } });
          } catch {}
        }
      }
      if (m.imagePath) {
        try {
          const mime = m.imageMime || detectMimeFromPath(m.imagePath);
          const data = fs.readFileSync(m.imagePath, { encoding: 'base64' });
          parts.push({ inlineData: { mimeType: mime, data } });
        } catch {}
      }
      if (m.pdfPath) {
        try {
          const data = fs.readFileSync(m.pdfPath, { encoding: 'base64' });
          parts.push({ inlineData: { mimeType: 'application/pdf', data } });
        } catch {}
      }
    }
    const latest = msgs[msgs.length - 1];
    const prompt = latest?.role === 'user' ? '[对话内容结束]\nNote: [请继续回复消息，你回复时不需要带上姓名和时间戳。只要回复你说的话即可。]' : '[对话内容结束]\nNote: [请继续你的上一条消息，你回复时不需要带上姓名和时间戳。只要回复你说的话即可。]\n';
    parts.push({ text: prompt });
    return await geminiGenerateWithParts({ settings, parts });
  } else {
    const names = { user: (settings?.ui?.names?.user || 'User'), model: (settings?.ui?.names?.model || 'You') };
    const messages = [
      { role: 'system', content: systemPrompt },
      ...msgs.map(m => ({
        role: m.role,
        content: `${m.timestamp ? `[${formatTs(m.timestamp)}] ` : ''}${m.role === 'assistant' ? (names.model + ': ') : (names.user + ': ')}${m.content}`,
      })),
    ];
    const body = {
      model: settings?.api?.model || 'gpt-4o-mini',
      messages,
      max_tokens: settings?.api?.maxTokens ?? 256,
      temperature: settings?.api?.temperature ?? 0.7,
      stream: false,
    };
    const json = await chatCompletions({ baseUrl: settings?.api?.baseUrl, apiKey: settings?.api?.apiKey, body });
    const content = json?.choices?.[0]?.message?.content?.trim() || '';
    return content;
  }
}

// Produce a greeting in a fresh conversation using only system prompt + memory
async function initialGreeting({ settings, memory }) {
  const persona = settings?.persona || '';
  const systemPrompt = buildSystemPrompt(persona, memory);
  const greet = `你需要向${settings?.ui?.names?.user || 'User'}发送一条打招呼的信息`;
  if (isGeminiBase(settings?.api?.baseUrl)) {
    const history = [ { role: 'user', parts: [{ text: `SYSTEM:\n${systemPrompt}` }] } ];
    return await geminiChatSend({ settings, history, message: greet });
  } else {
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: greet },
    ];
    const body = {
      model: settings?.api?.model || 'gpt-4o-mini',
      messages,
      max_tokens: settings?.api?.maxTokens ?? 256,
      temperature: settings?.api?.temperature ?? 0.7,
      stream: false,
    };
    const json = await chatCompletions({ baseUrl: settings?.api?.baseUrl, apiKey: settings?.api?.apiKey, body });
    return json?.choices?.[0]?.message?.content?.trim() || '';
  }
}

async function proactiveCheck({ settings, conversation, memory, now }) {
  const persona = settings?.persona || '';
  const systemPrompt = buildSystemPrompt(persona, memory);

  const limit = Math.max(1, Math.min(500, Number(settings?.api?.historyMessages ?? 20)));
  let content = '';
  if (isGeminiBase(settings?.api?.baseUrl)) {
    const recent = pickRecentMessages(conversation.messages, limit);
    const names = { user: (settings?.ui?.names?.user || 'User'), model: (settings?.ui?.names?.model || 'You') };
    const parts = [];
    parts.push({ text: `SYSTEM:\n${systemPrompt}\n[以下是近期对话]\n` });
    for (const m of recent) {
      const label = m.role === 'assistant' ? (names.model + ':') : (names.user + ':');
      const ts = m.timestamp ? `[${formatTs(m.timestamp)}] ` : '';
      const text = `${ts} ${label} ${m.content || ''}`.trim();
      if (text) parts.push({ text });
      if (Array.isArray(m.attachments)) {
        for (const a of m.attachments) {
          try {
            const mime = a?.mime || detectMimeFromPath(a?.path || '');
            if (!a?.path) continue;
            const data = fs.readFileSync(a.path, { encoding: 'base64' });
            parts.push({ inlineData: { mimeType: mime, data } });
          } catch {}
        }
      }
      if (m.imagePath) {
        try {
          const mime = m.imageMime || detectMimeFromPath(m.imagePath);
          const data = fs.readFileSync(m.imagePath, { encoding: 'base64' });
          parts.push({ inlineData: { mimeType: mime, data } });
        } catch {}
      }
      if (m.pdfPath) {
        try {
          const data = fs.readFileSync(m.pdfPath, { encoding: 'base64' });
          parts.push({ inlineData: { mimeType: 'application/pdf', data } });
        } catch {}
      }
    }
    let instruction = '[对话内容结束]\nNote:\n';
    if (recent.length <= 2) {
      instruction = `[提醒] 现在的时间是 ${typeof now === 'string' ? now : now.toLocaleString()} 如果你发现${settings?.ui?.names?.user || 'User'}一段时间没有回复你，你要主动给${settings?.ui?.names?.user || 'User'}发消息。如果你想主动联系${settings?.ui?.names?.user || 'User'}，也可以直接给${settings?.ui?.names?.user || 'User'}发消息。如果你决定不发信息，请回复 SKIP；若需要，请以 SEND: <消息> 格式输出。你回复时不需要带上姓名和时间戳。\n`;
    } else {
      instruction = `[提醒] 现在的时间是 ${typeof now === 'string' ? now : now.toLocaleString()} 。如果你想主动联系${settings?.ui?.names?.user || 'User'}，也可以直接给${settings?.ui?.names?.user || 'User'}发消息。如果你决定不发信息，请回复 SKIP；若需要，请以 SEND: <消息> 格式输出。你回复时不需要带上姓名和时间戳。\n`;
    }
    parts.push({ text: instruction });
    content = await geminiGenerateWithParts({ settings, parts });
  } else {
    const names = { user: (settings?.ui?.names?.user || 'User'), model: (settings?.ui?.names?.model || 'You') };
    const messages = [
      { role: 'system', content: systemPrompt },
      ...pickRecentMessages(conversation.messages, limit).map(m => ({
        role: m.role,
        content: `${m.timestamp ? `[${formatTs(m.timestamp)}] ` : ''}${m.role === 'assistant' ? (names.model + ': ') : (names.user + ': ')}${m.content}`,
      })),
      { role: 'user', content:
        `现在的时间是 ${typeof now === 'string' ? now : now.toLocaleString()} 。` +
        `如果你发现我一段时间没有回复你，你要主动给我发消息。如果你想主动联系我，也可以直接给我发消息。如果你决定不发信息，请回复 SKIP；若需要，请以 SEND: <消息> 格式输出，不要只回复SEND。`
      }
    ];
    const body = {
      model: settings?.api?.model || 'gpt-4o-mini',
      messages,
      max_tokens: Math.min(settings?.api?.maxTokens ?? 256, 180),
      temperature: settings?.api?.temperature ?? 0.7,
      stream: false,
    };
    const json = await chatCompletions({ baseUrl: settings?.api?.baseUrl, apiKey: settings?.api?.apiKey, body });
    content = json?.choices?.[0]?.message?.content?.trim() || '';
  }
  console.log('Proactive check result:', content);
  if (!content) return { action: 'SKIP', raw: '' };
  if (content.toUpperCase().startsWith('SKIP')) return { action: 'SKIP', raw: content };
  if (content.toUpperCase().startsWith('SEND:')) {
    return { action: 'SEND', message: content.slice(content.indexOf(':') + 1).trim(), raw: content };
  }
  return { action: 'SEND', message: content, raw: content };
}

async function summarizeConversation({ settings, conversation }) {
  const systemPrompt = '请将以上对话要点总结为简洁的记忆条目，突出人物偏好、性格、计划、提醒点、长期目标或高频提及的信息，输出中文，尽量简洁。记忆条目以' + settings?.ui?.names?.model || '你' + '作为第一人称来写。记忆中的“我”代表' + settings?.ui?.names?.model || '你' + '”，记忆中的“你”代表' + settings?.ui?.names?.user || '用户' + '。';
  const limit = Math.max(1, Math.min(1000, Number(settings?.api?.summaryHistoryMessages ?? 100)));
  if (isGeminiBase(settings?.api?.baseUrl)) {
    const recent = pickRecentMessages(conversation.messages, limit);
    const names = { user: (settings?.ui?.names?.user || 'User'), model: (settings?.ui?.names?.model || 'You') };
    const parts = [];
    parts.push({ text: 'SYSTEM:\n' + systemPrompt + '\n[以下为对话内容，包含可能的图片和 PDF 附件]\n' });
    for (const m of recent) {
      const label = m.role === 'assistant' ? (names.model + ':') : (names.user + ':');
      const ts = m.timestamp ? `[${formatTs(m.timestamp)}] ` : '';
      const text = `${label} ${ts}${m.content || ''}`.trim();
      if (text) parts.push({ text });
      // Inline attachments if present
      if (Array.isArray(m.attachments)) {
        for (const a of m.attachments) {
          try {
            const mime = a?.mime || detectMimeFromPath(a?.path || '');
            if (!a?.path) continue;
            const data = fs.readFileSync(a.path, { encoding: 'base64' });
            parts.push({ inlineData: { mimeType: mime, data } });
          } catch (e) { /* ignore read errors */ }
        }
      }
      if (m.imagePath) {
        try {
          const mime = m.imageMime || detectMimeFromPath(m.imagePath);
          const data = fs.readFileSync(m.imagePath, { encoding: 'base64' });
          parts.push({ inlineData: { mimeType: mime, data } });
        } catch (e) { /* ignore read errors */ }
      }
      if (m.pdfPath) {
        try {
          const data = fs.readFileSync(m.pdfPath, { encoding: 'base64' });
          parts.push({ inlineData: { mimeType: 'application/pdf', data } });
        } catch (e) { /* ignore read errors */ }
      }
    }
    // Ask to produce final summary
    parts.push({ text: '请基于以上对话文本与附件，输出记忆条目。' });
    return await geminiGenerateWithParts({ settings, parts });
  } else {
    const names = { user: (settings?.ui?.names?.user || 'User'), model: (settings?.ui?.names?.model || 'You') };
    const messages = [
      { role: 'system', content: systemPrompt },
      ...pickRecentMessages(conversation.messages, limit).map(m => ({
        role: m.role,
        content: `${m.timestamp ? `[${formatTs(m.timestamp)}] ` : ''}${m.role === 'assistant' ? (names.model + ': ') : (names.user + ': ')}${m.content}`,
      })),
    ];
    const body = {
      model: settings?.api?.model || 'gpt-4o-mini',
      messages,
      max_tokens: 300,
      temperature: 0.5,
      stream: false,
    };
    const json = await chatCompletions({ baseUrl: settings?.api?.baseUrl, apiKey: settings?.api?.apiKey, body });
    const content = json?.choices?.[0]?.message?.content?.trim() || '';
    return content;
  }
}

async function testApi({ settings }) {
  if (isGeminiBase(settings?.api?.baseUrl)) {
    return await geminiChatSend({ settings, history: [], message: '你是一个诊断助手。请仅回复：OK' });
  } else {
    const messages = [
      { role: 'system', content: '你是一个诊断助手。请仅回复：OK' },
      { role: 'user', content: '测试连接与鉴权' },
    ];
    const body = {
      model: settings?.api?.model || 'gpt-4o-mini',
      messages,
      max_tokens: 5,
      temperature: 0,
      stream: false,
    };
    const json = await chatCompletions({ baseUrl: settings?.api?.baseUrl, apiKey: settings?.api?.apiKey, body });
    const content = json?.choices?.[0]?.message?.content?.trim() || '';
    return content;
  }
}

module.exports = { callChat, proactiveCheck, summarizeConversation, testApi, initialGreeting, callVision, callPdf };
