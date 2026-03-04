# X 智能回复 Chrome 插件

> 基于 AI 的 X (Twitter) 平台推文智能回复生成工具。

## ✨ 功能特性

- **一键生成**：点击回复框旁的【✨ 智能回复】按钮，AI 自动分析推文生成多条回复
- **多角度回复**：包含赞同、补充、提问、分享经历等不同互动角度
- **可编辑**：生成后可直接在界面中修改回复内容
- **一键填充**：选择回复后自动填充到 X 的回复输入框
- **自动提交**（可选）：支持填充后自动点击提交按钮
- **多 LLM 支持**：OpenAI、DeepSeek、Qwen、Google Gemini 等

## 🚀 安装方法

### 开发者模式加载

1. 打开 Chrome 浏览器，在地址栏输入 `chrome://extensions/`
2. 右上角开启**开发者模式**
3. 点击**加载已解压的扩展程序**
4. 选择本项目的 `x-smart-reply/` 目录
5. 插件自动打开设置页面，完成 API 配置后即可使用

## ⚙️ 配置说明

### 支持的 LLM 提供商

| 提供商 | 推荐模型 | Base URL |
|--------|----------|----------|
| OpenAI | `gpt-4o-mini` | `https://api.openai.com/v1` |
| DeepSeek | `deepseek-chat` | `https://api.deepseek.com/v1` |
| 阿里云百炼 | `qwen-plus` | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| Google Gemini | `gemini-3-flash-preview` | （内置） |

### 自定义接口

任何兼容 OpenAI Chat Completions 格式的接口均可使用，在设置页选择「自定义接口」并填写 Base URL 即可。

## 🗂️ 项目结构

```
x-smart-reply/
├── manifest.json        # Chrome MV3 配置
├── background.js        # Service Worker（API 调用）
├── content.js           # 页面注入脚本
├── content.css          # 注入样式
├── settings/
│   ├── settings.html    # 设置页面
│   ├── settings.js      # 设置逻辑
│   └── settings.css     # 设置样式
└── icons/               # 插件图标
```

## 🔒 隐私说明

- API Key 仅存储在本地 (`chrome.storage.local`)，不会传输到任何第三方服务器
- 推文内容仅在用户主动点击【智能回复】时才会发送给 AI 服务
