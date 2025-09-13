function safeBase(baseUrl) {
  if (!baseUrl) return 'https://api.openai.com';
  return baseUrl.replace(/\/$/, '');
}

function pickRecentMessages(messages, limit = 20) {
  return (messages || []).slice(-limit);
}

function buildSystemPrompt(persona, memory) {
  const memItems = (memory?.items || []).slice(-5);
  const memText = memItems.length
    ? `\n\n【记忆库片段】\n${memItems.map(i => `- ${i.title}: ${i.content}`).join('\n')}`
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

async function callChat({ settings, conversation, memory }) {
  const persona = settings?.persona || '';
  const systemPrompt = buildSystemPrompt(persona, memory);
  const limit = Math.max(1, Math.min(500, Number(settings?.api?.historyMessages ?? 25)));
  const messages = [
    { role: 'system', content: systemPrompt },
    ...pickRecentMessages(conversation.messages, limit).map(m => ({ role: m.role, content: m.content }))
  ];

  const body = {
    model: settings?.api?.model || 'gpt-4o-mini',
    messages,
    max_tokens: settings?.api?.maxTokens ?? 256,
    temperature: settings?.api?.temperature ?? 0.7,
    stream: false,
  };

  const json = await chatCompletions({
    baseUrl: settings?.api?.baseUrl,
    apiKey: settings?.api?.apiKey,
    body,
  });

  const content = json?.choices?.[0]?.message?.content?.trim() || '';
  return content;
}

async function proactiveCheck({ settings, conversation, memory, now }) {
  const persona = settings?.persona || '';
  const systemPrompt = buildSystemPrompt(persona, memory) +
    `\n\n【任务】你是一个主动型陪伴助手。当前时间: ${now}。请判断是否需要主动发消息。如果不需要，输出：SKIP。如果需要，输出：SEND: 你的消息内容。请只输出这两种之一。`;

  const limit = Math.max(1, Math.min(500, Number(settings?.api?.historyMessages ?? 20)));
  const messages = [
    { role: 'system', content: systemPrompt },
    ...pickRecentMessages(conversation.messages, limit).map(m => ({ role: m.role, content: m.content }))
  ];

  const body = {
    model: settings?.api?.model || 'gpt-4o-mini',
    messages,
    max_tokens: Math.min(settings?.api?.maxTokens ?? 256, 180),
    temperature: settings?.api?.temperature ?? 0.7,
    stream: false,
  };

  const json = await chatCompletions({
    baseUrl: settings?.api?.baseUrl,
    apiKey: settings?.api?.apiKey,
    body,
  });

  const content = json?.choices?.[0]?.message?.content?.trim() || '';
  if (!content) return { action: 'SKIP', raw: '' };
  if (content.toUpperCase().startsWith('SKIP')) return { action: 'SKIP', raw: content };
  if (content.toUpperCase().startsWith('SEND:')) {
    return { action: 'SEND', message: content.slice(content.indexOf(':') + 1).trim(), raw: content };
  }
  return { action: 'SEND', message: content, raw: content };
}

async function summarizeConversation({ settings, conversation }) {
  const systemPrompt = '请将以下对话要点总结为简洁的记忆条目，突出人物偏好、计划、提醒点、长期目标或高频提及的信息，输出中文，尽量简洁。';
  const limit = Math.max(1, Math.min(1000, Number(settings?.api?.summaryHistoryMessages ?? 100)));
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
  const json = await chatCompletions({
    baseUrl: settings?.api?.baseUrl,
    apiKey: settings?.api?.apiKey,
    body,
  });
  const content = json?.choices?.[0]?.message?.content?.trim() || '';
  return content;
}

async function testApi({ settings }) {
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
  const json = await chatCompletions({
    baseUrl: settings?.api?.baseUrl,
    apiKey: settings?.api?.apiKey,
    body,
  });
  const content = json?.choices?.[0]?.message?.content?.trim() || '';
  return content;
}

module.exports = { callChat, proactiveCheck, summarizeConversation, testApi };
