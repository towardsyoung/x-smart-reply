// background.js - Service Worker
// 处理 LLM API 调用，避免 CORS 问题

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // 首次安装，打开设置页面
    chrome.tabs.create({ url: chrome.runtime.getURL('settings/settings.html') });
  }
});

// 点击插件图标 → 打开设置页
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('settings/settings.html') });
});

// 处理来自 content.js 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'generateReplies') {
    generateReplies(request.tweetContent, request.config)
      .then(replies => sendResponse({ success: true, replies }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // 保持异步通道
  }

  if (request.action === 'testConnection') {
    testConnection(request.config)
      .then(result => sendResponse({ success: true, result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === 'openSettings') {
    chrome.tabs.create({ url: chrome.runtime.getURL('settings/settings.html') });
    sendResponse({ success: true });
  }
});

// 获取存储的配置
async function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['llmConfig'], (result) => {
      resolve(result.llmConfig || {});
    });
  });
}

// 构建 System Prompt
function buildSystemPrompt(config) {
  const count = config.replyCount || 3;
  const langInstruction = config.replyLanguage === 'zh'
    ? '回复必须使用中文。'
    : config.replyLanguage === 'en'
    ? 'Replies must be in English.'
    : '回复语言与原推文保持一致。';

  return `You are a social media engagement expert specializing in creating authentic, resonant replies on X (Twitter).

Your task: Generate ${count} engaging replies to the given tweet.

Requirements:
1. Each reply should feel natural and human-written, not AI-generated
2. Use varied angles: agreement/validation, adding perspective, asking genuine questions, sharing similar experiences, or witty observations
3. Keep replies concise (under 200 characters when possible) and punchy
4. Avoid generic praise like "Great point!" or marketing language
5. Make each reply distinct in tone and approach
6. ${langInstruction}

Return ONLY a valid JSON object in this exact format, no other text:
{"replies": ["Reply one here", "Reply two here", "Reply three here"]}`;
}

// 调用 OpenAI 兼容 API
async function callOpenAICompatible(tweetContent, config) {
  const baseUrl = (config.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = config.model || 'gpt-4o-mini';
  const apiKey = config.apiKey;

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: 'system', content: buildSystemPrompt(config) },
        { role: 'user', content: `Tweet content:\n${tweetContent}` }
      ],
      temperature: 0.85,
      max_tokens: 800,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`API 请求失败 (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error('API 返回内容为空');

  return parseRepliesFromText(content);
}

// 从 LLM 返回文本中健壮地解析回复列表
function parseRepliesFromText(content) {
  // 1. 直接 JSON.parse
  try {
    const obj = JSON.parse(content);
    if (obj && obj.replies && Array.isArray(obj.replies)) return obj.replies.filter(r => typeof r === 'string' && r.length > 0);
    if (Array.isArray(obj)) return obj.filter(r => typeof r === 'string' && r.length > 0);
  } catch (_) {}

  // 2. 修复 trailing comma 后再解析（Gemini 偶发末尾逗号问题）
  try {
    const fixed = content.replace(/,(\s*[}\]])/g, '$1');
    const obj = JSON.parse(fixed);
    if (obj && obj.replies && Array.isArray(obj.replies)) return obj.replies.filter(r => typeof r === 'string' && r.length > 0);
    if (Array.isArray(obj)) return obj.filter(r => typeof r === 'string' && r.length > 0);
  } catch (_) {}

  // 3. 提取 JSON 数组片段
  const arrMatch = content.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try {
      const fixed = arrMatch[0].replace(/,(\s*\])/g, '$1');
      const arr = JSON.parse(fixed);
      if (Array.isArray(arr)) return arr.filter(r => typeof r === 'string' && r.length > 0);
    } catch (_) {}
  }

  // 4. 提取 JSON 对象片段（应对 "replies": [...] 前无花括号的情况）
  try {
    const wrapped = `{${content.match(/"replies"\s*:\s*\[[\s\S]*\]/)?.[0] || ''}}`;
    const obj = JSON.parse(wrapped.replace(/,(\s*\])/g, '$1'));
    if (obj.replies && Array.isArray(obj.replies)) return obj.replies.filter(r => typeof r === 'string' && r.length > 0);
  } catch (_) {}

  // 5. 提取所有双引号字符串，过滤掉 JSON 结构行（如 "replies": [ 等）
  const quoted = [];
  const re = /"((?:[^"\\]|\\.)*)"/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const s = m[1].replace(/\\"/g, '"').trim();
    // 跳过 JSON key（后跟冒号或方括号），以及过短的片段
    if (s.length > 10 && !/^replies$/.test(s) && !content.slice(m.index + m[0].length).trimStart().startsWith(':')) {
      quoted.push(s);
    }
  }
  if (quoted.length > 0) return quoted;

  // 6. 最终降级：按行分割
  const lines = content.split('\n')
    .map(l => l.replace(/^[\d\.\-\*、]+\s*/, '').replace(/^"|",?$|",?$/g, '').trim())
    .filter(l => l.length > 5 && !/"replies"\s*:/.test(l) && !/^\[/.test(l) && !/^\]/.test(l));
  if (lines.length > 0) return lines;

  throw new Error('API 返回格式错误，无法解析回复列表');
}

// 调用 Google Gemini API
async function callGemini(tweetContent, config) {
  const apiKey = config.apiKey;
  const model = config.model || 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const systemPrompt = buildSystemPrompt(config);
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: `${systemPrompt}\n\nTweet content:\n${tweetContent}`
        }]
      }],
      generationConfig: {
        temperature: 0.85,
        maxOutputTokens: 800,
        response_mime_type: 'application/json',  // 强制 JSON 输出
      }
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API 请求失败 (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!content) throw new Error('Gemini API 返回内容为空');

  return parseRepliesFromText(content);
}

// 主生成函数
async function generateReplies(tweetContent, config) {
  if (!config) config = await getConfig();
  if (!config.apiKey) throw new Error('请先在设置页面配置 API Key');

  if (config.provider === 'gemini') {
    return await callGemini(tweetContent, config);
  } else {
    return await callOpenAICompatible(tweetContent, config);
  }
}

// 测试连接
async function testConnection(config) {
  const testContent = 'Just had the best coffee of my life. ☕️';
  const replies = await generateReplies(testContent, config);
  if (!Array.isArray(replies) || replies.length === 0) {
    throw new Error('测试成功但返回格式异常');
  }
  return `连接成功！已生成 ${replies.length} 条测试回复。`;
}
