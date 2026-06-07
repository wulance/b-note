import { useMemo } from 'react';
import type { VideoInfo } from '@/src/lib/subtitle';
import { formatTime } from '@/src/lib/subtitle';
import type { SummaryMode, SummaryTemplate, TokenUsage } from '@/src/lib/summarizer';
import { getTemplateLabel } from '@/src/lib/summarizer';
import type { ObsidianConfig, TelegramConfig, WebhookConfig } from '@/src/lib/settings';
import {
  estimateUsageCost,
  formatEstimatedCost,
  type PricingConfig,
} from '@/src/lib/cost';
import {
  buildNoteMarkdown,
  formatGeneratedAt,
  formatUsage,
  getModeLabel,
  sanitizeFileName,
} from '@/src/lib/note';
import { buildNotePackageFiles } from '@/src/lib/notePackage';
import { createZipBlob } from '@/src/lib/zip';
import { buildShareHtml } from '@/src/lib/htmlExport';
import { parseExtraFrontmatter, parseFrontmatterFieldMap, parseTags } from '@/src/lib/frontmatter';
import { applyNoteTemplate } from '@/src/lib/noteTemplate';
import { publishToTelegraph } from '@/src/lib/telegraph';
import { publishToTelegram } from '@/src/lib/telegram';
import { publishToWebhook } from '@/src/lib/webhook';
import { extractMarkdownOutline } from '@/src/lib/markdown';
import {
  buildObsidianNotePath,
  buildObsidianRestNotePath,
  buildObsidianRestPayload,
  saveToObsidianRest,
} from '@/src/lib/obsidian';
import {
  KeyFrameStrip,
  MarkdownRenderer,
  OutlineBar,
  VideoChat,
  type ChatMessage,
  type KeyFrame,
} from '../NoteExperience';
import type { AppState, Status } from '../../types';

export function ActionBar({
  status,
  mode,
  onModeChange,
  template,
  onTemplateChange,
  onGenerate,
  onExtract,
  onSummarize,
  onBatchGenerate,
  hasSubtitles,
  hasResult,
  estimatedTokens,
  videoInfo,
  onSelectPage,
}: {
  status: Status;
  mode: SummaryMode;
  onModeChange: (m: SummaryMode) => void;
  template: SummaryTemplate;
  onTemplateChange: (template: SummaryTemplate) => void;
  onGenerate: () => void;
  onExtract: () => void;
  onSummarize: () => void;
  onBatchGenerate: () => void;
  hasSubtitles: boolean;
  hasResult: boolean;
  estimatedTokens: number | null;
  videoInfo: VideoInfo | null;
  onSelectPage: (page: number) => void;
}) {
  const isLoading = status === 'loading_subtitle' || status === 'summarizing';

  if (hasResult) {
    return (
      <div className="border-b border-slate-200 bg-white px-3 py-2">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <button
            onClick={onGenerate}
            disabled={isLoading}
            className="shrink-0 rounded-md bg-blue-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
          >
            {isLoading ? '生成中' : '重生成'}
          </button>
          <button
            onClick={() => onExtract()}
            disabled={isLoading}
            title="只获取当前视频字幕，不消耗总结 token"
            className="shrink-0 rounded-md bg-slate-100 px-2.5 py-1.5 text-[11px] font-medium text-slate-600 transition hover:bg-slate-200 disabled:opacity-50"
          >
            字幕
          </button>
          <span className="shrink-0 rounded-md bg-blue-50 px-2 py-1.5 text-[11px] font-semibold text-blue-700 ring-1 ring-blue-100">
            {getModeLabel(mode)}
          </span>
          <span className="shrink-0 rounded-md bg-emerald-50 px-2 py-1.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-100">
            {getTemplateLabel(template)}
          </span>
          <PartSelector videoInfo={videoInfo} disabled={isLoading} onSelectPage={onSelectPage} compact />
          <BatchButton videoInfo={videoInfo} disabled={isLoading} onBatchGenerate={onBatchGenerate} compact />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 border-b border-slate-200 bg-white px-3 py-3 shadow-sm">
      <div className="flex items-start gap-2">
        <PartSelector videoInfo={videoInfo} disabled={isLoading} onSelectPage={onSelectPage} />
        <BatchButton videoInfo={videoInfo} disabled={isLoading} onBatchGenerate={onBatchGenerate} />
      </div>
      <button
        onClick={onGenerate}
        disabled={isLoading}
        className="flex min-h-10 w-full items-center justify-center rounded-lg bg-blue-600 px-3 py-2.5 text-sm font-bold text-white shadow-sm shadow-blue-600/20 transition hover:bg-blue-700 disabled:opacity-50"
      >
        {status === 'loading_subtitle'
          ? '提取/转写中...'
          : status === 'summarizing'
            ? '生成中...'
            : '一键生成'}
      </button>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => onExtract()}
          disabled={isLoading}
          title="只获取当前视频字幕，不消耗总结 token"
          className="rounded-md bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-100 disabled:opacity-50"
        >
          {status === 'loading_subtitle' ? '提取/转写中...' : '1. 提取字幕'}
        </button>
        <button
          onClick={() => onSummarize()}
          disabled={!hasSubtitles || isLoading}
          title="使用当前字幕生成笔记，会调用已配置的 AI API"
          className="rounded-md bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-100 disabled:opacity-50"
        >
          {status === 'summarizing' ? '生成中...' : '2. AI 总结'}
        </button>
      </div>

      <div className="flex items-center justify-between text-[11px] text-slate-500">
        <span className="font-semibold text-slate-600">总结模式</span>
        <span className="font-medium text-slate-400">
          当前：{getModeLabel(mode)}
          {estimatedTokens ? ` · 输入约 ${estimatedTokens.toLocaleString()} tokens` : ''}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1 ring-1 ring-slate-200">
        {(['quick', 'standard', 'detailed'] as SummaryMode[]).map((m) => (
          <button
            key={m}
            aria-pressed={mode === m}
            onClick={() => onModeChange(m)}
            title={`切换为${getModeLabel(m)}模式`}
            className={`flex min-h-8 items-center justify-center gap-1 rounded-md px-2 py-1 text-xs transition ${
              mode === m
                ? 'bg-white font-bold text-blue-700 shadow-sm ring-1 ring-slate-200'
                : 'text-slate-500 hover:bg-white/60 hover:text-slate-800'
            }`}
          >
            {mode === m && <span className="text-[11px] leading-none">✓</span>}
            {mode === m ? `当前：${getModeLabel(m)}` : getModeLabel(m)}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between text-[11px] text-slate-500">
        <span className="font-semibold text-slate-600">笔记模板</span>
        <span className="font-medium text-slate-400">当前：{getTemplateLabel(template)}</span>
      </div>
      <div className="grid grid-cols-4 gap-1 rounded-lg bg-slate-100 p-1 ring-1 ring-slate-200">
        {(['study', 'tutorial', 'ideas', 'timeline'] as SummaryTemplate[]).map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={template === item}
            onClick={() => onTemplateChange(item)}
            className={`min-h-8 rounded-md px-1.5 py-1 text-[11px] transition ${
              template === item
                ? 'bg-white font-bold text-emerald-700 shadow-sm ring-1 ring-slate-200'
                : 'text-slate-500 hover:bg-white/60 hover:text-slate-800'
            }`}
          >
            {getTemplateLabel(item)}
          </button>
        ))}
      </div>
    </div>
  );
}

function BatchButton({
  videoInfo,
  disabled,
  onBatchGenerate,
  compact = false,
}: {
  videoInfo: VideoInfo | null;
  disabled: boolean;
  onBatchGenerate: () => void;
  compact?: boolean;
}) {
  const pages = videoInfo?.pages || [];
  if (pages.length <= 1) return null;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onBatchGenerate}
      title="逐个分 P 提取字幕并调用 AI 总结，会消耗更多 token"
      className={`${compact ? 'shrink-0' : 'shrink-0 self-stretch'} rounded-md bg-indigo-600 px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50`}
    >
      批量
    </button>
  );
}

function PartSelector({
  videoInfo,
  disabled,
  onSelectPage,
  compact = false,
}: {
  videoInfo: VideoInfo | null;
  disabled: boolean;
  onSelectPage: (page: number) => void;
  compact?: boolean;
}) {
  const pages = videoInfo?.pages || [];
  if (pages.length <= 1) return null;

  return (
    <div className={compact ? 'flex min-w-0 flex-1 items-center gap-2' : 'min-w-0 flex-1 rounded-md border border-slate-200 bg-slate-50 p-2'}>
      <div className="shrink-0 text-[11px] font-medium text-slate-500">分 P</div>
      <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
        {pages.map((page) => {
          const active = page.page === videoInfo?.page;
          return (
            <button
              key={`${page.page}:${page.cid}`}
              type="button"
              disabled={disabled || active}
              onClick={() => onSelectPage(page.page)}
              title={page.part || `P${page.page}`}
              className={`shrink-0 rounded-md px-2 py-1 text-[11px] transition ${
                active
                  ? 'bg-blue-600 font-semibold text-white'
                  : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50'
              }`}
            >
              P{page.page}
              {page.part ? ` ${page.part}` : ''}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ContentArea({
  state,
  obsidian,
  telegram,
  webhook,
  pricing,
  onNotice,
  keyFrames,
  chatMessages,
  chatStatus,
  onAskVideo,
  onCaptureFrame,
  onAutoCaptureFrames,
  onRecaptureKeyFrame,
  onDeleteKeyFrame,
  frameStatus,
}: {
  state: AppState;
  obsidian: ObsidianConfig;
  telegram: TelegramConfig;
  webhook: WebhookConfig;
  pricing: PricingConfig;
  onNotice: (message: string | null) => void;
  keyFrames: KeyFrame[];
  chatMessages: ChatMessage[];
  chatStatus: 'idle' | 'asking';
  onAskVideo: (question: string) => void;
  onCaptureFrame: () => void;
  onAutoCaptureFrames: () => void;
  onRecaptureKeyFrame: (index: number, seconds: number) => void;
  onDeleteKeyFrame: (index: number) => void;
  frameStatus: 'idle' | 'capturing';
}) {
  const outline = useMemo(
    () => (state.result != null ? extractMarkdownOutline(state.result) : []),
    [state.result]
  );

  if (state.status === 'loading_subtitle') {
    return (
      <div className="flex flex-1 items-center justify-center bg-slate-50">
        <div className="w-full max-w-xs rounded-lg border border-blue-100 bg-white px-4 py-4 text-center shadow-sm">
          <div className="mx-auto mb-3 h-6 w-6 rounded-full border-2 border-blue-200 border-t-blue-600 animate-spin" />
          <p className="text-sm font-semibold text-slate-700">正在提取字幕</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">如果当前视频没有 CC 字幕，会尝试使用可用的备用内容。</p>
        </div>
      </div>
    );
  }

  if (state.status === 'summarizing' && state.result == null) {
    return (
      <div className="flex flex-1 items-center justify-center bg-slate-50">
        <div className="text-center text-slate-400">
          <div className="w-6 h-6 mx-auto mb-2 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
          <p className="text-sm">AI 正在分析视频内容...</p>
        </div>
      </div>
    );
  }

  if (state.result != null) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-50">
        <ResultActions
          content={state.result}
          videoTitle={state.videoInfo?.title || 'B站视频笔记'}
          videoUrl={state.videoInfo?.bvid ? `https://www.bilibili.com/video/${state.videoInfo.bvid}` : null}
          mode={state.generatedMode || 'standard'}
          template={state.generatedTemplate || 'study'}
          generatedAt={state.generatedAt}
          usage={state.usage}
          providerName={state.generatedProviderName}
          model={state.generatedModel}
          summaryChunks={state.summaryChunks}
          keyFrames={keyFrames}
          obsidian={obsidian}
          telegram={telegram}
          webhook={webhook}
          pricing={pricing}
          onNotice={onNotice}
          onCaptureFrame={onCaptureFrame}
          onAutoCaptureFrames={onAutoCaptureFrames}
          frameStatus={frameStatus}
        />
        {state.status === 'summarizing' && (
          <div className="shrink-0 border-b border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700">
            AI 正在生成笔记，内容会逐段显示...
          </div>
        )}
        {state.status !== 'summarizing' && frameStatus === 'capturing' && (
          <div className="shrink-0 border-b border-emerald-100 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
            笔记文字已完成，关键画面正在后台补齐；稍后导入 Obsidian 会包含更多图片。
          </div>
        )}
        <div className="flex min-h-0 flex-1 flex-col">
          {outline.length > 0 && <OutlineBar outline={outline} />}
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 scroll-pt-20">
            <MarkdownRenderer content={state.result} frames={keyFrames} />
            <KeyFrameStrip
              frames={keyFrames}
              frameStatus={frameStatus}
              onRecapture={onRecaptureKeyFrame}
              onDelete={onDeleteKeyFrame}
            />
            <VideoChat
              messages={chatMessages}
              status={chatStatus}
              onAsk={onAskVideo}
            />
          </div>
        </div>
      </div>
    );
  }

  if (state.subtitles) {
    return (
      <div className="flex-1 overflow-y-auto bg-slate-50 px-3 py-3">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">字幕预览</h3>
        <div className="space-y-1 rounded-lg border border-slate-200 bg-white p-3">
          {state.subtitles.slice(0, 50).map((s, i) => (
            <div key={i} className="flex gap-2 text-xs">
              <span className="shrink-0 font-mono text-slate-400">
                {formatTime(s.from)}
              </span>
              <span className="leading-relaxed text-slate-700">{s.content}</span>
            </div>
          ))}
          {state.subtitles.length > 50 && (
            <p className="pt-1 text-xs text-slate-400">
              ... 还有 {state.subtitles.length - 50} 条
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-slate-50 px-6">
      <div className="text-center text-slate-400">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-white text-lg shadow-sm ring-1 ring-slate-200">
          B
        </div>
        <p className="text-sm font-medium text-slate-500">打开 B 站视频页面</p>
        <p className="mt-1 text-xs">点击「一键生成」开始</p>
      </div>
    </div>
  );
}

function ResultActions({
  content,
  videoTitle,
  videoUrl,
  mode,
  template,
  generatedAt,
  usage,
  providerName,
  model,
  summaryChunks,
  keyFrames,
  obsidian,
  telegram,
  webhook,
  pricing,
  onNotice,
  onCaptureFrame,
  onAutoCaptureFrames,
  frameStatus,
}: {
  content: string;
  videoTitle: string;
  videoUrl: string | null;
  mode: SummaryMode;
  template: SummaryTemplate;
  generatedAt: string | null;
  usage: TokenUsage | null;
  providerName: string | null;
  model: string | null;
  summaryChunks: number | null;
  keyFrames: KeyFrame[];
  obsidian: ObsidianConfig;
  telegram: TelegramConfig;
  webhook: WebhookConfig;
  pricing: PricingConfig;
  onNotice: (message: string | null) => void;
  onCaptureFrame: () => void;
  onAutoCaptureFrames: () => void;
  frameStatus: 'idle' | 'capturing';
}) {
  const frontmatterOptions = useMemo(() => ({
    tags: parseTags(obsidian.tags),
    extraFrontmatter: parseExtraFrontmatter(obsidian.frontmatter),
    fieldMap: parseFrontmatterFieldMap(obsidian.fieldMapping),
  }), [obsidian.fieldMapping, obsidian.frontmatter, obsidian.tags]);

  const markdown = useMemo(() => buildNoteMarkdown({
    videoTitle,
    videoUrl,
    content,
    mode,
    template,
    generatedAt,
    usage,
    providerName,
    model,
    keyFrames,
    pricing,
    ...frontmatterOptions,
  }), [content, frontmatterOptions, generatedAt, keyFrames, mode, model, pricing, providerName, template, usage, videoTitle, videoUrl]);

  const templatedMarkdown = useMemo(() => applyNoteTemplate(obsidian.noteTemplate, {
    title: videoTitle,
    content: markdown,
    url: videoUrl,
    generatedAt: formatGeneratedAt(generatedAt),
    mode: getModeLabel(mode),
    template: getTemplateLabel(template),
    model: [providerName, model].filter(Boolean).join(' / ') || '未知',
  }), [generatedAt, markdown, mode, model, obsidian.noteTemplate, providerName, template, videoTitle, videoUrl]);

  const fileName = useMemo(() => `${sanitizeFileName(videoTitle)}.md`, [videoTitle]);
  const estimatedCostText = useMemo(() => {
    const estimatedCost = estimateUsageCost(usage, pricing);
    return formatEstimatedCost(estimatedCost, pricing.currency);
  }, [pricing, usage]);

  const copyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(templatedMarkdown);
      onNotice('已复制 Markdown 笔记');
    } catch {
      onNotice('复制失败，请检查浏览器剪贴板权限');
    }
  };

  const downloadMarkdown = () => {
    const blob = new Blob([templatedMarkdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
    onNotice('已导出 Markdown 文件');
  };

  const downloadPackage = () => {
    const files = buildNotePackageFiles({
      videoTitle,
      videoUrl,
      content,
      mode,
      template,
      generatedAt,
      usage,
      providerName,
      model,
      keyFrames,
      pricing,
      ...frontmatterOptions,
    });
    const blob = createZipBlob(files);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${sanitizeFileName(videoTitle)}-资料包.zip`;
    link.click();
    URL.revokeObjectURL(url);
    onNotice(keyFrames.length ? '已导出 Markdown + 关键画面资料包' : '已导出 Markdown 资料包');
  };

  const downloadHtml = () => {
    const html = buildShareHtml({
      videoTitle,
      videoUrl,
      content,
      mode,
      template,
      generatedAt,
      usage,
      providerName,
      model,
      keyFrames,
      pricing,
    });
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${sanitizeFileName(videoTitle)}.html`;
    link.click();
    URL.revokeObjectURL(url);
    onNotice('已导出静态 HTML 分享页');
  };

  const publishTelegraph = async () => {
    try {
      onNotice('正在发布到 Telegraph...');
      const url = await publishToTelegraph({
        title: videoTitle,
        authorName: 'b-note',
        videoUrl,
        content: markdown,
        images: keyFrames.map((frame) => ({ title: frame.title, dataUrl: frame.dataUrl })),
      });
      await navigator.clipboard.writeText(url).catch(() => undefined);
      onNotice(`Telegraph 已发布${keyFrames.length ? `，已尝试上传 ${keyFrames.length} 张关键画面` : ''}；长文会生成可阅读目录，链接已复制：${url}`);
    } catch (error: any) {
      onNotice(`Telegraph 发布失败：${error?.message || '未知错误'}。可改用 HTML 或资料包导出。`);
    }
  };

  const publishTelegram = async () => {
    try {
      onNotice('正在发送到 Telegram...');
      const chunks = await publishToTelegram({
        botToken: telegram.botToken,
        chatId: telegram.chatId,
        title: videoTitle,
        text: templatedMarkdown,
        images: keyFrames.map((frame) => ({ title: frame.title, dataUrl: frame.dataUrl })),
      });
      onNotice(`Telegram 已发送：${chunks} 条消息${keyFrames.length ? `，${keyFrames.length} 张关键画面` : ''}`);
    } catch (error: any) {
      onNotice(`Telegram 发送失败：${error?.message || '未知错误'}`);
    }
  };

  const publishWebhook = async () => {
    try {
      onNotice('正在发送到 Webhook...');
      await publishToWebhook(webhook, {
        title: videoTitle,
        videoUrl,
        fileName,
        markdown: templatedMarkdown,
        generatedAt,
        providerName,
        model,
        mode: getModeLabel(mode),
        template: getTemplateLabel(template),
        tags: frontmatterOptions.tags,
        frontmatter: frontmatterOptions.extraFrontmatter,
        summaryChunks,
        usage,
        keyFrameCount: keyFrames.length,
        keyFrames: keyFrames.map((frame) => ({
          title: frame.title,
          capturedAt: frame.capturedAt,
        })),
      });
      onNotice('Webhook 已发送');
    } catch (error: any) {
      onNotice(`Webhook 发送失败：${error?.message || '未知错误'}`);
    }
  };

  const shareMarkdown = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: videoTitle,
          text: templatedMarkdown,
          url: videoUrl || undefined,
        });
        onNotice('已打开系统分享面板');
        return;
      }
      await navigator.clipboard.writeText(templatedMarkdown);
      onNotice('当前浏览器不支持系统分享，已复制 Markdown');
    } catch (error: any) {
      if (error?.name === 'AbortError') return;
      try {
        await navigator.clipboard.writeText(templatedMarkdown);
        onNotice('分享未完成，已复制 Markdown');
      } catch {
        onNotice('分享失败，请尝试复制或导出');
      }
    }
  };

  const saveToObsidian = async () => {
    const noteName = fileName.replace(/\.md$/i, '');
    if (frameStatus === 'capturing') {
      onNotice(`关键画面仍在抓取，已完成 ${keyFrames.length} 张；等完成后再导入 Obsidian 可包含全部图片。`);
      return;
    }
    if (obsidian.syncMode === 'rest') {
      const notePath = buildObsidianRestNotePath(obsidian, noteName);
      try {
        const payload = buildObsidianRestPayload(notePath, templatedMarkdown, keyFrames);
        onNotice(payload.attachments.length ? '正在写入 Obsidian 和关键画面...' : '正在写入 Obsidian...');
        await saveToObsidianRest({
          config: obsidian,
          filePath: notePath,
          content: payload.content,
          attachments: payload.attachments,
        });
        onNotice(`已写入 Obsidian：${notePath}${payload.attachments.length ? `（含 ${payload.attachments.length} 张图）` : ''}`);
      } catch (error: any) {
        onNotice(`Obsidian 写入失败：${error?.message || '未知错误'}`);
      }
      return;
    }

    const notePath = buildObsidianNotePath(obsidian.folder, noteName);
    const params = new URLSearchParams();
    params.set('name', notePath.replace(/\.md$/i, ''));
    params.set('content', templatedMarkdown);
    if (obsidian.vault.trim()) {
      params.set('vault', obsidian.vault.trim());
    }
    window.location.href = `obsidian://new?${params.toString()}`;
    onNotice('已唤起 Obsidian，新笔记内容已带入');
  };

  return (
    <div className="shrink-0 border-b border-slate-200 bg-white px-3 py-2 shadow-sm">
      <div className="flex min-w-0 items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-bold text-slate-900">{fileName}</div>
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 overflow-hidden text-[10px] text-slate-400">
            <span className="shrink-0">{getModeLabel(mode)}</span>
            <span className="shrink-0">·</span>
            <span className="shrink-0">{getTemplateLabel(template)}</span>
            {providerName || model ? (
              <>
                <span className="shrink-0">·</span>
                <span className="truncate">{[providerName, model].filter(Boolean).join(' / ')}</span>
              </>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={copyMarkdown}
            className="rounded-md bg-slate-100 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-200"
          >
            复制
          </button>
          <button
            onClick={onCaptureFrame}
            disabled={frameStatus === 'capturing'}
            className="rounded-md bg-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-100 transition hover:bg-emerald-100 disabled:opacity-60"
          >
            {frameStatus === 'capturing' ? '抓取中' : '截图'}
          </button>
          <button
            onClick={onAutoCaptureFrames}
            disabled={frameStatus === 'capturing'}
            className="rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
          >
            自动
          </button>
          <button
            onClick={saveToObsidian}
            disabled={frameStatus === 'capturing'}
            className="rounded-md bg-blue-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {frameStatus === 'capturing' ? '等截图' : 'Obsidian'}
          </button>
        </div>
      </div>
      <details className="group mt-2 rounded-lg border border-slate-200 bg-slate-50/80 px-2 py-1.5">
        <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-semibold text-slate-600 [&::-webkit-details-marker]:hidden">
          详情 / 导出与发布
          <span className="text-[10px] text-slate-400 group-open:hidden">展开</span>
          <span className="hidden text-[10px] text-slate-400 group-open:inline">收起</span>
        </summary>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
          <span>{formatGeneratedAt(generatedAt)}</span>
          <span>{formatUsage(usage)}</span>
          <span>{estimatedCostText}</span>
          {summaryChunks && summaryChunks > 1 && <span>分 {summaryChunks} 段处理</span>}
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          <button onClick={downloadMarkdown} className="rounded-md bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-100">
            MD
          </button>
          <button onClick={downloadPackage} className="rounded-md bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-100">
            资料包
          </button>
          <button onClick={downloadHtml} className="rounded-md bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-100">
            HTML
          </button>
          <button onClick={shareMarkdown} className="rounded-md bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-100">
            分享
          </button>
          <button onClick={publishTelegraph} className="rounded-md bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-100">
            Telegraph
          </button>
          <button onClick={publishTelegram} className="rounded-md bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-100">
            TG
          </button>
          <button onClick={publishWebhook} className="rounded-md bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-100">
            Webhook
          </button>
        </div>
      </details>
    </div>
  );
}
