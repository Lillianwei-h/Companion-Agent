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
    ? `\n\n【你的记忆】\n${memItems.map(i => `- ${i.title}: \n${i.content}`).join('\n')}\n[结束记忆]\n[以下是对话内容]\n`
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
    { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
  ];
  let text = '';
  for (const historyPart of history) {
    console.log(`  [${historyPart.role}] ${historyPart.parts.map(p => p.text).join(' ')}`);
    text = text + `${historyPart.role === 'model' ? 'You:' : 'User:'} ${historyPart.parts.map(p => p.text).join(' ')}\n`;
  }
  if (message != "") {
    text = text + 'User: ' + message ;
  }
  // console.log('Gemini generate text:', { model, history, text });
  console.log('Gemini generate text:', { model, text });
  const resp = await ai.models.generateContent({ model, contents: text, config: { safetySettings } });
  const content = (resp && (resp.text || resp.output_text || '').toString().trim()) || '';
  return content;
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

async function geminiChatSend2({ settings, history, message }) {
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
    { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
  ];
  const chat = ai.chats.create({ model: model, history: history, config: { safetySettings: safetySettings } });
  // console.log('Gemini chat send:', { model, history, message });
  for (const historyPart of history) {
    console.log(`  [${historyPart.role}] ${historyPart.parts.map(p => p.text).join(' ')}`);
  }
  // message = message + '你的回答不要包含任何时间戳等多余信息。';
  const resp = await chat.sendMessage({ message });
  console.log('Gemini response:', resp);
  const textResp = (resp && (resp.text || resp.output_text || '').toString().trim()) || '';
  return textResp;
}

async function callChat({ settings, conversation, memory }) {
  const persona = settings?.persona || '';
  const systemPrompt = buildSystemPrompt(persona, memory);
  const limit = Math.max(1, Math.min(500, Number(settings?.api?.historyMessages ?? 25)));
  const msgs = pickRecentMessages(conversation.messages, limit);
  if (isGeminiBase(settings?.api?.baseUrl)) {
    const latest = msgs[msgs.length - 1];
    const history = [
      { role: 'user', parts: [{ text: `SYSTEM:\n${systemPrompt}` }] },
      ...msgs.map(toGeminiHistoryItem),
    ];
    const prompt = latest?.role === 'user' ? '' : '请继续';
    return await geminiChatSend({ settings, history, message: prompt });
  } else {
    const messages = [ { role: 'system', content: systemPrompt }, ...msgs ];
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

async function proactiveCheck({ settings, conversation, memory, now }) {
  const persona = settings?.persona || '';
  const systemPrompt = buildSystemPrompt(persona, memory);

  const limit = Math.max(1, Math.min(500, Number(settings?.api?.historyMessages ?? 20)));
  let content = '';
  if (isGeminiBase(settings?.api?.baseUrl)) {
    const recent = pickRecentMessages(conversation.messages, limit);
    const history = [
      { role: 'user', parts: [{ text: `SYSTEM:\n${systemPrompt}` }] },
      ...recent.map(toGeminiHistoryItem),
    ];
    const instruction = `现在的时间是 ${typeof now === 'string' ? now : now.toLocaleString()} 如果你发现我一段时间没有回复你，你要主动给我发消息。如果你想主动联系我，也可以直接给我发消息。如果你决定不发信息，请回复 SKIP；若需要，请以 SEND: <消息> 格式输出。`;
    content = await geminiChatSend({ settings, history, message: instruction });
  } else {
    const messages = [
      { role: 'system', content: systemPrompt },
      ...pickRecentMessages(conversation.messages, limit).map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content:
        `现在的时间是 ${typeof now === 'string' ? now : now.toLocaleString()} 。` +
        `如果你发现我一段时间没有回复你，你要主动给我发消息。如果你想主动联系我，也可以直接给我发消息。如果你决定不发信息，请回复 SKIP；若需要，请以 SEND: <消息> 格式输出。`
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
  const systemPrompt = '请将以下对话要点总结为简洁的记忆条目，突出人物偏好、性格、计划、提醒点、长期目标或高频提及的信息，输出中文，尽量简洁。';
  const limit = Math.max(1, Math.min(1000, Number(settings?.api?.summaryHistoryMessages ?? 100)));
  if (isGeminiBase(settings?.api?.baseUrl)) {
    const recent = pickRecentMessages(conversation.messages, limit);
    const history = recent.map(toGeminiHistoryItem);
    return await geminiChatSend({ settings, history, message: systemPrompt });
  } else {
    const messages = [
      { role: 'system', content: systemPrompt },
      ...pickRecentMessages(conversation.messages, limit).map(m => ({ role: m.role, content: m.content }))
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

module.exports = { callChat, proactiveCheck, summarizeConversation, testApi };
