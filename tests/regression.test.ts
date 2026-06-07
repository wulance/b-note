import assert from 'node:assert/strict';
import {
  estimateUsageCost,
  formatEstimatedCost,
  normalizePricing,
} from '../src/lib/cost';
import {
  ensureKeyFrameMarkers,
  extractKeyFrameTargets,
  extractMarkdownOutline,
  parseTimestampLabel,
} from '../src/lib/markdown';
import { buildNoteMarkdown } from '../src/lib/note';
import { buildNotePackageFiles } from '../src/lib/notePackage';
import { createZipBlob } from '../src/lib/zip';
import { buildShareHtml, renderMarkdownToHtml } from '../src/lib/htmlExport';
import { ensureBrowserFallback } from '../src/lib/browserFallback';
import { loadLatestDraft, saveLatestDraft } from '../src/lib/drafts';
import { transcribeAudioBlob, transcribeBilibiliAudio } from '../src/lib/transcriber';
import { parseExtraFrontmatter, parseFrontmatterFieldMap, parseTags } from '../src/lib/frontmatter';
import { buildCollectionMarkdown, extractCollectionTopics, mergeTokenUsage } from '../src/lib/collectionNote';
import { getTranscriptionWarning } from '../src/lib/transcriptionSupport';
import { explainTranscriptionError } from '../src/lib/transcriber';
import { applyNoteTemplate, NOTE_TEMPLATE_PRESETS } from '../src/lib/noteTemplate';
import { hasSufficientTimestampCoverage } from '../src/lib/summarizer';
import { markdownToTelegraphNodes, publishToTelegraph, splitTelegraphNodes, uploadTelegraphImages } from '../src/lib/telegraph';
import { publishToTelegram, splitTelegramText } from '../src/lib/telegram';
import { publishToWebhook } from '../src/lib/webhook';
import { getSafeHref, parseRenderBlocks } from '../src/lib/markdownRender';
import { normalizeSettings } from '../src/lib/settings';
import {
  buildObsidianNotePath,
  buildObsidianRestNotePath,
  buildObsidianRestPayload,
  saveToObsidianRest,
} from '../src/lib/obsidian';

const pricing = normalizePricing({
  currency: 'CNY',
  promptPerMillion: 2,
  completionPerMillion: 8,
});

assert.deepEqual(pricing, {
  currency: 'CNY',
  promptPerMillion: 2,
  completionPerMillion: 8,
});
assert.equal(normalizeSettings({}).autoCaptureKeyFrames, true);
assert.equal(normalizeSettings({ autoCaptureKeyFrames: false }).autoCaptureKeyFrames, false);
assert.equal(normalizeSettings({}).obsidian.syncMode, 'uri');
assert.equal(normalizeSettings({ obsidian: { syncMode: 'rest', restOverwrite: false } }).obsidian.syncMode, 'rest');
assert.equal(normalizeSettings({ obsidian: { syncMode: 'bad' } }).obsidian.syncMode, 'uri');
assert.equal(buildObsidianNotePath('B站视频笔记//AI/', '测试.md'), 'B站视频笔记/AI/测试.md');
assert.equal(
  buildObsidianRestNotePath({ ...normalizeSettings({}).obsidian, vault: 'b-note', folder: 'B站视频笔记' }, '测试.md'),
  'b-note/B站视频笔记/测试.md'
);
const obsidianPayload = buildObsidianRestPayload(
  'b-note/B站视频笔记/测试.md',
  '![图](data:image/jpeg;base64,aGk=)\n[<image>@00:12]\n正文',
  [{ title: '开场截图', dataUrl: 'data:image/jpeg;base64,aGk=', capturedAt: '2026', seconds: 12 }]
);
assert.equal(obsidianPayload.attachments.length, 1);
assert.equal(obsidianPayload.attachments[0].path, 'b-note/B站视频笔记/_assets/测试/frame-01.jpg');
assert.equal(obsidianPayload.attachments[0].contentType, 'image/jpeg');
assert.doesNotMatch(obsidianPayload.content, /data:image/);
assert.match(obsidianPayload.content, /!\[图\]\(_assets\/%E6%B5%8B%E8%AF%95\/frame-01\.jpg\)/);
assert.match(obsidianPayload.content, /!\[开场截图\]\(_assets\/%E6%B5%8B%E8%AF%95\/frame-01\.jpg\)/);
const cleanedObsidianPayload = buildObsidianRestPayload(
  'b-note/B站视频笔记/清爽.md',
  [
    '---',
    'source: bilibili',
    'title: "清爽"',
    '---',
    '',
    '# 清爽',
    '',
    '- 来源：B站',
    '- 总结模式：详细',
    '- 模型：DeepSeek / deepseek-v4-pro',
    '- Token 消耗：总计 1 tokens',
    '- 关键画面：1 张',
    '',
    '## 关键画面',
    '',
    '![关键画面](data:image/jpeg;base64,aGk=)',
    '',
    '> 关键画面',
    '',
    '## 总述',
    '[<image>@00:12]',
    '正文',
    '## 步骤',
    '时间戳：',
    '[00:12 - 00:30]',
    '1 . 操作',
  ].join('\n'),
  [{ title: '总述截图', dataUrl: 'data:image/jpeg;base64,aGk=', capturedAt: '2026', seconds: 12 }]
);
assert.match(cleanedObsidianPayload.content, /^---\nsource: bilibili\ntitle: "清爽"\ntags:\n  - B站视频笔记\n  - 教程\n---/m);
assert.match(cleanedObsidianPayload.content, /## 目录\n\n- \[\[#总述\|总述\]\]\n- \[\[#步骤\|步骤\]\]/);
assert.match(cleanedObsidianPayload.content, /## 总述/);
assert.doesNotMatch(cleanedObsidianPayload.content, /^# 清爽/m);
assert.doesNotMatch(cleanedObsidianPayload.content, /来源：B站|Token 消耗|## 关键画面/);
assert.match(cleanedObsidianPayload.content, /!\[总述截图\]\(_assets\/%E6%B8%85%E7%88%BD\/frame-01\.jpg\)/);
assert.match(cleanedObsidianPayload.content, /\*\*时间戳\*\*：\[00:12 - 00:30\]\n1\. 操作/);

assert.equal(
  estimateUsageCost({ promptTokens: 1000, completionTokens: 500, totalTokens: 1500 }, pricing),
  0.006
);
assert.equal(formatEstimatedCost(0.006, 'CNY'), '¥0.0060');
assert.deepEqual(parseTags('AI, 视频笔记 #学习 AI'), ['AI', '视频笔记', '学习']);
assert.deepEqual(parseExtraFrontmatter('project: AI学习\ntitle: 不应覆盖\nstatus: inbox\nbad key: no'), {
  project: 'AI学习',
  status: 'inbox',
});
assert.deepEqual(parseFrontmatterFieldMap('url: source_url\nsummary_mode: note_mode\nkeyframes: -\nbad: no'), {
  url: 'source_url',
  summary_mode: 'note_mode',
  keyframes: null,
});
assert.match(
  getTranscriptionWarning({
    apiKey: '',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-v4-pro',
    transcriptionModel: 'whisper-1',
  }) || '',
  /不支持/
);
assert.equal(getTranscriptionWarning({
  apiKey: 'deepseek-key',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-v4-pro',
  transcriptionModel: 'whisper-1',
  transcriptionBaseUrl: 'https://api.openai.com/v1',
  transcriptionApiKey: 'openai-key',
}), null);
assert.match(explainTranscriptionError(new Error('Whisper 转写失败 (404): Not found')), /audio\/transcriptions/);
assert.equal(
  applyNoteTemplate('# {{title}}\n{{content}}\n{{url}}', {
    title: '标题',
    content: '正文',
    url: 'https://example.com',
    generatedAt: '2026',
    mode: '标准',
    template: '学习笔记',
    model: 'model',
  }),
  '# 标题\n正文\nhttps://example.com'
);
assert.equal(
  applyNoteTemplate('', {
    title: '标题',
    content: '正文',
    generatedAt: '2026',
    mode: '标准',
    template: '学习笔记',
    model: 'model',
  }),
  '正文'
);
assert.ok(NOTE_TEMPLATE_PRESETS.some((preset) => preset.id === 'project-review' && preset.content.includes('{{content}}')));

const telegraphNodes = markdownToTelegraphNodes('## 标题\n- **重点**\n[链接](https://example.com)', 'https://bilibili.com/video/BV1');
assert.equal((telegraphNodes[0] as any).tag, 'p');
assert.equal((telegraphNodes[1] as any).tag, 'h3');
assert.equal((telegraphNodes[2] as any).tag, 'ul');
const telegraphPublicNodes = markdownToTelegraphNodes([
  '---',
  'title: 内部元信息',
  '---',
  '# 视频标题',
  '',
  '- 来源：B站',
  '- 总结模式：详细',
  '- 模型：DeepSeek / deepseek-v4-pro',
  '- Token 消耗：总计 1 tokens',
  '',
  '---',
  '## 目录',
  '[P1 开场](#p1)',
].join('\n'));
assert.doesNotMatch(JSON.stringify(telegraphPublicNodes), /内部元信息|视频标题|DeepSeek|Token 消耗|#p1|\[P1 开场\]|---/);
assert.match(JSON.stringify(telegraphPublicNodes), /P1 开场/);
const telegraphGuideNodes = markdownToTelegraphNodes([
  '## 总述',
  '正文',
  '## 核心观点',
  '正文',
  '## 产品路线',
  '正文',
  '## 争议点',
  '正文',
  '## 时间线索引',
  '正文',
].join('\n'), null, { title: '测试标题' });
assert.match(JSON.stringify(telegraphGuideNodes), /阅读提示/);
assert.match(JSON.stringify(telegraphGuideNodes), /核心观点/);
assert.ok(markdownToTelegraphNodes(Array.from({ length: 140 }, (_, index) => `## 第 ${index + 1} 节\n内容`).join('\n\n')).length > 120);
assert.ok(splitTelegraphNodes(
  [{ tag: 'p', children: ['一'.repeat(120)] }, { tag: 'p', children: ['二'.repeat(120)] }],
  180,
).length > 1);
assert.deepEqual(splitTelegramText(['a'.repeat(10), 'b'.repeat(10)].join('\n\n'), 15), ['aaaaaaaaaa', 'bbbbbbbbbb']);

assert.equal(parseTimestampLabel('[01:02]'), 62);
assert.equal(parseTimestampLabel('[01:02:03 - 01:03:00]'), 3723);
assert.equal(parseTimestampLabel('[99:88]'), null);
assert.equal(
  hasSufficientTimestampCoverage('[01:58:05] 视频结尾字幕', '## 笔记\n时间戳：[01:19:55 - 01:24:47]'),
  false
);
assert.equal(
  hasSufficientTimestampCoverage('[01:58:05] 视频结尾字幕', '## 笔记\n时间戳：[01:50:00 - 01:57:10]'),
  true
);

const markdown = [
  '# 视频标题',
  '',
  '## 开场',
  '- 时间戳：[00:03 - 00:12]',
  '- 内容：介绍主题',
  '',
  '## 操作步骤',
  '- 时间戳：[01:05]',
  '- 内容：进入配置',
].join('\n');

assert.deepEqual(
  extractMarkdownOutline(markdown).map((item) => item.title),
  ['视频标题', '开场', '操作步骤']
);

assert.deepEqual(extractKeyFrameTargets(markdown), [
  { title: '开场 [00:03 - 00:12]', seconds: 3, label: '[00:03 - 00:12]' },
  { title: '操作步骤 [01:05]', seconds: 65, label: '[01:05]' },
]);

assert.deepEqual(extractKeyFrameTargets('### 5. 硬件架构深度对比 [08:44 - 10:18]'), [
  { title: '5. 硬件架构深度对比 [08:44 - 10:18]', seconds: 524, label: '[08:44 - 10:18]' },
]);

assert.deepEqual(extractKeyFrameTargets('### [08:44] 硬件架构深度对比\n[<image>@08:50]\n- 要点：[08:44] 说明'), [
  { title: '硬件架构深度对比 [08:50]', seconds: 530, label: '[08:50]' },
]);

assert.deepEqual(extractKeyFrameTargets('### 1. DeepSeek V4 发布背景与期待 (00:06 - 00:31)\n正文'), [
  { title: '1. DeepSeek V4 发布背景与期待 (00:06 - 00:31)', seconds: 6, label: '(00:06 - 00:31)' },
]);

assert.equal(
  ensureKeyFrameMarkers('## 分段笔记\n### 1. 开场 `[00:21 - 00:30]`\n内容\n### 2. 对比 [06:47 - 07:16]\n内容'),
  '## 分段笔记\n### 1. 开场 `[00:21 - 00:30]`\n[<image>@00:21]\n内容\n### 2. 对比 [06:47 - 07:16]\n[<image>@06:47]\n内容'
);

assert.equal(
  ensureKeyFrameMarkers('### 1. DeepSeek V4 发布背景与期待 (00:06 - 00:31)\n正文'),
  '### 1. DeepSeek V4 发布背景与期待 (00:06 - 00:31)\n[<image>@00:06]\n正文'
);

assert.equal(
  ensureKeyFrameMarkers([
    '### 1. 第一段 [00:01]',
    '正文',
    '### 2. 第二段 [00:02]',
    '正文',
    '### 3. 第三段 [00:03]',
  ].join('\n')),
  '### 1. 第一段 [00:01]\n[<image>@00:01]\n正文\n### 2. 第二段 [00:02]\n[<image>@00:02]\n正文\n### 3. 第三段 [00:03]\n[<image>@00:03]'
);

assert.deepEqual(extractKeyFrameTargets('### 1. 开场\n[<image> @ 00:21]\n内容'), [
  { title: '1. 开场 [00:21]', seconds: 21, label: '[00:21]' },
]);

assert.deepEqual(parseRenderBlocks([
  '### 关键段落 [00:21 - 00:30]',
  '[<image>@00:21]',
  '- 要点一',
  '- 要点二',
  '',
  '| 项 | 值 |',
  '| --- | --- |',
  '| 模式 | 详细 |',
].join('\n')), [
  { type: 'heading', level: 3, text: '关键段落 [00:21 - 00:30]' },
  { type: 'keyframe', label: '00:21', seconds: 21 },
  { type: 'list', items: ['要点一', '要点二'] },
  { type: 'table', headers: ['项', '值'], rows: [['模式', '详细']] },
]);
assert.equal(getSafeHref('javascript:alert(1)'), null);
assert.equal(getSafeHref('images/frame-01.jpg'), 'images/frame-01.jpg');

const note = buildNoteMarkdown({
  videoTitle: '测试视频',
  videoUrl: 'https://www.bilibili.com/video/BVtest',
  content: markdown,
  mode: 'standard',
  template: 'tutorial',
  generatedAt: '2026-06-06T10:00:00.000Z',
  usage: { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 },
  providerName: 'DeepSeek',
  model: 'deepseek-v4-pro',
  pricing,
  tags: parseTags('AI, 学习'),
  extraFrontmatter: parseExtraFrontmatter('project: b-note\nstatus: inbox\ntags: ignored'),
  fieldMap: parseFrontmatterFieldMap('url: source_url\nsummary_mode: note_mode\nkeyframes: -'),
  keyFrames: [
    {
      title: '开场 [00:03]',
      dataUrl: 'data:image/jpeg;base64,abc',
      capturedAt: '2026-06-06T10:01:00.000Z',
    },
  ],
});

assert.match(note, /estimated_cost: 0\.006000/);
assert.match(note, /estimated_cost_currency: CNY/);
assert.match(note, /source_url: "https:\/\/www\.bilibili\.com\/video\/BVtest"/);
assert.match(note, /note_mode: 标准/);
assert.match(note, /provider: "DeepSeek"/);
assert.match(note, /model: "DeepSeek \/ deepseek-v4-pro"/);
assert.match(note, /prompt_tokens: 1000/);
assert.match(note, /completion_tokens: 500/);
assert.doesNotMatch(note, /^keyframes:/m);
assert.match(note, /费用估算：¥0\.0060/);
assert.match(note, /## 关键画面/);
assert.match(note, /project: "b-note"/);
assert.match(note, /status: "inbox"/);
assert.match(note, /  - AI/);
assert.doesNotMatch(note, /tags: ignored/);

const packageFiles = buildNotePackageFiles({
  videoTitle: '测试视频',
  videoUrl: 'https://www.bilibili.com/video/BVtest',
  content: markdown,
  mode: 'standard',
  template: 'tutorial',
  generatedAt: '2026-06-06T10:00:00.000Z',
  usage: { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 },
  providerName: 'DeepSeek',
  model: 'deepseek-v4-pro',
  pricing,
  keyFrames: [
    {
      title: '开场 [00:03]',
      dataUrl: 'data:image/jpeg;base64,aGk=',
      capturedAt: '2026-06-06T10:01:00.000Z',
      seconds: 3,
    },
  ],
});
assert.deepEqual(packageFiles.map((file) => file.path), ['测试视频.md', 'images/frame-01.jpg']);
assert.match(String(packageFiles[0].data), /images\/frame-01\.jpg/);
assert.doesNotMatch(String(packageFiles[0].data), /data:image\/jpeg/);
const zipBytes = new Uint8Array(await createZipBlob(packageFiles).arrayBuffer());
assert.equal(zipBytes[0], 0x50);
assert.equal(zipBytes[1], 0x4b);

const htmlSnippet = renderMarkdownToHtml([
  '## 表格',
  '| 项 | 值 |',
  '| --- | --- |',
  '| 安全 | **是** |',
  '',
  '[危险](javascript:alert(1)) <script>alert(1)</script>',
].join('\n'));
assert.match(htmlSnippet, /<table>/);
assert.match(htmlSnippet, /<strong>是<\/strong>/);
assert.doesNotMatch(htmlSnippet, /javascript:alert/);
assert.doesNotMatch(htmlSnippet, /<script>/);
assert.match(htmlSnippet, /&lt;script&gt;/);

const shareHtml = buildShareHtml({
  videoTitle: 'HTML 分享',
  videoUrl: 'https://www.bilibili.com/video/BVhtml',
  content: markdown,
  mode: 'standard',
  template: 'study',
  generatedAt: '2026-06-06T10:00:00.000Z',
  usage: { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 },
  providerName: 'DeepSeek',
  model: 'deepseek-v4-pro',
  pricing,
  keyFrames: [
    { title: '画面', dataUrl: 'data:image/jpeg;base64,aGk=', capturedAt: '2026-06-06T10:00:01.000Z', seconds: 1 },
  ],
});
assert.match(shareHtml, /<!doctype html>/);
assert.match(shareHtml, /关键画面/);
assert.match(shareHtml, /data:image\/jpeg;base64,aGk=/);

const collection = buildCollectionMarkdown({
  title: '合集测试',
  synthesis: '## 全集总览\n这是跨 P 综合总结。',
  parts: [
    {
      page: 1,
      title: '开场',
      content: '## 安装配置\n- [00:01] 内容\n### 常见问题\n- 提醒',
      subtitleCount: 3,
      source: 'cc',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    },
    {
      page: 2,
      title: '失败段',
      content: '',
      subtitleCount: 0,
      source: 'cc',
      usage: null,
      error: '无字幕',
    },
  ],
});
assert.match(collection, /# 合集测试（合集笔记）/);
assert.match(collection, /## 全集综合总结/);
assert.match(collection, /这是跨 P 综合总结/);
assert.match(collection, /## 按主题索引/);
assert.match(collection, /安装配置：P1 开场/);
assert.match(collection, /完成分 P：1\/2/);
assert.match(collection, /P2 失败段/);
assert.deepEqual(extractCollectionTopics([
  { page: 1, title: 'A', content: '## 主题\n### 细节', subtitleCount: 1, source: 'cc', usage: null },
  { page: 2, title: 'B', content: '## 主题', subtitleCount: 1, source: 'cc', usage: null },
]).map((item) => [item.topic, item.refs.length]), [['主题', 2], ['细节', 1]]);
assert.deepEqual(mergeTokenUsage([{ promptTokens: 10, completionTokens: 5, totalTokens: 15 }, { totalTokens: 2 }]), {
  promptTokens: 10,
  completionTokens: 5,
  totalTokens: 17,
});

const originalFetch = globalThis.fetch;
let telegraphCalls = 0;
let telegraphUploadCalls = 0;
(globalThis as any).fetch = async (url: string, init?: RequestInit) => {
  telegraphCalls += 1;
  if (String(url).includes('createAccount')) {
    return new Response(JSON.stringify({ ok: true, result: { access_token: 'token' } }), { status: 200 });
  }
  if (String(url).includes('upload')) {
    telegraphUploadCalls += 1;
    assert.ok(init?.body instanceof FormData);
    return new Response(JSON.stringify([{ src: '/file/test.jpg' }]), { status: 200 });
  }
  if (String(url).includes('createPage')) {
    const body = init?.body as URLSearchParams;
    assert.match(String(body.get('content')), /关键画面/);
    assert.match(String(body.get('content')), /https:\/\/telegra\.ph\/file\/test\.jpg/);
    assert.doesNotMatch(String(body.get('title')), /P1 发布测试$/);
  }
  return new Response(JSON.stringify({ ok: true, result: { url: 'https://telegra.ph/test' } }), { status: 200 });
};
assert.deepEqual(await uploadTelegraphImages([{ title: '图', dataUrl: 'data:image/jpeg;base64,aGk=' }]), [
  { title: '图', url: 'https://telegra.ph/file/test.jpg' },
]);
assert.equal(await publishToTelegraph({
  title: '发布测试 - P1 发布测试',
  content: '# 内容',
  images: [{ title: '图', dataUrl: 'data:image/jpeg;base64,aGk=' }],
}), 'https://telegra.ph/test');
assert.equal(telegraphCalls, 4);
assert.equal(telegraphUploadCalls, 2);

let telegramCalls = 0;
let telegramPhotoCalls = 0;
(globalThis as any).fetch = async (url: string, init?: RequestInit) => {
  assert.match(String(url), /api\.telegram\.org\/bot/);
  if (String(url).includes('sendPhoto')) {
    telegramPhotoCalls += 1;
    assert.ok(init?.body instanceof FormData);
    return new Response(JSON.stringify({ ok: true, result: { message_id: 100 + telegramPhotoCalls } }), { status: 200 });
  }
  telegramCalls += 1;
  const body = JSON.parse(String(init?.body || '{}'));
  assert.equal(body.chat_id, 'chat');
  assert.ok(String(body.text).includes('Telegram 测试'));
  return new Response(JSON.stringify({ ok: true, result: { message_id: telegramCalls } }), { status: 200 });
};
assert.equal(await publishToTelegram({
  botToken: 'token',
  chatId: 'chat',
  title: 'Telegram 测试',
  text: '正文',
  images: [{ title: '图 1', dataUrl: 'data:image/jpeg;base64,aGk=' }],
}), 1);
assert.equal(telegramCalls, 1);
assert.equal(telegramPhotoCalls, 1);

let obsidianRestCalls = 0;
(globalThis as any).fetch = async (url: string, init?: RequestInit) => {
  obsidianRestCalls += 1;
  assert.equal(url, 'http://127.0.0.1:27123/vault/B%E7%AB%99%E8%A7%86%E9%A2%91%E7%AC%94%E8%AE%B0/%E6%B5%8B%E8%AF%95.md');
  assert.equal(init?.method, 'PUT');
  assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer key');
  assert.equal(init?.body, '正文');
  return new Response('', { status: 200 });
};
await saveToObsidianRest({
  config: {
    ...normalizeSettings({}).obsidian,
    syncMode: 'rest',
    restUrl: 'http://127.0.0.1:27123/',
    restApiKey: 'Bearer key',
  },
  filePath: 'B站视频笔记/测试.md',
  content: '正文',
});
assert.equal(obsidianRestCalls, 1);

let webhookCalls = 0;
(globalThis as any).fetch = async (url: string, init?: RequestInit) => {
  webhookCalls += 1;
  assert.equal(url, 'https://hooks.example.com/b-note');
  assert.equal((init?.headers as Record<string, string>)['X-B-Note-Secret'], 'secret');
  const body = JSON.parse(String(init?.body || '{}'));
  assert.equal(body.source, 'b-note');
  assert.equal(body.title, 'Webhook 测试');
  assert.equal(body.keyFrameCount, 2);
  assert.deepEqual(body.tags, ['AI', '学习']);
  assert.equal(body.frontmatter.project, 'b-note');
  assert.equal(body.fileName, 'Webhook 测试.md');
  return new Response(null, { status: 204 });
};
await publishToWebhook(
  { url: 'https://hooks.example.com/b-note', secret: 'secret' },
  {
    title: 'Webhook 测试',
    videoUrl: 'https://bilibili.com/video/BV1',
    fileName: 'Webhook 测试.md',
    markdown: '# note',
    generatedAt: '2026',
    providerName: 'DeepSeek',
    model: 'deepseek-v4-pro',
    mode: '标准',
    template: '学习笔记',
    tags: ['AI', '学习'],
    frontmatter: { project: 'b-note' },
    summaryChunks: 2,
    usage: { totalTokens: 10 },
    keyFrameCount: 2,
    keyFrames: [{ title: '开场', capturedAt: '2026' }],
  }
);
assert.equal(webhookCalls, 1);

let transcriptionAttempts = 0;
const progressMessages: string[] = [];
(globalThis as any).fetch = async (url: string, init?: RequestInit) => {
  transcriptionAttempts += 1;
  assert.match(String(url), /transcribe\.example\.com\/v1\/audio\/transcriptions/);
  assert.equal((init?.headers as Record<string, string>)?.Authorization, 'Bearer transcribe-key');
  if (transcriptionAttempts === 1) {
    return new Response('rate limited', { status: 429 });
  }
  return new Response(JSON.stringify({
    segments: [{ start: 1, end: 3, text: '重试成功' }],
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};
const retriedTranscript = await transcribeAudioBlob(
  new Blob(['audio'], { type: 'audio/mp4' }),
  { bvid: 'BVretry', cid: 1, title: '转写重试', duration: 10 },
  {
    apiKey: 'chat-key',
    baseUrl: 'https://chat.example.com/v1',
    model: 'x',
    transcriptionModel: 'whisper-1',
    transcriptionBaseUrl: 'https://transcribe.example.com/v1',
    transcriptionApiKey: 'transcribe-key',
  },
  { onProgress: (event) => progressMessages.push(event.message) }
);
assert.equal(transcriptionAttempts, 2);
assert.deepEqual(retriedTranscript, [{ from: 1, to: 3, content: '重试成功' }]);
assert.ok(progressMessages.some((message) => message.includes('第 2/3 次尝试')));

let workerCalls = 0;
(globalThis as any).fetch = async (url: string, init?: RequestInit) => {
  if (String(url).includes('/x/player/playurl')) {
    return new Response(JSON.stringify({
      code: 0,
      data: {
        dash: {
          audio: [
            {
              bandwidth: 64000,
              baseUrl: 'https://audio.example.com/main.m4a',
              backupUrl: ['https://audio.example.com/backup.m4a'],
              codecs: 'mp4a.40.2',
            },
          ],
        },
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  workerCalls += 1;
  assert.equal(url, 'http://127.0.0.1:8787/transcribe');
  const body = JSON.parse(String(init?.body || '{}'));
  assert.equal(body.video.bvid, 'BVworker');
  assert.equal(body.audioCandidates[0].urls[0], 'https://audio.example.com/main.m4a');
  assert.equal(body.model, 'whisper-large-v3');
  return new Response(JSON.stringify({
    segments: [{ from: 10, to: 12, content: 'Worker 成功' }],
  }), { status: 200, headers: { 'content-type': 'application/json' } });
};
const workerTranscript = await transcribeBilibiliAudio(
  { bvid: 'BVworker', cid: 2, title: 'Worker 转写', duration: 60 },
  {
    apiKey: '',
    baseUrl: '',
    model: 'x',
    transcriptionModel: 'whisper-large-v3',
    transcriptionWorkerUrl: 'http://127.0.0.1:8787/transcribe',
  }
);
assert.equal(workerCalls, 1);
assert.deepEqual(workerTranscript, [{ from: 10, to: 12, content: 'Worker 成功' }]);
(globalThis as any).fetch = originalFetch;

(globalThis as any).browser = undefined;
(globalThis as any).location = { href: 'http://preview.local/sidepanel.html?demo=1' };
ensureBrowserFallback();

const fallbackStorage = await (globalThis as any).browser.storage.local.get('b-note-latest-draft');
assert.match(fallbackStorage['b-note-latest-draft'].videoInfo.title, /b-note 本地预览示例/);
assert.equal(fallbackStorage['b-note-latest-draft'].keyFrames.length, 1);
assert.equal(fallbackStorage['b-note-latest-draft'].videoInfo.pages.length, 3);

await (globalThis as any).browser.storage.local.set({ sample: 123 });
assert.deepEqual(await (globalThis as any).browser.storage.local.get('sample'), { sample: 123 });

assert.deepEqual(await (globalThis as any).browser.runtime.sendMessage({ type: 'SEEK_TO_TIME', seconds: 1 }), { ok: true });
const previewP2 = await (globalThis as any).browser.runtime.sendMessage({ type: 'GET_SUBTITLES', page: 2 });
assert.equal(previewP2.video.page, 2);
assert.match(previewP2.video.title, /P2/);
assert.match(previewP2.text, /P2/);
const previewSummary = await (globalThis as any).browser.runtime.sendMessage({
  type: 'RUN_SUMMARIZE',
  videoTitle: previewP2.video.title,
  subtitleText: previewP2.text,
});
assert.match(previewSummary.result, /本地预览环境生成的模拟笔记/);
const previewSynthesis = await (globalThis as any).browser.runtime.sendMessage({
  type: 'SYNTHESIZE_COLLECTION',
  videoTitle: '合集',
  partNotes: [{ page: 1, title: 'P1', content: previewSummary.result }],
});
assert.match(previewSynthesis.result, /全集总览/);
const frame = await (globalThis as any).browser.runtime.sendMessage({ type: 'CAPTURE_FRAME', seconds: 8 });
assert.equal(frame.ok, true);
assert.equal(frame.seconds, 8);
assert.match(frame.dataUrl, /^data:image\/svg\+xml/);

await saveLatestDraft({
  videoInfo: { title: '关键帧持久化', bvid: 'BVkf', cid: 1, aid: 1, duration: 60, page: 1 },
  content: '# 关键帧持久化',
  source: 'cc',
  generatedAt: '2026-06-06T11:00:00.000Z',
  keyFrames: [
    { title: '合法帧', dataUrl: 'data:image/jpeg;base64,abc', capturedAt: '2026-06-06T11:01:00.000Z', seconds: 12 },
    { title: '坏帧', dataUrl: '', capturedAt: '2026-06-06T11:02:00.000Z', seconds: 13 },
  ],
});
const savedDraft = await loadLatestDraft();
assert.equal(savedDraft?.keyFrames?.length, 1);
assert.equal(savedDraft?.keyFrames?.[0].title, '合法帧');

console.log('regression tests passed');
