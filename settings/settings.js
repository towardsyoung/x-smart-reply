// settings.js - 设置页面逻辑

// 各提供商预设配置
const PROVIDER_PRESETS = {
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-5.2', 'gpt-5.1', 'gpt-5-mini', 'gpt-5-nano'],
    placeholder: 'sk-xxxxxxxxxxxxxxxx',
  },
  custom: {
    baseUrl: '',
    models: ['deepseek-chat', 'deepseek-reasoner', 'qwen-max-latest', 'qwen-plus-latest', 'qwen-turbo-latest'],
    placeholder: 'your-api-key',
  },
  gemini: {
    baseUrl: '',
    models: ['gemini-3.1-pro-preview', 'gemini-3-flash-preview', 'gemini-2.5-pro'],
    placeholder: 'AIzaxxxxxxxxxxxxxxxx',
  },
};

let currentProvider = 'openai';

// ==============================
// 初始化
// ==============================
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  setupEventListeners();
});

async function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['llmConfig'], (result) => {
      const config = result.llmConfig || {};

      // 恢复提供商
      if (config.provider) {
        currentProvider = config.provider;
        updateProviderUI(currentProvider);
      }

      // 恢复字段值
      if (config.baseUrl) document.getElementById('base-url').value = config.baseUrl;
      if (config.apiKey) document.getElementById('api-key').value = config.apiKey;
      if (config.model) document.getElementById('model-name').value = config.model;
      if (config.replyLanguage) document.getElementById('reply-language').value = config.replyLanguage;
      if (config.replyCount) document.getElementById('reply-count').value = config.replyCount;

      resolve();
    });
  });
}

// ==============================
// 事件绑定
// ==============================
function setupEventListeners() {
  // 提供商切换
  document.querySelectorAll('.provider-card').forEach(card => {
    card.addEventListener('click', () => {
      currentProvider = card.dataset.provider;
      updateProviderUI(currentProvider);
    });
  });

  // API Key 显示切换
  document.getElementById('toggle-key').addEventListener('click', () => {
    const input = document.getElementById('api-key');
    const btn = document.getElementById('toggle-key');
    if (input.type === 'password') {
      input.type = 'text';
      btn.textContent = '🔒';
    } else {
      input.type = 'password';
      btn.textContent = '👁';
    }
  });

  // 模型预设点击
  document.getElementById('model-presets').addEventListener('click', (e) => {
    if (e.target.classList.contains('model-preset-tag')) {
      document.getElementById('model-name').value = e.target.dataset.model;
    }
  });

  // 测试连接
  document.getElementById('test-connection').addEventListener('click', testConnection);

  // 保存
  document.getElementById('save-btn').addEventListener('click', saveSettings);
}

// ==============================
// 提供商切换 UI
// ==============================
function updateProviderUI(provider) {
  // 更新选中状态
  document.querySelectorAll('.provider-card').forEach(card => {
    card.classList.toggle('active', card.dataset.provider === provider);
  });

  const preset = PROVIDER_PRESETS[provider];

  // 显示/隐藏自定义 Base URL
  const baseurlGroup = document.getElementById('baseurl-group');
  if (provider === 'custom') {
    baseurlGroup.style.display = 'block';
  } else {
    baseurlGroup.style.display = 'none';
    if (provider !== 'custom') {
      document.getElementById('base-url').value = preset.baseUrl;
    }
  }

  // 更新 placeholder
  document.getElementById('api-key').placeholder = preset.placeholder;

  // 渲染模型预设标签
  const presetsContainer = document.getElementById('model-presets');
  presetsContainer.innerHTML = preset.models.map(m =>
    `<span class="model-preset-tag" data-model="${m}">${m}</span>`
  ).join('');

  // 默认填入第一个模型（如果当前为空）
  const modelInput = document.getElementById('model-name');
  if (!modelInput.value) {
    modelInput.value = preset.models[0];
  }
}

// ==============================
// 收集配置
// ==============================
function collectConfig() {
  const preset = PROVIDER_PRESETS[currentProvider];
  const baseUrl = currentProvider === 'custom'
    ? document.getElementById('base-url').value.trim()
    : preset.baseUrl;

  return {
    provider: currentProvider,
    baseUrl: baseUrl,
    apiKey: document.getElementById('api-key').value.trim(),
    model: document.getElementById('model-name').value.trim(),
    replyLanguage: document.getElementById('reply-language').value,
    replyCount: parseInt(document.getElementById('reply-count').value),
  };
}

// ==============================
// 保存设置
// ==============================
function saveSettings() {
  const config = collectConfig();

  if (!config.apiKey) {
    showSaveStatus('⚠️ 请填写 API Key', false);
    return;
  }
  if (!config.model) {
    showSaveStatus('⚠️ 请填写模型名称', false);
    return;
  }
  if (currentProvider === 'custom' && !config.baseUrl) {
    showSaveStatus('⚠️ 请填写 API Base URL', false);
    return;
  }

  chrome.storage.local.set({ llmConfig: config }, () => {
    showSaveStatus('✅ 设置已保存', true);
  });
}

function showSaveStatus(message, isSuccess) {
  const el = document.getElementById('save-status');
  el.textContent = message;
  el.className = 'save-status' + (isSuccess ? ' saved' : '');
  setTimeout(() => { el.textContent = ''; el.className = 'save-status'; }, 3000);
}

// ==============================
// 测试连接
// ==============================
async function testConnection() {
  const config = collectConfig();
  const resultEl = document.getElementById('test-result');
  const btn = document.getElementById('test-connection');

  if (!config.apiKey) {
    resultEl.textContent = '⚠️ 请先填写 API Key';
    resultEl.className = 'test-result error';
    return;
  }

  resultEl.textContent = '⏳ 正在测试连接，请稍候...';
  resultEl.className = 'test-result loading';
  btn.disabled = true;

  chrome.runtime.sendMessage(
    { action: 'testConnection', config },
    (response) => {
      btn.disabled = false;
      if (chrome.runtime.lastError) {
        resultEl.textContent = `❌ 插件通信错误：${chrome.runtime.lastError.message}`;
        resultEl.className = 'test-result error';
        return;
      }
      if (response?.success) {
        resultEl.textContent = `✅ ${response.result}`;
        resultEl.className = 'test-result success';
      } else {
        resultEl.textContent = `❌ ${response?.error || '未知错误'}`;
        resultEl.className = 'test-result error';
      }
    }
  );
}
