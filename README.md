# b-note

b-note 是一个面向 B 站视频学习和资料整理的 Chrome 侧边栏扩展。它可以读取 B 站字幕，必要时调用 Whisper 兼容接口转写音频，再用 OpenAI Chat Completions 兼容模型生成带时间戳、关键画面和 YAML frontmatter 的结构化 Markdown 笔记。

它更像一个“视频到知识库”的小工作台：适合把教程、发布会、访谈、课程、长视频和多 P 合集整理成可搜索、可导出、可继续追问的笔记。生成结果可以复制、下载、打包、发布到 Telegraph/Telegram/Webhook，也可以写入 Obsidian。

## 适合谁

- 想把 B 站教程沉淀到 Obsidian、Notion、博客或本地 Markdown 的学习者。
- 需要快速浏览长视频、发布会、访谈重点的 AI/科技内容读者。
- 想批量整理多 P 合集，并生成全集索引和综合总结的重度收藏用户。
- 想自带模型、网关或本地 Ollama，而不是绑定单一 AI 服务商的用户。

## 它解决什么问题

普通视频总结工具经常只给一段摘要，后续很难复查。b-note 尝试把视频变成一份真正能长期使用的学习资料：

- 每个段落保留时间戳，点击即可跳回视频位置。
- 自动抓取关键画面，让笔记有视觉锚点。
- 按教程、观点、时间线、学习笔记等模板输出，而不是固定一种摘要风格。
- 长视频会分段总结再合并，降低一次性请求失败和上下文溢出的概率。
- 导出时保留 frontmatter、标签、来源、模型、token 用量等元数据，方便知识库管理。

## 当前能力

### 字幕与转写

- 在 B 站视频页检测当前视频信息。
- 读取 B 站自带 CC 字幕，优先选择中文字幕。
- 无 CC 字幕时自动尝试拉取 B 站音频，并调用 Whisper 兼容的 `/audio/transcriptions` 接口转写；音频地址、下载和转写请求会自动重试，音频下载会记录阶段性进度，并在运行记录中保留关键阶段日志。
- 可选接入长视频转写 Worker，由服务端使用 ffmpeg 分片/压缩音频后逐段转写，绕过浏览器侧 24MB 上传限制。
- 在配置面板提示当前 Base URL 是否可能不支持 Whisper 转写，并在失败时给出更具体的排查建议。
- 聊天总结服务和 Whisper 转写服务可分开配置，支持例如 DeepSeek 负责总结、OpenAI 或兼容网关负责转写。

### AI 笔记生成

- 提供速览、标准、详细三种总结模式，并在界面明确显示当前选中模式。
- 提供学习笔记、教程步骤、观点洞察、时间线四种笔记模板。
- 支持“一键生成”，自动完成字幕提取/Whisper 转写和 AI 总结。
- 支持识别多 P 视频，可在侧边栏切换指定分 P 后重新提取字幕，也可批量生成合集笔记，并自动生成全集综合总结和按主题索引。
- 支持长字幕分段总结与合并，降低长视频一次性请求失败的概率。
- 支持 OpenAI Chat Completions 兼容接口，可配置 DeepSeek、OpenAI、硅基流动、智谱、Kimi、Ollama 或自定义服务。

### 阅读与追问

- 在浏览器侧边栏展示字幕预览、AI 总结结果、目录导航和可滚动阅读区，阅读区支持标题、列表、引用、表格、代码块、图片、链接和行内代码。
- 笔记里的时间戳可点击跳转到视频对应位置。
- 支持基于当前字幕和笔记继续追问视频内容。
- 支持手动截取当前视频画面，也支持按笔记时间戳自动抓取关键画面。
- 字幕会缓存到扩展本地存储，重复打开同一视频时优先复用缓存。
- 展示实际 token 用量，并可配置每百万 tokens 单价来估算费用。

### 导出与发布

- 生成结果后可复制 Markdown、下载 `.md` 文件、导出包含 Markdown 与关键画面的 ZIP 资料包、导出静态 HTML 分享页、发布到 Telegraph、发送到 Telegram、发送到自定义 Webhook、调用系统分享，或通过 `obsidian://new` 唤起 Obsidian 新建笔记。
- 导出的 Markdown 包含 YAML frontmatter、服务商/模型信息、总结模式、模板、token 用量、费用估算和关键画面。
- 可配置 Obsidian vault、保存文件夹、标签、额外 frontmatter 字段、frontmatter 字段映射和导出模板，并提供常用模板预设，默认保存到 `B站视频笔记`。
- 支持 Obsidian Local REST API 写入长笔记和关键画面附件，避免 `obsidian://new` 处理长内容时不稳定。
- API 和 Obsidian 设置保存到扩展 `storage.local`，并兼容迁移旧版 `localStorage` 配置。

## 技术栈

- [WXT](https://wxt.dev/)：Chrome MV3 扩展开发框架。
- React 19：侧边栏交互界面。
- TypeScript：核心逻辑和类型约束。
- Tailwind CSS 4：界面样式。
- OpenAI Chat Completions 兼容协议：总结和追问。
- Whisper 兼容 `/audio/transcriptions`：无字幕视频转写。

## 项目结构

```text
entrypoints/
  background.ts              # 扩展后台入口
  content.ts                 # B 站页面内容脚本
  sidepanel/                 # React 侧边栏应用
src/lib/
  subtitle.ts                # 字幕提取
  transcriber.ts             # 音频转写
  summarizer.ts              # AI 总结和分段合并
  keyFrames.ts               # 关键画面抓取
  note.ts                    # Markdown / frontmatter 组装
  obsidian.ts                # Obsidian URI / REST 导出
  telegraph.ts               # Telegraph 发布
  telegram.ts                # Telegram 发布
  webhook.ts                 # 自定义 Webhook
scripts/
  transcription-worker.mjs   # 可选长视频转写 Worker
tests/
  regression.test.ts         # 核心逻辑回归测试
```

## 使用方式

### 开发运行

1. 克隆仓库并安装依赖：

```bash
git clone https://github.com/wulance/b-note.git
cd b-note
npm install
```

2. 启动 Chrome 开发模式：

```bash
npm run dev
```

3. 按 WXT 终端提示，在 Chrome 扩展管理页加载生成的开发扩展。
4. 打开任意 B 站视频页，点击扩展按钮打开右侧面板。

### 生产构建

```bash
npm run build
```

构建产物会输出到 `.output/chrome-mv3/`。该目录不会提交到 Git。

## 基本配置

首次打开侧边栏后，在“设置”里配置：

1. AI 服务商、Base URL、API Key 和聊天模型名。
2. 无字幕视频需要转写时，配置 Whisper 兼容接口；也可以让聊天和转写使用不同服务。
3. 选择总结模式和笔记模板。
4. 如需 Obsidian，配置 vault、目标文件夹、标签、frontmatter 映射和模板。
5. 如需发布，配置 Telegraph、Telegram 或 Webhook 相关选项。

每个 AI 服务商会单独保存自己的 Base URL、API Key 和模型名。比如 DeepSeek、Gemini、OpenRouter 可以分别填写不同 Key，切换服务商时会自动恢复该服务商上次保存的配置。
设置页的“获取模型”会尝试调用当前 Base URL 的 OpenAI 兼容 `/models` 接口，并把结果保存为该服务商自己的模型列表；如果服务商不支持该接口，可继续使用内置列表或手动填写自定义模型名。

典型 OpenAI 兼容配置：

```text
Base URL: https://api.openai.com/v1
Model: gpt-4.1-mini
```

内置的免费/低门槛预设：

| 服务商 | Base URL | 推荐模型 | 说明 |
| --- | --- | --- | --- |
| Gemini 免费层 | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-2.5-flash` | Google AI Studio 可创建 API Key，免费层有 RPM/RPD 限制，适合日常总结。 |
| OpenRouter 免费模型 | `https://openrouter.ai/api/v1` | `openrouter/free` | 自动路由到可用免费模型；免费模型会随平台容量变化。 |
| Groq 免费层 | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` | 速度快，免费层有速率限制，适合短视频和普通笔记。 |
| Cloudflare Workers AI 免费额度 | `https://api.cloudflare.com/client/v4/accounts/YOUR_ACCOUNT_ID/ai/v1` | `@cf/meta/llama-3.1-8b-instruct` | 需要把 `YOUR_ACCOUNT_ID` 换成自己的 Cloudflare Account ID，并填写 API Token。 |
| Ollama 本地 | `http://localhost:11434/v1` | `qwen3` | 不走云端 API，免费但依赖本机模型和硬件。 |

Ollama 本地模型示例：

```text
Base URL: http://localhost:11434/v1
Model: qwen2.5:7b
```

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

- b-note 是浏览器扩展，不是官方 B 站功能；字幕、音频和视频元信息能否获取取决于登录态、视频权限和 B 站接口变化。
- API Key 保存在扩展本地 `storage.local`。不要把本地配置、截图包或导出的私密笔记提交到公开仓库。
- Anthropic 官方 API 不是 OpenAI Chat Completions 协议；如需使用 Claude，请填写兼容该协议的代理或网关。
- Gemini、OpenRouter、Groq 和 Cloudflare Workers AI 虽有免费层或免费额度，但仍需要用户自己申请 API Key；不要把个人 Key 写进代码或公开仓库。
- OpenRouter 的 `openrouter/free` 会自动选择可用免费模型，输出质量和上下文长度可能随路由结果变化。
- Cloudflare Workers AI 的 Base URL 包含 Account ID，占位符 `YOUR_ACCOUNT_ID` 必须替换，否则 API 测试会失败。
- Ollama 默认使用 `http://localhost:11434/v1`，本地模型名需要与你本机部署一致。
- Whisper 降级依赖当前 Base URL 支持 OpenAI 风格的 `/audio/transcriptions`，例如 OpenAI 或兼容网关；DeepSeek 等纯聊天接口通常不支持。
- 浏览器内自动转写会下载 B 站音频流；超过 24MB 的音频需配置长视频转写 Worker，部分 CDN 也可能因防盗链导致下载失败。
- B 站字幕和音频接口依赖登录态、视频权限和网络环境，部分视频可能无法提取。
- Telegraph 发布会创建匿名 Telegraph 页面，并尝试上传关键画面；如图片上传失败，仍会发布文字笔记，需完整保留图片时可使用 HTML 或资料包导出。
- Telegram 发布使用 Bot API 发送消息，长笔记会自动拆成多条消息；如已抓取关键画面，会在正文后继续发送图片。需要自行创建 bot 并填写 Chat ID。
- Frontmatter 字段映射使用 `默认字段: 自定义字段` 的格式；值填 `-` 可隐藏该字段，例如 `url: source_url`、`keyframes: -`。
- Webhook 发布会发送 JSON，并在配置了 Secret 时附带 `X-B-Note-Secret` 请求头；payload 会包含标题、文件名、视频链接、Markdown、模式、模板、标签、frontmatter、token 用量、分段数和关键帧元数据，适合接入飞书、企业微信、Make/Zapier 或自建服务。

## 开源状态

这个项目目前主要服务个人工作流，仍在快速迭代。欢迎按自己的 B 站学习、Obsidian 入库、长视频总结和本地模型使用场景改造。提交 issue 或 PR 时，尽量附上：

- 视频类型：普通视频、多 P、长视频、无 CC 字幕等。
- 使用的模型和 Base URL 类型。
- 浏览器控制台或侧边栏运行记录里的关键错误。
- 期望导出的格式或知识库结构。
