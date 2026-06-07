# b-note

一键总结 B 站视频，生成带时间戳的结构化 Markdown 笔记。

## 当前能力

- 在 B 站视频页检测当前视频信息。
- 读取 B 站自带 CC 字幕，优先选择中文字幕。
- 无 CC 字幕时自动尝试拉取 B 站音频，并调用 Whisper 兼容的 `/audio/transcriptions` 接口转写；音频地址、下载和转写请求会自动重试，音频下载会记录阶段性进度，并在运行记录中保留关键阶段日志。
- 可选接入长视频转写 Worker，由服务端使用 ffmpeg 分片/压缩音频后逐段转写，绕过浏览器侧 24MB 上传限制。
- 在配置面板提示当前 Base URL 是否可能不支持 Whisper 转写，并在失败时给出更具体的排查建议。
- 聊天总结服务和 Whisper 转写服务可分开配置，支持例如 DeepSeek 负责总结、OpenAI 或兼容网关负责转写。
- 提供速览、标准、详细三种总结模式，并在界面明确显示当前选中模式。
- 提供学习笔记、教程步骤、观点洞察、时间线四种笔记模板。
- 支持“一键生成”，自动完成字幕提取/Whisper 转写和 AI 总结。
- 支持识别多 P 视频，可在侧边栏切换指定分 P 后重新提取字幕，也可批量生成合集笔记，并自动生成全集综合总结和按主题索引。
- 支持长字幕分段总结与合并，降低长视频一次性请求失败的概率。
- 支持 OpenAI Chat Completions 兼容接口，可配置 DeepSeek、OpenAI、硅基流动、智谱、Kimi、Ollama 或自定义服务。
- 在浏览器侧边栏展示字幕预览、AI 总结结果、目录导航和可滚动阅读区，阅读区支持标题、列表、引用、表格、代码块、图片、链接和行内代码。
- 笔记里的时间戳可点击跳转到视频对应位置。
- 支持基于当前字幕和笔记继续追问视频内容。
- 支持手动截取当前视频画面，也支持按笔记时间戳自动抓取关键画面。
- 字幕会缓存到扩展本地存储，重复打开同一视频时优先复用缓存。
- 展示实际 token 用量，并可配置每百万 tokens 单价来估算费用。
- 生成结果后可复制 Markdown、下载 `.md` 文件、导出包含 Markdown 与关键画面的 ZIP 资料包、导出静态 HTML 分享页、发布到 Telegraph、发送到 Telegram、发送到自定义 Webhook、调用系统分享，或通过 `obsidian://new` 唤起 Obsidian 新建笔记。
- 导出的 Markdown 包含 YAML frontmatter、服务商/模型信息、总结模式、模板、token 用量、费用估算和关键画面。
- 可配置 Obsidian vault、保存文件夹、标签、额外 frontmatter 字段、frontmatter 字段映射和导出模板，并提供常用模板预设，默认保存到 `B站视频笔记`。
- API 和 Obsidian 设置保存到扩展 `storage.local`，并兼容迁移旧版 `localStorage` 配置。

## 使用方式

1. 安装依赖：

```bash
npm install
```

2. 启动开发模式：

```bash
npm run dev
```

3. 按 WXT 提示加载扩展，打开任意 B 站视频页。
4. 点击浏览器扩展按钮打开右侧面板。
5. 展开“API 配置”，选择服务商，填写 API Key、Base URL、聊天模型名、Whisper 模型名；无 CC 字幕视频可单独填写转写 Base URL/API Key，长视频可填写转写 Worker URL；还可填写 Obsidian vault/文件夹/标签/frontmatter/字段映射/模板、Telegram Bot Token/Chat ID、Webhook URL。
6. 如需费用估算，在“费用估算”里填写输入/输出每百万 tokens 单价和币种。
7. 选择总结模式和笔记模板，点击“一键生成”。
8. 生成后可点击时间戳回到视频位置，点击“截图”保存当前帧，或点击“自动帧”按笔记时间戳抓取关键画面。
9. 选择复制、导出 `.md`、导出资料包、导出 HTML、发布 Telegraph、发送 TG、Webhook、分享或保存到 Obsidian。

也可以先点击“提取字幕”检查字幕预览，再点击“AI 总结”分步生成。

## 脚本

```bash
npm run dev          # Chrome 开发模式
npm run dev:firefox  # Firefox 开发模式
npm run build        # 构建 Chrome MV3 扩展
npm run compile      # TypeScript 类型检查
npm test             # 运行核心逻辑回归测试
npm run preview:sidepanel # 构建并打开带 demo 数据的侧边栏预览
npm run transcription:worker # 启动可选长视频转写 Worker
npm run zip          # 打包扩展
```

## 本地预览

```bash
npm run preview:sidepanel
```

该命令会构建扩展并打开 `.output/chrome-mv3/sidepanel.html?demo=1`。预览页在没有扩展 `browser` API 的普通浏览器环境中会自动启用本地 fallback，加载一份示例笔记，用于检查阅读区、工具栏、目录、自动帧和分享入口是否正常渲染。

## 长视频转写 Worker

浏览器内转写仍保留 24MB 上传保护。需要处理更长视频时，可在本机或服务器启动可选 Worker：

```bash
brew install ffmpeg
TRANSCRIPTION_API_KEY=sk-xxx \
TRANSCRIPTION_BASE_URL=https://api.openai.com/v1 \
npm run transcription:worker
```

默认服务地址为 `http://127.0.0.1:8787/transcribe`。在扩展的“长视频转写 Worker URL”里填入该地址后，无 CC 字幕视频会把 B 站音频候选地址交给 Worker，由 Worker 下载音频、使用 ffmpeg 压缩/分片，再逐段调用 Whisper 兼容接口。常用环境变量：

- `TRANSCRIPTION_WORKER_PORT`：服务端口，默认 `8787`。
- `TRANSCRIPTION_BASE_URL`：Whisper 兼容接口 Base URL，默认 `https://api.openai.com/v1`。
- `TRANSCRIPTION_API_KEY` 或 `OPENAI_API_KEY`：转写服务 API Key。
- `TRANSCRIPTION_MODEL`：默认转写模型，默认 `whisper-1`。
- `TRANSCRIPTION_CHUNK_SECONDS`：每个分片秒数，默认 `600`。
- `TRANSCRIPTION_BITRATE`：压缩码率，默认 `32k`。
- `FFMPEG_BIN`：ffmpeg 可执行文件路径，默认 `ffmpeg`。

## 注意

- Anthropic 官方 API 不是 OpenAI Chat Completions 协议；如需使用 Claude，请填写兼容该协议的代理或网关。
- Ollama 默认使用 `http://localhost:11434/v1`，本地模型名需要与你本机部署一致。
- Whisper 降级依赖当前 Base URL 支持 OpenAI 风格的 `/audio/transcriptions`，例如 OpenAI 或兼容网关；DeepSeek 等纯聊天接口通常不支持。
- 浏览器内自动转写会下载 B 站音频流；超过 24MB 的音频需配置长视频转写 Worker，部分 CDN 也可能因防盗链导致下载失败。
- B 站字幕和音频接口依赖登录态、视频权限和网络环境，部分视频可能无法提取。
- Telegraph 发布会创建匿名 Telegraph 页面，并尝试上传关键画面；如图片上传失败，仍会发布文字笔记，需完整保留图片时可使用 HTML 或资料包导出。
- Telegram 发布使用 Bot API 发送消息，长笔记会自动拆成多条消息；如已抓取关键画面，会在正文后继续发送图片。需要自行创建 bot 并填写 Chat ID。
- Frontmatter 字段映射使用 `默认字段: 自定义字段` 的格式；值填 `-` 可隐藏该字段，例如 `url: source_url`、`keyframes: -`。
- Webhook 发布会发送 JSON，并在配置了 Secret 时附带 `X-B-Note-Secret` 请求头；payload 会包含标题、文件名、视频链接、Markdown、模式、模板、标签、frontmatter、token 用量、分段数和关键帧元数据，适合接入飞书、企业微信、Make/Zapier 或自建服务。
