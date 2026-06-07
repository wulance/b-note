/**
 * AI 总结模块
 * 支持 OpenAI 兼容协议（Claude API、OpenAI、Ollama 等）
 */

export type SummaryMode = 'quick' | 'standard' | 'detailed';
export type SummaryTemplate = 'study' | 'tutorial' | 'ideas' | 'timeline';

export interface AIConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  transcriptionModel?: string;
  transcriptionBaseUrl?: string;
  transcriptionApiKey?: string;
  transcriptionWorkerUrl?: string;
}

export interface TokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface SummaryResult {
  content: string;
  usage: TokenUsage | null;
  chunks?: number;
}

export interface TagGenerationResult {
  tags: string[];
  usage: TokenUsage | null;
}

export interface ModelListResult {
  models: string[];
}

export interface SummaryStreamEvent {
  content: string;
  delta: string;
  usage: TokenUsage | null;
}

interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

const CHUNK_CHAR_LIMIT = 12000;
const CHUNK_OVERLAP_LINES = 4;
const CHUNK_CONCURRENCY = 3;

const VIDEO_TYPE_ROUTING_PROMPT = `先根据标题和字幕判断视频类型，再选择对应的信息结构。
可选类型：
- 教程 / 工具配置：突出步骤、前置条件、验证方法、常见错误
- 发布会 / 主题演讲：突出核心叙事、发布事实、路线图、商业判断、待验证承诺、时间线索引
- 测评 / 横评：突出测试对象、指标、方法、结果、限制、购买/选择建议
- 访谈 / 播客：突出人物立场、关键问答、分歧、可引用表达
- 新闻 / 评论：突出事件、背景、各方观点、影响和不确定性
- 课程 / 科普：突出概念、推理链、例子、复习问题
不要把一种类型硬套成另一种类型。`;

const COMMAND_ACCURACY_PROMPT = `命令、代码块和配置片段的准确性规则：
1. 只有在字幕中明确出现完整命令、画面文字/OCR 明确给出完整命令、或属于官方文档/行业通用且可稳定验证的命令时，才允许输出可复制代码块
2. 如果命令来自口播推测、字幕疑似误识别、画面信息不完整，必须标记为“待核对”，不要放进可复制代码块
3. 不要补全看不清的参数、路径、仓库地址、文件名、API 名称；缺失就写“视频未给出完整命令/地址”
4. 对低可信命令使用引用块或表格备注，例如："> 待核对：视频中疑似为 \`...\`，需以官方文档或本机 help 为准"
5. 对可确认命令，在命令下方写一句“用途”和“来源/可信度”：confirmed / inferred / unknown
6. 教程类笔记宁可少给命令，也不要生成可能误导用户执行的错误命令。`;

const PROMPTS: Record<SummaryMode, string> = {
  quick: `模式：速览。
请只生成一份极简速读清单，用来让用户在 30 秒内判断视频是否值得看。
要求：
1. 不要写标题、总述、分级标题、关键词表、延伸建议或操作步骤
2. 只输出 4-6 条 bullet points，每条不超过 32 个中文字符
3. 每条格式固定为 "- [MM:SS] 要点"
4. 只保留最关键结论，省略步骤细节和背景铺垫
5. 禁止出现二级标题、三级标题、表格、有序列表
6. 中英文混合内容按语义自然整理，保留必要英文术语
7. 速览模式不输出图片标签

视频字幕：`,

  standard: `模式：标准。
请生成一份适合保存到 Obsidian 的结构化视频笔记。
要求：
1. 使用以下结构，不能改成速览清单或详细教程：
   ## 总述
   ## 分段笔记
   ## 关键结论
2. 总述控制在 2 句以内
3. 分段笔记按 3-5 个话题组织，每个话题包含时间戳范围和 2-3 条要点
4. 关键结论输出 3-5 条
5. 每个分段话题标题下方必须单独输出 1 行图片标签，格式固定为 "[<image>@MM:SS]"，用于代表该段画面
6. 图片标签必须独占一行，全文输出 3-4 个，不要放在列表项里，不要解释图片标签
7. 不要加入关键词表、延伸建议、逐句转写、完整操作教程或个人发挥
8. 中英文混合内容按语义自然整理，保留必要英文术语

视频字幕（格式为 [时间戳] 内容）：`,

  detailed: `模式：详细。
请生成一份适合复盘学习的高密度长笔记，目标是让没看视频的人也能理解视频主线、关键细节、证据和结论。
要求：
1. 默认使用以下结构；如果视频类型或“笔记模板”明确指定了更适合当前内容的结构，以更贴合内容的结构为准：
   ## 总述
   ## 主要内容
   ## 关键细节与证据
   ## 结论与影响
   ## 时间线索引
2. 主要内容可按主题组织，也可按时间组织；每个主要段落都要有时间戳范围
3. 每个主要段落至少写 3 条要点，尽量保留具体事实、工具名、产品名、数据、例子、限制条件和作者判断
4. 对重要提醒使用 "> " 引用格式
5. 只有视频确实包含可执行流程时，才整理成有序步骤；不要为发布会、访谈、新闻评论硬造操作步骤
6. 对教程、工具、知识讲解类视频，可包含"易错点与注意事项"和"延伸建议"；对发布会、访谈、观点评论类视频，改写成"争议与待验证点"、"行业影响"等更贴合内容的栏目
7. 详细学习笔记的每个主要段落标题下方必须单独输出 1 行图片标签，格式固定为 "[<image>@MM:SS]"，用于代表该段画面
8. 图片标签必须独占一行，全文输出 4-6 个，不要放在列表项里，不要解释图片标签
9. 不要压缩成速览，不要只给结论；不要省略关键事实、论据、限制条件和时间线
10. 中英文混合内容按语义自然整理，保留必要英文术语和专有名词

视频字幕（格式为 [时间戳] 内容）：`,
};

const TEMPLATE_PROMPTS: Record<SummaryTemplate, string> = {
  study: `笔记模板：学习笔记。
重点提炼概念、背景、推理链、关键结论和可复习的问题。适合课程、科普、技术讲解、论文解读。
如果视频不是知识讲解，不要强行写概念表；改为整理其核心信息结构和可复盘问题。`,
  tutorial: `笔记模板：教程步骤。
重点整理可执行步骤、命令、配置项、前置条件、验证方法和常见错误。适合工具安装、配置教程、工作流演示。
如果视频不是教程，只提炼其中真实存在的可执行流程，不要编造步骤。
教程输出必须额外遵守：
1. 优先使用结构：## 快速执行、## 前置条件、## 步骤、## 命令清单、## 快捷键 / 配置项、## 常见问题、## 参考与待核对
2. “命令清单”只收录 confirmed 命令，并用 fenced code block 输出；每个代码块前后说明用途、适用环境和来源
3. inferred 命令放入“参考与待核对”，使用引用块或表格，不要放入 fenced code block
4. unknown 命令不输出具体命令，只写操作说明和需要查证的位置
5. 如果视频字幕把命令识别得不完整或可疑，必须明确写“待核对”，不要把推测当作事实。`,
  ideas: `笔记模板：观点摘录。
目标是把视频整理成可阅读的观点分析，而不是逐段转写或教程。
如果视频是发布会、主题演讲、访谈、评论或行业判断，优先使用以下结构：
## 总述
## 核心观点地图
## 关键论点与证据
## 产品 / 路线图信号
## 争议与待验证点
## 行业影响
## 适合引用的表达
## 时间线索引
要求：
1. 按主题聚合观点，不要机械复述每一分钟发生了什么
2. 每个论点必须带时间戳范围，并说明“观点 / 依据 / 含义”
3. 区分已发布事实、演讲者判断、商业叙事和仍需验证的承诺
4. 删除没有观点密度的寒暄、串场、重复口号和碎片字幕
5. 不要硬写操作步骤、安装教程、关键词表；除非视频本身就是教程
6. “时间线索引”必须从开头覆盖到结尾，列出 8-12 个主要时间段；即使某段信息密度较低，也要用一句话说明其作用，避免读者误以为漏段`,
  timeline: `笔记模板：时间线。
严格按视频时间顺序组织内容，保留更多时间戳，适合回看定位。
每个时间段都要说明该段作用：背景、发布、演示、论证、过渡、总结等；不要只堆字幕。`,
};

export function getTemplateLabel(template: SummaryTemplate): string {
  return {
    study: '学习笔记',
    tutorial: '教程步骤',
    ideas: '观点摘录',
    timeline: '时间线',
  }[template];
}

function buildSystemPrompt(mode: SummaryMode): string {
  const modeRules: Record<SummaryMode, string> = {
    quick: '当前是速览模式，必须短、少、无标题、无章节，只保留核心结论。',
    standard: '当前是标准模式，必须结构清晰、信息适中，适合日常收藏，不能写成长教程。',
    detailed: '当前是详细模式，必须充分展开信息结构、关键细节、证据、限制和结论，篇幅应明显长于标准模式。',
  };

  const base = `你是一个专业的学习笔记助手。你输出的内容会直接保存为 Obsidian 的 Markdown 笔记。
请输出纯 Markdown，不要包含"以下是总结"等元描述。
无论字幕是中文、英文还是中英文混合，都按内容语义组织成清晰中文笔记，并保留关键术语。
${VIDEO_TYPE_ROUTING_PROMPT}
${COMMAND_ACCURACY_PROMPT}
${modeRules[mode]}`;

  return base;
}

export async function summarize(
  subtitleText: string,
  videoTitle: string,
  mode: SummaryMode,
  config: AIConfig,
  template: SummaryTemplate = 'study'
): Promise<SummaryResult> {
  if (shouldChunkTranscript(subtitleText, mode)) {
    return summarizeInChunks(subtitleText, videoTitle, mode, config, template);
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt(mode) },
    {
      role: 'user',
      content: `${PROMPTS[mode]}\n\n${TEMPLATE_PROMPTS[template]}\n\n视频标题：${videoTitle}\n\n${subtitleText}`,
    },
  ];

  const response = await fetch(chatCompletionsUrl(config.baseUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: 0.3,
      max_tokens: mode === 'detailed' ? 6000 : mode === 'standard' ? 2600 : 700,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API 请求失败 (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return {
    content: normalizeMessageContent(data.choices?.[0]?.message?.content),
    usage: normalizeUsage(data.usage),
    chunks: 1,
  };
}

export async function fetchAvailableModels(config: AIConfig): Promise<ModelListResult> {
  const response = await fetch(modelsUrl(config.baseUrl), {
    method: 'GET',
    headers: {
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`模型列表获取失败 (${response.status}): ${errorText}`);
  }

  const payload = await response.json();
  const models = parseModelIds(payload);
  if (!models.length) {
    throw new Error('服务商返回了模型列表，但没有可识别的模型 ID');
  }
  return { models };
}

function parseModelIds(payload: unknown): string[] {
  const data = (payload as any)?.data;
  const source = Array.isArray(data) ? data : Array.isArray(payload) ? payload : [];
  return [...new Set(source
    .map((item: any) => typeof item === 'string' ? item : item?.id || item?.name)
    .map((id: unknown) => String(id || '').trim())
    .filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

export async function summarizeStream(
  subtitleText: string,
  videoTitle: string,
  mode: SummaryMode,
  config: AIConfig,
  template: SummaryTemplate = 'study',
  onDelta: (event: SummaryStreamEvent) => void
): Promise<SummaryResult> {
  if (shouldChunkTranscript(subtitleText, mode)) {
    return summarizeInChunks(subtitleText, videoTitle, mode, config, template, onDelta);
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt(mode) },
    {
      role: 'user',
      content: `${PROMPTS[mode]}\n\n${TEMPLATE_PROMPTS[template]}\n\n视频标题：${videoTitle}\n\n${subtitleText}`,
    },
  ];

  const controller = new AbortController();
  let content = '';
  let firstTokenTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
    if (!content) controller.abort();
  }, 30000);

  const clearFirstTokenTimer = () => {
    if (!firstTokenTimer) return;
    clearTimeout(firstTokenTimer);
    firstTokenTimer = null;
  };

  let response: Response;
  try {
    response = await fetch(chatCompletionsUrl(config.baseUrl), {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: 0.3,
        max_tokens: mode === 'detailed' ? 6000 : mode === 'standard' ? 2600 : 700,
        stream: true,
        stream_options: { include_usage: true },
      }),
    });
  } catch (error: any) {
    clearFirstTokenTimer();
    if (!content && error?.name === 'AbortError') {
      return summarize(subtitleText, videoTitle, mode, config, template);
    }
    throw error;
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API 请求失败 (${response.status}): ${errorText}`);
  }
  if (!response.body) {
    return summarize(subtitleText, videoTitle, mode, config, template);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let usage: TokenUsage | null = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      for (const line of lines) {
        const parsed = parseStreamLine(line);
        if (!parsed || parsed.done) continue;
        const nextUsage = normalizeUsage(parsed.payload?.usage);
        if (nextUsage) usage = nextUsage;
        const delta = normalizeMessageContent(
          parsed.payload?.choices?.[0]?.delta?.content ??
          parsed.payload?.choices?.[0]?.message?.content ??
          parsed.payload?.message?.content ??
          ''
        );
        if (!delta) continue;
        clearFirstTokenTimer();
        content += delta;
        onDelta({ content, delta, usage });
      }
    }
  } catch (error: any) {
    clearFirstTokenTimer();
    if (!content && error?.name === 'AbortError') {
      return summarize(subtitleText, videoTitle, mode, config, template);
    }
    throw error;
  } finally {
    clearFirstTokenTimer();
  }
  if (buffer.trim()) {
    const parsed = parseStreamLine(buffer);
    if (parsed && !parsed.done) {
      const nextUsage = normalizeUsage(parsed.payload?.usage);
      if (nextUsage) usage = nextUsage;
      const delta = normalizeMessageContent(
        parsed.payload?.choices?.[0]?.delta?.content ??
        parsed.payload?.choices?.[0]?.message?.content ??
        parsed.payload?.message?.content ??
        ''
      );
      if (delta) {
        content += delta;
        onDelta({ content, delta, usage });
      }
    }
  }

  return { content, usage, chunks: 1 };
}

export async function answerVideoQuestion({
  subtitleText,
  note,
  videoTitle,
  question,
  config,
}: {
  subtitleText: string;
  note: string;
  videoTitle: string;
  question: string;
  config: AIConfig;
}): Promise<SummaryResult> {
  const transcript = subtitleText.length > 18000 ? `${subtitleText.slice(0, 18000)}\n\n[字幕过长，已截取前半部分作为上下文]` : subtitleText;
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        '你是一个视频内容问答助手。只根据用户提供的视频字幕和已有笔记回答，无法从材料中确认时要明确说不确定。回答要简洁、可执行，并尽量引用时间戳。',
    },
    {
      role: 'user',
      content: `视频标题：${videoTitle}

已有笔记：
${note}

字幕：
${transcript}

用户问题：${question}`,
    },
  ];

  const result = await sendChatCompletion(config, messages, 0.2, 1400);
  return { ...result, chunks: 1 };
}

export async function generateNoteTags({
  videoTitle,
  note,
  transcript,
  config,
}: {
  videoTitle: string;
  note: string;
  transcript?: string | null;
  config: AIConfig;
}): Promise<TagGenerationResult> {
  const compactNote = note.trim().slice(0, 9000);
  const compactTranscript = (transcript || '').trim().slice(0, 3000);
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        '你是 Obsidian 知识库标签助手。请只输出 JSON 数组，不要解释。标签用于视频笔记检索，必须简短、稳定、可复用。',
    },
    {
      role: 'user',
      content: `请为这篇 B 站视频笔记生成 3-6 个标签。
规则：
1. 输出严格 JSON 数组，例如 ["AI", "智能体", "OpenClaw"]
2. 每个标签 2-10 个中文字符或常见英文术语
3. 避免宽泛标签：视频、笔记、学习、教程、B站、总结
4. 优先保留产品名、工具名、技术主题、应用场景、风险主题
5. 不要输出 # 前缀，不要输出句子

视频标题：${videoTitle}

笔记内容：
${compactNote}

字幕摘录：
${compactTranscript}`,
    },
  ];
  const result = await sendChatCompletion(config, messages, 0.1, 180);
  return {
    tags: parseGeneratedTags(result.content),
    usage: result.usage,
  };
}

export async function synthesizeCollection({
  videoTitle,
  partNotes,
  mode,
  template,
  config,
}: {
  videoTitle: string;
  partNotes: Array<{ page: number; title: string; content: string }>;
  mode: SummaryMode;
  template: SummaryTemplate;
  config: AIConfig;
}): Promise<SummaryResult> {
  const compactNotes = partNotes
    .map((part) => `## P${part.page} ${part.title}\n${part.content.trim().slice(0, 5000)}`)
    .join('\n\n');

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        '你是一个视频合集总编。你要基于每个分 P 的笔记，生成全集层面的综合总结。不要重复粘贴每集笔记，要提炼跨集主题、统一结论和可执行行动清单。输出纯 Markdown。',
    },
    {
      role: 'user',
      content: `合集标题：${videoTitle}
总结模式：${mode}
${TEMPLATE_PROMPTS[template]}

请生成以下结构：
## 全集总览
用 2-4 句话说明整个合集在解决什么问题、最终能获得什么。

## 跨 P 主题
提炼 3-6 个贯穿多个分 P 的主题，每个主题说明涉及哪些 P。

## 统一行动清单
整理可以直接执行的步骤，尽量按真实操作顺序排列。

## 观看/复盘建议
指出哪些 P 适合先看、哪些适合回看定位、哪些内容需要特别注意。

分 P 笔记：
${compactNotes}`,
    },
  ];

  const result = await sendChatCompletion(config, messages, 0.25, mode === 'detailed' ? 2600 : 1600);
  return { ...result, chunks: 1 };
}

export async function testAIConnection(config: AIConfig): Promise<TokenUsage | null> {
  const response = await fetch(chatCompletionsUrl(config.baseUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: '只回答 OK。' },
        { role: 'user', content: '连接测试。' },
      ],
      temperature: 0,
      max_tokens: 8,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API 测试失败 (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return normalizeUsage(data.usage);
}

export function estimateTokenCount(text: string): number {
  const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const other = Math.max(0, text.length - cjk);
  return Math.ceil(cjk * 0.9 + other / 4);
}

function shouldChunkTranscript(subtitleText: string, mode: SummaryMode): boolean {
  if (mode === 'quick') return subtitleText.length > CHUNK_CHAR_LIMIT * 1.6;
  return subtitleText.length > CHUNK_CHAR_LIMIT;
}

async function summarizeInChunks(
  subtitleText: string,
  videoTitle: string,
  mode: SummaryMode,
  config: AIConfig,
  template: SummaryTemplate,
  onProgress?: (event: SummaryStreamEvent) => void
): Promise<SummaryResult> {
  const chunks = splitTranscript(subtitleText, CHUNK_CHAR_LIMIT);
  const partials: Array<SummaryResult | undefined> = new Array(chunks.length);
  const summarizeChunk = (chunk: string, index: number) => {
    const messages: ChatMessage[] = [
      { role: 'system', content: buildSystemPrompt(mode) },
      {
        role: 'user',
        content: `这是长视频的第 ${index + 1}/${chunks.length} 段字幕。请先只总结这一段，保留关键时间戳，不要写全片结论。
请输出可被最终合并使用的“分段素材”，不要写开场套话。
每段素材必须包含：
1. 本段时间范围
2. 3-6 个高密度主题点，每个主题点包含：观点 / 依据 / 含义
3. 只保留本段最有信息量的事实、判断、产品信号、路线图和争议点
4. 删除重复口号、寒暄、字幕噪声和没有独立信息量的句子
5. 如果本段包含命令、代码、配置、链接或参数，必须按可信度标记 confirmed / inferred / unknown；不要补全看不清或听不准的命令

视频标题：${videoTitle}
总结模式：${mode}
${TEMPLATE_PROMPTS[template]}

${chunk}`,
      },
    ];
    return sendChatCompletion(config, messages, 0.25, mode === 'detailed' ? 2200 : 1200);
  };

  await mapWithConcurrency(chunks, CHUNK_CONCURRENCY, async (chunk, index) => {
    const partial = await summarizeChunk(chunk, index);
    partials[index] = partial;
    const completed = partials.filter(Boolean) as SummaryResult[];
    onProgress?.({
      delta: '',
      content: renderChunkProgress(partials, chunks.length),
      usage: mergeUsage(completed.map((item) => item.usage)),
    });
    return partial;
  });
  const completedPartials = partials.filter(Boolean) as SummaryResult[];

  const mergeMessages: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt(mode) },
    {
      role: 'user',
      content: `下面是长视频分段总结，请合并成最终笔记。去重、保留时间戳、按当前模式和模板输出，不要提到“分段总结”。
合并要求：
1. 优先按主题组织，再在主题内保持时间顺序；不要把每个分段原样拼接
2. 每个一级主题都要覆盖明确时间范围，避免后半段被省略
3. 对发布会/主题演讲类内容，区分“已发布事实 / 演讲者判断 / 商业叙事 / 待验证承诺”
4. 保留具体产品名、合作方、路线图、数字和时间点，但删除重复口号和寒暄
5. 如果内容很长，宁可减少每个点的字数，也不要丢掉后半段主题
6. 必须输出一个“时间线索引”或等价章节，覆盖视频开头、中段和结尾；索引中的最后一个时间段应接近原视频末尾
7. 不要只因为某段是串场、寒暄或演示过渡就完全消失；可以压缩为一句“过渡/演示/铺垫”，但要保留时间范围
8. 合并教程内容时，只有 confirmed 命令可以进入可复制代码块；inferred 命令必须进入“参考与待核对”，unknown 不输出具体命令

视频标题：${videoTitle}
总结模式：${mode}
${TEMPLATE_PROMPTS[template]}

${completedPartials.map((part, index) => `## 片段 ${index + 1}\n${part.content}`).join('\n\n')}`,
    },
  ];
  const merged = await sendChatCompletion(config, mergeMessages, 0.25, mode === 'detailed' ? 6000 : mode === 'standard' ? 3000 : 900);
  const mergedContent = hasSufficientTimestampCoverage(subtitleText, merged.content)
    ? merged.content
    : buildCoveragePreservingSummary(videoTitle, mode, template, completedPartials, merged.content);
  return {
    content: mergedContent,
    usage: mergeUsage([...completedPartials.map((part) => part.usage), merged.usage]),
    chunks: chunks.length,
  };
}

export function hasSufficientTimestampCoverage(source: string, summary: string): boolean {
  const sourceLast = lastTimestampSeconds(source);
  const summaryLast = lastTimestampSeconds(summary);
  if (sourceLast == null || summaryLast == null) return true;
  const missingSeconds = sourceLast - summaryLast;
  return missingSeconds < 900 || summaryLast >= sourceLast * 0.88;
}

function buildCoveragePreservingSummary(
  videoTitle: string,
  mode: SummaryMode,
  template: SummaryTemplate,
  partials: SummaryResult[],
  mergedPreview: string,
): string {
  const normalizedPartials = partials
    .map((part, index) => normalizeChunkPartial(part.content, index + 1))
    .filter(Boolean);
  const intro = [
    '## 总述',
    '',
    `${videoTitle} 是一条长视频，系统检测到最终合并版可能遗漏后半段内容，因此已切换为“完整覆盖版”：保留全部分段初稿，确保时间线覆盖到视频末尾。`,
    '',
    `- 总结模式：${mode}`,
    `- 笔记模板：${getTemplateLabel(template)}`,
  ];
  const preview = mergedPreview.trim()
    ? [
      '',
      '## 合并版摘要（供快速预览）',
      '',
      stripTopLevelTitle(mergedPreview).slice(0, 1800),
    ]
    : [];
  return [
    ...intro,
    ...preview,
    '',
    '## 完整分段笔记',
    '',
    ...normalizedPartials,
    '',
    '## 复盘提示',
    '',
    '- 这份笔记优先保证长视频时间线完整覆盖。',
    '- 如需更短版本，可切换为“标准”或“速览”模式重新生成。',
  ].join('\n').trim();
}

function normalizeChunkPartial(content: string, index: number): string {
  const body = stripTopLevelTitle(content).trim();
  if (!body) return '';
  return [`### 第 ${index} 段`, '', body].join('\n');
}

function parseGeneratedTags(content: string): string[] {
  const text = String(content || '').trim();
  const candidates: string[] = [];
  try {
    const match = text.match(/\[[\s\S]*\]/);
    const parsed = JSON.parse(match ? match[0] : text);
    if (Array.isArray(parsed)) {
      candidates.push(...parsed.map((item) => String(item)));
    }
  } catch {
    candidates.push(...text.split(/[\n,，、#;；]+/g));
  }
  const blocked = new Set(['视频', '笔记', '学习', '教程', 'B站', '总结', '视频笔记', 'B站视频笔记']);
  return [...new Set(candidates
    .map((tag) => tag.replace(/^#+/, '').trim())
    .filter((tag) => tag && !blocked.has(tag) && tag.length <= 24))]
    .slice(0, 6);
}

function stripTopLevelTitle(content: string): string {
  return content
    .split('\n')
    .filter((line) => !/^#\s+/.test(line.trim()) && !/^# 分段处理中/.test(line.trim()))
    .join('\n')
    .trim();
}

function lastTimestampSeconds(text: string): number | null {
  const matches = Array.from(String(text).matchAll(/\[(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*[-–]\s*(\d{1,2}):(\d{2})(?::(\d{2}))?)?\]/g));
  let last: number | null = null;
  for (const match of matches) {
    const start = timestampPartsToSeconds(match[1], match[2], match[3]);
    const end = match[4] ? timestampPartsToSeconds(match[4], match[5], match[6]) : start;
    const seconds = Math.max(start, end);
    if (last == null || seconds > last) last = seconds;
  }
  return last;
}

function timestampPartsToSeconds(first: string, second: string, third?: string): number {
  const a = Number(first);
  const b = Number(second);
  const c = third == null ? null : Number(third);
  if (c == null) return a * 60 + b;
  return a * 3600 + b * 60 + c;
}

function renderChunkProgress(partials: Array<SummaryResult | undefined>, total: number): string {
  const completed = partials.filter(Boolean).length;
  const sections = partials
    .map((part, index) => part ? `## 片段 ${index + 1} 初稿\n${part.content}` : '')
    .filter(Boolean)
    .join('\n\n');
  return [
    `# 分段处理中（${completed}/${total}）`,
    '',
    '长视频正在并发处理分段，下面内容是已完成片段的临时预览，最终会自动合并成正式笔记。',
    '',
    sections,
  ].join('\n').trim();
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, concurrency), items.length);

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }));

  return results;
}

function splitTranscript(text: string, limit: number): string[] {
  const lines = text.split('\n').filter(Boolean);
  const chunks: string[] = [];
  let current: string[] = [];
  let length = 0;

  for (const line of lines) {
    if (length + line.length > limit && current.length > 0) {
      chunks.push(current.join('\n'));
      current = current.slice(-CHUNK_OVERLAP_LINES);
      length = current.join('\n').length;
    }
    current.push(line);
    length += line.length + 1;
  }

  if (current.length) chunks.push(current.join('\n'));
  return chunks;
}

async function sendChatCompletion(
  config: AIConfig,
  messages: ChatMessage[],
  temperature: number,
  maxTokens: number
): Promise<SummaryResult> {
  const response = await fetch(chatCompletionsUrl(config.baseUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API 请求失败 (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return {
    content: normalizeMessageContent(data.choices?.[0]?.message?.content),
    usage: normalizeUsage(data.usage),
  };
}

function mergeUsage(usages: Array<TokenUsage | null | undefined>): TokenUsage | null {
  const total = usages.filter(Boolean) as TokenUsage[];
  if (!total.length) return null;
  const promptTokens = sumUsage(total, 'promptTokens');
  const completionTokens = sumUsage(total, 'completionTokens');
  const totalTokens = sumUsage(total, 'totalTokens') ?? addOptional(promptTokens, completionTokens);
  return { promptTokens, completionTokens, totalTokens };
}

function sumUsage(usages: TokenUsage[], key: keyof TokenUsage): number | undefined {
  let sum = 0;
  let hasValue = false;
  for (const usage of usages) {
    const value = usage[key];
    if (value != null) {
      sum += value;
      hasValue = true;
    }
  }
  return hasValue ? sum : undefined;
}

function chatCompletionsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/g, '')}/chat/completions`;
}

function modelsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/g, '')}/models`;
}

function normalizeUsage(usage: any): TokenUsage | null {
  if (!usage || typeof usage !== 'object') return null;
  const promptTokens = toNumber(usage.prompt_tokens ?? usage.input_tokens);
  const completionTokens = toNumber(usage.completion_tokens ?? usage.output_tokens);
  const totalTokens = toNumber(usage.total_tokens);
  if (promptTokens == null && completionTokens == null && totalTokens == null) return null;
  return { promptTokens, completionTokens, totalTokens };
}

function parseStreamLine(line: string): { done: boolean; payload?: any } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith(':')) return null;
  const data = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed;
  if (!data) return null;
  if (data === '[DONE]') return { done: true };
  try {
    return { done: false, payload: JSON.parse(data) };
  } catch {
    return null;
  }
}

function toNumber(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function normalizeMessageContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part) {
          return String((part as { text?: unknown }).text || '');
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  if (content == null) return '（未获得有效回复）';
  return String(content);
}

function addOptional(left?: number, right?: number): number | undefined {
  if (left == null && right == null) return undefined;
  return (left || 0) + (right || 0);
}
