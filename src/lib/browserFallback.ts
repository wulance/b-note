import type { RuntimeMessage } from './messages';

const MEMORY_STORE = new Map<string, unknown>();

export function ensureBrowserFallback() {
  const root = globalThis as any;
  if (root.browser?.storage?.local && root.browser?.runtime) return;

  const fallbackApi = {
    storage: {
      local: {
        async get(key: string | string[] | Record<string, unknown> | null | undefined) {
          const keys = normalizeStorageKeys(key);
          if (!keys.length) return Object.fromEntries(MEMORY_STORE.entries());
          const result: Record<string, unknown> = {};
          for (const item of keys) {
            if (MEMORY_STORE.has(item)) {
              result[item] = MEMORY_STORE.get(item);
            }
          }
          return result;
        },
        async set(values: Record<string, unknown>) {
          Object.entries(values).forEach(([key, value]) => MEMORY_STORE.set(key, value));
        },
      },
    },
    runtime: {
      sendMessage: async (message: RuntimeMessage) => handlePreviewMessage(message),
      onMessage: {
        addListener: () => undefined,
      },
    },
  };

  root.browser = fallbackApi;
  root.chrome = {
    ...(root.chrome || {}),
    storage: fallbackApi.storage,
    runtime: fallbackApi.runtime,
  };

  seedPreviewData();
}

function normalizeStorageKeys(key: string | string[] | Record<string, unknown> | null | undefined): string[] {
  if (typeof key === 'string') return [key];
  if (Array.isArray(key)) return key;
  if (key && typeof key === 'object') {
    for (const [item, fallback] of Object.entries(key)) {
      if (!MEMORY_STORE.has(item)) MEMORY_STORE.set(item, fallback);
    }
    return Object.keys(key);
  }
  return [];
}

function handlePreviewMessage(message: RuntimeMessage) {
  if (message?.type === 'SEEK_TO_TIME') return { ok: true };
  if (message?.type === 'GET_SUBTITLES') {
    const page = Number.isFinite(Number(message.page)) ? Math.max(1, Number(message.page)) : 1;
    const video = createPreviewVideoInfo(page);
    const subtitles = [
      { from: 0, to: 8, content: `这是 P${video.page} 的本地预览字幕。` },
      { from: 12, to: 24, content: '真实扩展环境会读取 B 站 CC 字幕或 Whisper 转写。' },
      { from: 32, to: 46, content: '你可以用它检查分 P 切换后的布局状态。' },
    ];
    return {
      video,
      subtitles,
      text: subtitles.map((item) => `[${formatPreviewTime(item.from)} - ${formatPreviewTime(item.to)}] ${item.content}`).join('\n'),
      source: 'cc',
      cached: false,
    };
  }
  if (message?.type === 'RUN_SUMMARIZE') {
    const title = String(message.videoTitle || '本地预览视频');
    return {
      result: [
        `# ${title}`,
        '',
        '## 总述',
        '- 时间戳：[00:00 - 00:12]',
        '- 这是本地预览环境生成的模拟笔记，用于检查批量生成、阅读区和导出入口。',
        '',
        '## 关键结论',
        '- [00:12] 真实扩展环境会调用你配置的 AI API。',
      ].join('\n'),
      usage: { promptTokens: 120, completionTokens: 80, totalTokens: 200 },
      chunks: 1,
    };
  }
  if (message?.type === 'SYNTHESIZE_COLLECTION') {
    return {
      result: [
        '## 全集总览',
        '这个合集演示了 b-note 如何把多个分 P 汇总成一份统一笔记。',
        '',
        '## 跨 P 主题',
        '- P1-P3：字幕提取、AI 总结、导出复用形成完整工作流。',
        '',
        '## 统一行动清单',
        '1. 先提取字幕',
        '2. 再生成分 P 笔记',
        '3. 最后导出合集',
        '',
        '## 观看/复盘建议',
        '- 先看 P1 建立上下文，再按需定位后续分 P。',
      ].join('\n'),
      usage: { promptTokens: 300, completionTokens: 160, totalTokens: 460 },
      chunks: 1,
    };
  }
  if (message?.type === 'GENERATE_TAGS') {
    return {
      ok: true,
      tags: ['B站工具', 'AI总结', 'Obsidian'],
      usage: { promptTokens: 80, completionTokens: 20, totalTokens: 100 },
    };
  }
  if (message?.type === 'FETCH_MODELS') {
    return {
      ok: true,
      models: ['preview-fast', 'preview-large', 'preview-local'],
    };
  }
  if (message?.type === 'CAPTURE_FRAME') {
    return {
      ok: true,
      dataUrl: previewFrameDataUrl(),
      seconds: Number(message.seconds || 12),
      width: 640,
      height: 360,
    };
  }
  return { error: '当前是本地预览环境，无法连接真实 B 站页面或后台脚本' };
}

function createPreviewVideoInfo(page: number) {
  const pages = [
    { cid: 1, page: 1, duration: 180, part: '配置前奏' },
    { cid: 2, page: 2, duration: 220, part: '实操步骤' },
    { cid: 3, page: 3, duration: 160, part: '导出复盘' },
  ];
  const current = pages.find((item) => item.page === page) || pages[0];
  return {
    title: `b-note 本地预览示例 - P${current.page} ${current.part}`,
    bvid: 'BVpreview',
    cid: current.cid,
    aid: 1,
    duration: current.duration,
    page: current.page,
    pages,
  };
}

function seedPreviewData() {
  if (!shouldUseDemoData()) return;
  const latestDraftKey = 'b-note-latest-draft';
  if (MEMORY_STORE.has(latestDraftKey)) return;

  const draft = {
    videoInfo: {
      ...createPreviewVideoInfo(1),
    },
    content: [
      '# b-note 本地预览示例',
      '',
      '## 总览',
      '- 时间戳：[00:03 - 00:18]',
      '- 说明：这里展示生成后的阅读布局、目录、时间戳跳转和操作栏。',
      '',
      '## 自动关键帧',
      '- 时间戳：[01:05]',
      '- 要点：点击「自动帧」会按时间戳抓取预览图，本地预览会返回占位图。',
      '',
      '## 导出与分享',
      '- 时间戳：[02:20]',
      '- 要点：复制、导出、分享和 Obsidian 按钮使用同一份 Markdown。',
    ].join('\n'),
    source: 'cc',
    mode: 'standard',
    template: 'tutorial',
    usage: { promptTokens: 1200, completionTokens: 600, totalTokens: 1800 },
    providerId: 'deepseek',
    providerName: 'DeepSeek',
    model: 'deepseek-v4-pro',
    generatedTags: ['B站工具', 'AI总结', 'Obsidian'],
    keyFrames: [
      {
        title: '总览 [00:03]',
        dataUrl: previewFrameDataUrl(),
        seconds: 3,
        capturedAt: new Date().toISOString(),
      },
    ],
    generatedAt: new Date().toISOString(),
  };

  MEMORY_STORE.set(latestDraftKey, draft);
  MEMORY_STORE.set('b-note-history', [draft]);
}

function formatPreviewTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

function shouldUseDemoData(): boolean {
  try {
    return new URL(globalThis.location?.href || 'http://preview.local').searchParams.has('demo');
  } catch {
    return false;
  }
}

function previewFrameDataUrl(): string {
  return [
    'data:image/svg+xml;charset=utf-8,',
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#2563eb"/><stop offset="1" stop-color="#10b981"/></linearGradient></defs><rect width="640" height="360" rx="24" fill="url(#g)"/><text x="48" y="185" fill="white" font-family="system-ui, sans-serif" font-size="36" font-weight="700">b-note preview frame</text></svg>'
    ),
  ].join('');
}
