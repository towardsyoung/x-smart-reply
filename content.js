// content.js - X 页面注入脚本
// 监听 DOM 变化，在回复框旁注入【智能回复】按钮

(function() {
  'use strict';

  let currentModal = null;
  let observerActive = false;

  // ==============================
  // DOM 工具函数
  // ==============================

  // 获取当前推文内容（详情页 or 当前查看的推文）
  function getTweetContent() {
    // 优先从 URL 参数对应的推文获取
    // 在详情页，第一个 [data-testid="tweetText"] 即为主推文
    const tweetTexts = document.querySelectorAll('[data-testid="tweetText"]');
    if (tweetTexts.length > 0) {
      // 获取第一个推文（详情页的主推文）
      return tweetTexts[0].innerText.trim();
    }
    return null;
  }

  // 获取当前回复框所属的推文（用于 inline 回复）
  function getTweetContentNear(replyBox) {
    // 向上查找最近的 article 或 tweet 容器
    let el = replyBox;
    while (el) {
      // 查找同级或父级推文文本
      const article = el.closest('article');
      if (article) {
        const text = article.querySelector('[data-testid="tweetText"]');
        if (text) return text.innerText.trim();
      }
      el = el.parentElement;
    }
    // fallback：使用页面上第一条推文
    return getTweetContent();
  }

  // ==============================
  // 智能回复按钮注入
  // ==============================

  function injectSmartReplyButton(toolbarEl) {
    // 避免重复注入
    if (toolbarEl.querySelector('.xsr-btn')) return;

    const btn = document.createElement('button');
    btn.className = 'xsr-btn';
    btn.setAttribute('data-xsr-injected', 'true');
    btn.innerHTML = `<span class="xsr-btn-icon">✨</span><span>智能回复</span>`;
    btn.title = '使用 AI 生成智能回复';

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      // 找到当前工具栏对应的回复框
      const replyBox = findReplyBoxNear(toolbarEl);
      const tweetContent = getTweetContentNear(toolbarEl);

      openSmartReplyModal(tweetContent, replyBox);
    });

    // 插入到工具栏末尾（回复按钮之前）
    toolbarEl.appendChild(btn);
  }

  // 找到工具栏附近的回复输入框
  function findReplyBoxNear(toolbarEl) {
    // X 的回复框通常在工具栏的父容器中
    const container = toolbarEl.closest('[data-testid="toolBar"]')?.parentElement
      || toolbarEl.parentElement;

    if (container) {
      // 查找 contenteditable div（X 的新版编辑器）
      const editor = container.querySelector('[data-testid="tweetTextarea_0"]')
        || container.closest('form, [role="dialog"]')?.querySelector('[data-testid="tweetTextarea_0"]')
        || document.querySelector('[data-testid="tweetTextarea_0"]');
      return editor;
    }

    return document.querySelector('[data-testid="tweetTextarea_0"]');
  }

  // ==============================
  // 弹窗逻辑
  // ==============================

  function openSmartReplyModal(tweetContent, replyBox) {
    // 关闭已有弹窗
    if (currentModal) closeModal();

    const overlay = document.createElement('div');
    overlay.className = 'xsr-overlay';

    const modal = document.createElement('div');
    modal.className = 'xsr-modal';

    // 头部
    const header = `
      <div class="xsr-modal-header">
        <div class="xsr-modal-title">智能回复生成</div>
        <button class="xsr-close-btn" id="xsr-close">✕</button>
      </div>
    `;

    // 推文预览
    const preview = tweetContent ? `
      <div class="xsr-tweet-preview">
        <div class="xsr-tweet-label">📌 正在回复的推文</div>
        <div class="xsr-tweet-text">${escapeHtml(tweetContent)}</div>
      </div>
    ` : '';

    // 初始为加载状态
    modal.innerHTML = header + preview + `
      <div class="xsr-loading" id="xsr-loading">
        <div class="xsr-spinner"></div>
        <div class="xsr-loading-text">AI 正在构思有共鸣的回复...</div>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    currentModal = overlay;

    // 关闭按钮
    modal.querySelector('#xsr-close').addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });
    document.addEventListener('keydown', handleEscape);

    // 调用 API 生成回复
    generateReplies(tweetContent, modal, replyBox);
  }

  function closeModal() {
    if (currentModal) {
      currentModal.remove();
      currentModal = null;
      document.removeEventListener('keydown', handleEscape);
    }
  }

  function handleEscape(e) {
    if (e.key === 'Escape') closeModal();
  }

  // 渲染回复列表
  function renderReplies(replies, modal, replyBox) {
    const loading = modal.querySelector('#xsr-loading');
    if (loading) loading.remove();

    const listHtml = replies.map((reply, idx) => `
      <div class="xsr-reply-card" data-idx="${idx}">
        <div class="xsr-reply-text" contenteditable="true" data-idx="${idx}">${escapeHtml(reply)}</div>
        <div class="xsr-reply-actions">
          <span class="xsr-char-count">${reply.length} 字</span>
          <button class="xsr-use-btn" data-idx="${idx}">使用此回复 →</button>
        </div>
      </div>
    `).join('');

    const footer = `
      <div class="xsr-modal-footer">
        <label class="xsr-auto-submit">
          <input type="checkbox" id="xsr-auto-submit" />
          填充后自动提交
        </label>
        <button class="xsr-regenerate-btn" id="xsr-regenerate">
          🔄 重新生成
        </button>
      </div>
    `;

    const listContainer = document.createElement('div');
    listContainer.className = 'xsr-replies-list';
    listContainer.innerHTML = listHtml;
    modal.appendChild(listContainer);
    modal.insertAdjacentHTML('beforeend', footer);

    // 字数实时更新
    modal.querySelectorAll('.xsr-reply-text').forEach(el => {
      el.addEventListener('input', () => {
        const card = el.closest('.xsr-reply-card');
        const countEl = card.querySelector('.xsr-char-count');
        countEl.textContent = `${el.innerText.length} 字`;
      });
    });

    // 使用此回复
    modal.querySelectorAll('.xsr-use-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        const textEl = modal.querySelector(`.xsr-reply-text[data-idx="${idx}"]`);
        const replyText = textEl.innerText.trim();
        const autoSubmit = modal.querySelector('#xsr-auto-submit')?.checked;

        fillReplyBox(replyText, replyBox, autoSubmit);

        // 显示成功
        showSuccess(modal);
      });
    });

    // 重新生成
    modal.querySelector('#xsr-regenerate').addEventListener('click', () => {
      listContainer.remove();
      modal.querySelector('.xsr-modal-footer').remove();

      modal.insertAdjacentHTML('beforeend', `
        <div class="xsr-loading" id="xsr-loading">
          <div class="xsr-spinner"></div>
          <div class="xsr-loading-text">重新构思中...</div>
        </div>
      `);

      const tweetPreview = modal.querySelector('.xsr-tweet-preview .xsr-tweet-text');
      const tweetContent = tweetPreview?.innerText;
      generateReplies(tweetContent, modal, replyBox);
    });
  }

  // 调用 background.js 生成回复
  function generateReplies(tweetContent, modal, replyBox) {
    chrome.runtime.sendMessage(
      { action: 'generateReplies', tweetContent: tweetContent },
      (response) => {
        const loading = modal.querySelector('#xsr-loading');
        if (loading) loading.remove();

        if (chrome.runtime.lastError || !response) {
          showError(modal, '插件通信失败，请刷新页面重试。', null);
          return;
        }

        if (!response.success) {
          const isConfigError = response.error?.includes('API Key') || response.error?.includes('配置');
          showError(modal, response.error, isConfigError ? openSettings : null);
          return;
        }

        renderReplies(response.replies, modal, replyBox);
      }
    );
  }

  // 显示错误
  function showError(modal, message, actionFn) {
    const loading = modal.querySelector('#xsr-loading');
    if (loading) loading.remove();

    const errorDiv = document.createElement('div');
    errorDiv.className = 'xsr-error';
    errorDiv.innerHTML = `
      <div class="xsr-error-icon">⚠️</div>
      <div class="xsr-error-msg">${escapeHtml(message)}</div>
      ${actionFn ? '<span class="xsr-error-link" id="xsr-err-action">前往设置页面 →</span>' : ''}
    `;
    modal.appendChild(errorDiv);

    if (actionFn) {
      errorDiv.querySelector('#xsr-err-action')?.addEventListener('click', actionFn);
    }
  }

  // 显示成功填充
  function showSuccess(modal) {
    const list = modal.querySelector('.xsr-replies-list');
    const footer = modal.querySelector('.xsr-modal-footer');
    if (list) list.remove();
    if (footer) footer.remove();

    modal.insertAdjacentHTML('beforeend', `
      <div class="xsr-fill-success">
        <div class="xsr-success-icon">✅</div>
        <div class="xsr-success-text">回复已填充到输入框！</div>
      </div>
    `);

    setTimeout(() => closeModal(), 1500);
  }

  // 打开设置页
  function openSettings() {
    chrome.runtime.sendMessage({ action: 'openSettings' });
  }

  // ==============================
  // 填充回复到 X 输入框
  // ==============================

  function fillReplyBox(text, replyBox, autoSubmit) {
    // 先找到回复框（可能在 modal 打开后发生变化）
    const editor = replyBox
      || document.querySelector('[data-testid="tweetTextarea_0"]')
      || document.querySelector('.public-DraftEditor-content')
      || document.querySelector('[contenteditable="true"][aria-label]');

    if (!editor) {
      alert('未找到回复输入框，请手动粘贴回复内容：\n\n' + text);
      return;
    }

    try {
      // 方法1：focus + execCommand（兼容 contenteditable）
      editor.focus();

      // 先选中全部内容再替换
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(editor);
      selection.removeAllRanges();
      selection.addRange(range);

      // 插入文本
      document.execCommand('insertText', false, text);

      // 触发 React/X 的输入事件
      const events = ['input', 'keydown', 'keyup', 'change'];
      events.forEach(eventType => {
        editor.dispatchEvent(new Event(eventType, { bubbles: true }));
      });

      // 方法2: 如果 execCommand 失效，使用 React internals
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLElement.prototype, 'innerHTML'
      )?.set;
      if (editor.innerText.trim() !== text && nativeInputValueSetter) {
        nativeInputValueSetter.call(editor, text);
        editor.dispatchEvent(new Event('input', { bubbles: true }));
      }

    } catch (e) {
      console.warn('[XSR] 填充失败，使用 clipboard 方案', e);
      // 降级：复制到剪贴板
      navigator.clipboard.writeText(text).then(() => {
        alert('已复制到剪贴板，请在回复框中按 Ctrl+V 粘贴！');
      });
      return;
    }

    // 自动提交
    if (autoSubmit) {
      setTimeout(() => {
        // 查找"回复"按钮
        const submitBtn = document.querySelector('[data-testid="tweetButtonInline"]')
          || document.querySelector('[data-testid="tweetButton"]')
          || [...document.querySelectorAll('[role="button"]')]
            .find(el => el.innerText?.trim() === '回复' || el.innerText?.trim() === 'Reply');

        if (submitBtn) {
          submitBtn.click();
        } else {
          console.warn('[XSR] 未找到提交按钮');
        }
      }, 600);
    }
  }

  // HTML 转义
  function escapeHtml(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ==============================
  // MutationObserver：监听 X SPA 路由变化
  // ==============================

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue;

        // 查找工具栏
        const toolbars = node.querySelectorAll
          ? [
              ...node.querySelectorAll('[data-testid="toolBar"]'),
              ...(node.matches('[data-testid="toolBar"]') ? [node] : [])
            ]
          : [];

        toolbars.forEach(tb => {
          // 延迟一帧确保 DOM 稳定
          setTimeout(() => injectSmartReplyButton(tb), 100);
        });
      }
    }
  });

  // 页面加载完成后启动
  function init() {
    if (observerActive) return;
    observerActive = true;

    // 首次扫描已存在的工具栏
    document.querySelectorAll('[data-testid="toolBar"]').forEach(tb => {
      injectSmartReplyButton(tb);
    });

    // 监听 DOM 变化
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    console.log('[X 智能回复] 插件已启动 ✨');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 页面 SPA 路由变化时重新扫描
  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      setTimeout(() => {
        document.querySelectorAll('[data-testid="toolBar"]').forEach(tb => {
          injectSmartReplyButton(tb);
        });
      }, 1000);
    }
  }).observe(document, { subtree: true, childList: true });

})();
