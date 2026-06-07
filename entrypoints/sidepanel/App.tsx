import { useState, useEffect, useMemo, useRef } from 'react';
import type { VideoInfo } from '@/src/lib/subtitle';
import type { SummaryMode, SummaryTemplate, AIConfig, TokenUsage } from '@/src/lib/summarizer';
import { estimateTokenCount, summarizeStream } from '@/src/lib/summarizer';
import { PROVIDERS } from '@/src/lib/providers';
import {
  type PricingConfig,
} from '@/src/lib/cost';
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type AppSettings,
  type ObsidianConfig,
  type TelegramConfig,
  type WebhookConfig,
} from '@/src/lib/settings';
import {
  appendNoteHistory,
  loadLatestDraft,
  loadNoteHistory,
  saveLatestDraft,
  type SavedNoteDraft,
} from '@/src/lib/drafts';
import { buildNoteMarkdown, formatGeneratedAt, formatUsage, getModeLabel } from '@/src/lib/note';
import { buildCollectionMarkdown, mergeTokenUsage, type CollectionPartNote } from '@/src/lib/collectionNote';
import { ensureKeyFrameMarkers, extractKeyFrameTargets } from '@/src/lib/markdown';
import { normalizeKeyFrames } from '@/src/lib/keyFrames';
import { sendRuntimeMessage } from '@/src/lib/extensionApi';
import type { RuntimeErrorResponse, SubtitleResponse, SummaryResponse } from '@/src/lib/messages';
import {
  type ChatMessage,
  type KeyFrame,
} from './components/NoteExperience';
import { Header, StatusPanel } from './components/app-shell';
import { ConfigPanel } from './components/settings';
import { ActionBar, ContentArea } from './components/workflow';
import { useKeyFrames } from './hooks/useKeyFrames';
import type { AppState, AppView, ExtractedSubtitleResult, Status } from './types';

export default function App() {
  const [state, setState] = useState<AppState>({
    status: 'idle',
    videoInfo: null,
    subtitles: null,
    subtitleText: null,
    subtitleSource: null,
    result: null,
    generatedMode: null,
    generatedTemplate: null,
    generatedAt: null,
    usage: null,
    generatedProviderName: null,
    generatedModel: null,
    summaryChunks: null,
    error: null,
  });

  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [settingsReady, setSettingsReady] = useState(false);
  const [mode, setMode] = useState<SummaryMode>('standard');
  const [template, setTemplate] = useState<SummaryTemplate>('study');
  const [notice, setNotice] = useState<string | null>(null);
  const [activityLog, setActivityLog] = useState<string[]>([]);
  const [history, setHistory] = useState<SavedNoteDraft[]>([]);
  const [activeView, setActiveView] = useState<AppView>('summary');
  const [apiTestStatus, setApiTestStatus] = useState<'idle' | 'testing'>('idle');
  const [lastApiTestUsage, setLastApiTestUsage] = useState<TokenUsage | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatStatus, setChatStatus] = useState<'idle' | 'asking'>('idle');
  const requestSeqRef = useRef(0);

  // 当前选中的预设
  const providerId = settings.providerId;
  const config = settings.aiConfig;
  const obsidian = settings.obsidian;
  const telegram = settings.telegram;
  const webhook = settings.webhook;
  const pricing = settings.pricing;
  const provider = PROVIDERS.find((p) => p.id === providerId) || PROVIDERS[0];
  const estimatedSubtitleTokens = useMemo(
    () => (state.subtitleText ? estimateTokenCount(state.subtitleText) : null),
    [state.subtitleText]
  );

  useEffect(() => {
    loadSettings()
      .then((loaded) => {
        const normalized = normalizeProviderSettings(loaded);
        setSettings(normalized);
        setMode(normalized.summaryMode);
        setTemplate(normalized.summaryTemplate);
      })
      .catch(() => setNotice('配置读取失败，已使用默认配置'))
      .finally(() => setSettingsReady(true));
  }, []);

  useEffect(() => {
    Promise.all([loadLatestDraft(), loadNoteHistory()])
      .then(([draft, drafts]) => {
        setHistory(drafts);
        if (!draft) return;
        setState((s) => ({
          ...s,
          status: 'done',
          videoInfo: draft.videoInfo,
          subtitleSource: draft.source,
          result: draft.content,
          generatedMode: draft.mode || 'standard',
          generatedTemplate: draft.template || 'study',
          generatedAt: draft.generatedAt,
          usage: draft.usage || null,
          generatedProviderName: draft.providerName || null,
          generatedModel: draft.model || null,
          summaryChunks: null,
        }));
        setKeyFrames(normalizeKeyFrames(draft.keyFrames));
        setNotice(`已恢复最近一次生成的笔记：${new Date(draft.generatedAt).toLocaleString()}`);
      })
      .catch((error) => console.error('[b-note] failed to load latest draft', error));
  }, []);

  useEffect(() => {
    if (!settingsReady) return;
    saveSettings(settings).catch(() => setNotice('配置保存失败，请稍后重试'));
  }, [settings, settingsReady]);

  useEffect(() => {
    if (!notice) return;
    const isFailure = /失败|错误|无效|超时/.test(notice);
    const timer = window.setTimeout(() => setNotice(null), isFailure ? 7000 : 3800);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const updateConfig = (nextConfig: AIConfig) => {
    setSettings((current) => ({ ...current, aiConfig: nextConfig }));
  };

  const updateObsidian = (nextObsidian: ObsidianConfig) => {
    setSettings((current) => ({ ...current, obsidian: nextObsidian }));
  };

  const updateTelegram = (nextTelegram: TelegramConfig) => {
    setSettings((current) => ({ ...current, telegram: nextTelegram }));
  };

  const updateWebhook = (nextWebhook: WebhookConfig) => {
    setSettings((current) => ({ ...current, webhook: nextWebhook }));
  };

  const updatePricing = (nextPricing: PricingConfig) => {
    setSettings((current) => ({ ...current, pricing: nextPricing }));
  };

  const updateAutoCaptureKeyFrames = (autoCaptureKeyFrames: boolean) => {
    setSettings((current) => ({ ...current, autoCaptureKeyFrames }));
  };

  const updateMode = (nextMode: SummaryMode) => {
    setMode(nextMode);
    setSettings((current) => ({ ...current, summaryMode: nextMode }));
  };

  const updateTemplate = (nextTemplate: SummaryTemplate) => {
    setTemplate(nextTemplate);
    setSettings((current) => ({ ...current, summaryTemplate: nextTemplate }));
  };

  const addLog = (message: string) => {
    const time = new Date().toLocaleTimeString();
    setActivityLog((logs) => [`${time} ${message}`, ...logs].slice(0, 6));
  };

  const nextRequestSeq = () => {
    requestSeqRef.current += 1;
    return requestSeqRef.current;
  };

  const isStaleRequest = (requestSeq: number) => requestSeq !== requestSeqRef.current;

  // 切换预设时自动填充
  const selectProvider = (id: string) => {
    const p = PROVIDERS.find((pr) => pr.id === id)!;
    setSettings((current) => ({
      ...current,
      providerId: id,
      aiConfig: {
        apiKey: current.aiConfig.apiKey,
        baseUrl: p.baseUrl,
        model: p.defaultModel,
        transcriptionModel: current.aiConfig.transcriptionModel || 'whisper-1',
        transcriptionBaseUrl: current.aiConfig.transcriptionBaseUrl || '',
        transcriptionApiKey: current.aiConfig.transcriptionApiKey || '',
        transcriptionWorkerUrl: current.aiConfig.transcriptionWorkerUrl || '',
      },
    }));
  };

  const testApiConfig = async () => {
    const normalizedSettings = normalizeProviderSettings(settings);
    const requestConfig = normalizedSettings.aiConfig;
    const requestProvider = PROVIDERS.find((p) => p.id === normalizedSettings.providerId) || provider;
    if (!requestConfig.apiKey.trim() && requestProvider.id !== 'ollama') {
      setNotice('请先配置 API Key 后再测试');
      addLog('API 测试未开始：缺少 API Key');
      return;
    }

    setApiTestStatus('testing');
    setNotice(null);
    addLog(`开始 API 测试：${requestConfig.model}`);
    try {
      const response = await sendRuntimeMessage<{ ok: true; usage: TokenUsage | null } | RuntimeErrorResponse>({
        type: 'TEST_AI_CONFIG',
        config: requestConfig,
      });
      if ('error' in response) {
        setNotice(`API 测试失败：${response.error}`);
        addLog(`API 测试失败：${response.error}`);
        return;
      }
      const usage = response.usage || null;
      setLastApiTestUsage(usage);
      setNotice(`API 测试成功：${requestProvider.name} / ${requestConfig.model}，${formatUsage(usage)}`);
      addLog(`API 测试成功：${formatUsage(usage)}`);
    } catch (e: any) {
      setNotice(`API 测试失败：${e?.message || '未知错误'}`);
      addLog(`API 测试失败：${e?.message || '未知错误'}`);
    } finally {
      setApiTestStatus('idle');
    }
  };

  const extractSubtitles = async (requestSeq = nextRequestSeq(), page?: number): Promise<ExtractedSubtitleResult | null> => {
    console.log('[b-note] extract subtitles start');
    addLog(page ? `开始提取 P${page} 字幕` : '开始提取字幕');
    setNotice(null);
    setState((s) => ({
      ...s,
      status: 'loading_subtitle',
      result: null,
      generatedMode: null,
      generatedTemplate: null,
      generatedAt: null,
      usage: null,
      generatedProviderName: null,
      generatedModel: null,
      summaryChunks: null,
      error: null,
    }));
    try {
      const response = await sendRuntimeMessage<SubtitleResponse | RuntimeErrorResponse>({ type: 'GET_SUBTITLES', config, page });
      if (isStaleRequest(requestSeq)) {
        addLog('已忽略过期字幕结果');
        return null;
      }
      if ('error' in response) {
        setState((s) => ({
          ...s,
          status: 'error',
          error: response.error,
          videoInfo: response.video || null,
        }));
        addLog(`字幕提取失败：${response.error}`);
        return null;
      }

      const extracted: ExtractedSubtitleResult = {
        videoInfo: response.video,
        subtitles: response.subtitles,
        subtitleText: response.text,
        subtitleSource: response.source || 'cc',
        cached: !!response.cached,
        cachedAt: response.cachedAt || null,
      };

      setState((s) => ({
        ...s,
        status: 'ready',
        videoInfo: extracted.videoInfo,
        subtitles: extracted.subtitles,
        subtitleText: extracted.subtitleText,
        subtitleSource: extracted.subtitleSource,
        result: null,
        generatedMode: null,
        generatedTemplate: null,
        generatedAt: null,
        usage: null,
        generatedProviderName: null,
        generatedModel: null,
        error: null,
      }));
      console.log('[b-note] extract subtitles done', {
        title: extracted.videoInfo.title,
        count: extracted.subtitles.length,
        source: extracted.subtitleSource,
      });
      addLog(`字幕就绪：${extracted.subtitles.length} 条，来源 ${extracted.subtitleSource === 'whisper' ? 'Whisper' : 'CC'}`);
      if (Array.isArray(response.transcriptionLogs) && response.transcriptionLogs.length) {
        response.transcriptionLogs.slice(-4).forEach((item: string) => addLog(item));
      }
      if (extracted.cached) {
        setNotice(`已使用字幕缓存：${formatGeneratedAt(extracted.cachedAt)}`);
      }
      return extracted;
    } catch (e: any) {
      console.error('[b-note] extract subtitles failed', e);
      if (isStaleRequest(requestSeq)) {
        addLog('已忽略过期字幕错误');
        return null;
      }
      addLog(`字幕提取失败：${e?.message || '未知错误'}`);
      setState((s) => ({
        ...s,
        status: 'error',
        error: e?.message || '提取失败：请刷新B站视频页面后重试',
      }));
      return null;
    }
  };

  const selectVideoPage = async (page: number) => {
    if (state.status === 'loading_subtitle' || state.status === 'summarizing') return;
    if (state.videoInfo?.page === page && state.subtitles?.length) return;
    setChatMessages([]);
    setKeyFrames([]);
    const extracted = await extractSubtitles(nextRequestSeq(), page);
    if (extracted) {
      setNotice(`已切换到 P${page}，字幕已就绪`);
    }
  };

  const runSummarize = async (input?: ExtractedSubtitleResult | null, requestSeq = nextRequestSeq()) => {
    const subtitleText = input?.subtitleText || state.subtitleText;
    const videoInfo = input?.videoInfo || state.videoInfo;
    if (!subtitleText || !videoInfo) return;
    const normalizedSettings = normalizeProviderSettings(settings);
    const requestConfig = normalizedSettings.aiConfig;
    const requestProvider = PROVIDERS.find((p) => p.id === normalizedSettings.providerId) || provider;
    if (!requestConfig.apiKey.trim() && requestProvider.id !== 'ollama') {
      setState((s) => ({ ...s, status: 'error', error: '请先配置 API Key' }));
      return;
    }

    setNotice(null);
    addLog(`开始 AI 总结：${requestConfig.model}`);
    console.log('[b-note] summarize start', {
      title: videoInfo.title,
      mode,
      model: requestConfig.model,
      baseUrl: requestConfig.baseUrl,
    });
    const generatedAt = new Date().toISOString();
    setKeyFrames([]);
    setState((s) => ({
      ...s,
      status: 'summarizing',
      result: '',
      generatedMode: mode,
      generatedTemplate: template,
      generatedAt,
      usage: null,
      generatedProviderName: requestProvider.name,
      generatedModel: requestConfig.model,
      summaryChunks: null,
      error: null,
    }));
    try {
      const captured: KeyFrame[] = [];
      const queuedSeconds = new Set<number>();
      let frameQueue = Promise.resolve();
      const autoCaptureFrames = settings.autoCaptureKeyFrames;
      const queueFrameCapture = (content: string) => {
        if (!autoCaptureFrames) return;
        const targets = extractKeyFrameTargets(content, 6);
        for (const target of targets) {
          const key = Math.round(target.seconds);
          if (queuedSeconds.has(key)) continue;
          queuedSeconds.add(key);
          frameQueue = frameQueue.then(async () => {
            if (isStaleRequest(requestSeq)) return;
            setFrameStatus('capturing');
            try {
              const currentIndex = captured.length + 1;
              const totalCount = Math.min(queuedSeconds.size, 6);
              setNotice(`正在同步关键画面 ${currentIndex}/${totalCount}：${target.label}`);
              const frame = await requestKeyFrame(target.seconds, target.title, target.seconds);
              if (!frame) return;
              captured.push(frame);
              setKeyFrames([...captured]);
              addLog(`关键画面已抓取：${target.label}`);
            } catch (frameError: any) {
              addLog(`跳过 ${target.label}：${frameError?.message || '截图失败'}`);
            }
          });
        }
      };

      const response = await summarizeStream(
        subtitleText,
        videoInfo.title,
        mode,
        requestConfig,
        template,
        ({ content, usage }) => {
          if (isStaleRequest(requestSeq)) return;
          queueFrameCapture(content);
          setState((s) => ({
            ...s,
            status: 'summarizing',
            result: content,
            usage: usage || s.usage,
          }));
        }
      );
      if (isStaleRequest(requestSeq)) {
        addLog('已忽略过期总结结果');
        return;
      }
      const finalContent = ensureKeyFrameMarkers(response.content, 6);
      queueFrameCapture(finalContent);
      if (!finalContent.trim()) {
        throw new Error('流式总结没有返回内容，请稍后重试');
      }
      const draft: SavedNoteDraft = {
        videoInfo,
        content: finalContent,
        source: input?.subtitleSource || state.subtitleSource,
        mode,
        template,
        usage: response.usage || null,
        providerId: requestProvider.id,
        providerName: requestProvider.name,
        model: requestConfig.model,
        keyFrames: [],
        generatedAt,
      };
      await saveLatestDraft(draft);
      setHistory(await appendNoteHistory(draft));
      setState((s) => ({
        ...s,
        status: 'done',
        result: finalContent,
        generatedMode: mode,
        generatedTemplate: template,
        generatedAt,
        usage: response.usage || null,
        generatedProviderName: requestProvider.name,
        generatedModel: requestConfig.model,
        summaryChunks: response.chunks || null,
      }));
      if (autoCaptureFrames) {
        setNotice('笔记已生成，关键画面会继续后台补齐');
        frameQueue
          .then(async () => {
            if (isStaleRequest(requestSeq)) return;
            setFrameStatus('idle');
            if (captured.length) {
              const draftWithFrames = { ...draft, keyFrames: captured };
              await saveLatestDraft(draftWithFrames);
              setHistory(await appendNoteHistory(draftWithFrames));
              setNotice(`笔记已生成，已同步 ${captured.length} 张关键画面`);
              addLog(`自动关键画面完成：${captured.length} 张`);
            } else if (extractKeyFrameTargets(finalContent, 1).length > 0) {
              setNotice('笔记已生成，但自动抓图失败；可点「截图」或「自动」重试');
              addLog('自动关键画面失败：没有成功截图');
            }
          })
          .catch((frameError: any) => {
            setFrameStatus('idle');
            addLog(`自动关键画面失败：${frameError?.message || '未知错误'}`);
          });
      } else {
        setNotice('笔记已生成，已按设置跳过自动截图');
        addLog('自动关键画面已关闭，可手动点击「截图」或「自动」');
      }
      addLog(
        `笔记已生成：${getModeLabel(mode)} / ${requestConfig.model}，${formatUsage(response.usage || null)}${
          response.chunks && response.chunks > 1 ? `，分 ${response.chunks} 段处理` : ''
        }`
      );
      console.log('[b-note] summarize done', { title: videoInfo.title });
    } catch (e: any) {
      console.error('[b-note] summarize failed', e);
      setFrameStatus('idle');
      if (isStaleRequest(requestSeq)) {
        addLog('已忽略过期总结错误');
        return;
      }
      addLog(`AI 总结失败：${e?.message || '未知错误'}`);
      setState((s) => ({ ...s, status: 'error', error: e?.message || '总结失败' }));
    }
  };

  const generateNote = async () => {
    console.log('[b-note] one-click generate start');
    const requestSeq = nextRequestSeq();
    addLog('开始一键生成');
    const existing =
      state.subtitleText && state.videoInfo
        ? {
            videoInfo: state.videoInfo,
            subtitles: state.subtitles || [],
            subtitleText: state.subtitleText,
            subtitleSource: state.subtitleSource || 'cc',
          }
        : null;
    const extracted = existing || (await extractSubtitles(requestSeq));
    if (extracted && !isStaleRequest(requestSeq)) await runSummarize(extracted, requestSeq);
  };

  const generateCollectionNote = async () => {
    const pages = state.videoInfo?.pages || [];
    if (pages.length <= 1 || !state.videoInfo) {
      setNotice('当前视频没有可批量生成的分 P');
      return;
    }
    const normalizedSettings = normalizeProviderSettings(settings);
    const requestConfig = normalizedSettings.aiConfig;
    const requestProvider = PROVIDERS.find((p) => p.id === normalizedSettings.providerId) || provider;
    if (!requestConfig.apiKey.trim() && requestProvider.id !== 'ollama') {
      setState((s) => ({ ...s, status: 'error', error: '请先配置 API Key' }));
      return;
    }

    const requestSeq = nextRequestSeq();
    setNotice(null);
    setChatMessages([]);
    setKeyFrames([]);
    setState((s) => ({ ...s, status: 'summarizing', error: null, result: null }));
    addLog(`开始批量生成合集：${pages.length} 个分 P`);

    const partNotes: CollectionPartNote[] = [];
    for (const page of pages) {
      if (isStaleRequest(requestSeq)) return;
      const label = `P${page.page}${page.part ? ` ${page.part}` : ''}`;
      addLog(`批量处理：${label}`);
      try {
        const subtitleResponse = await sendRuntimeMessage<SubtitleResponse | RuntimeErrorResponse>({
          type: 'GET_SUBTITLES',
          config: requestConfig,
          page: page.page,
        });
        if ('error' in subtitleResponse) {
          partNotes.push({
            page: page.page,
            title: page.part || subtitleResponse.video?.title || `P${page.page}`,
            content: '',
            subtitleCount: 0,
            source: 'cc',
            usage: null,
            error: subtitleResponse.error,
          });
          addLog(`${label} 字幕失败：${subtitleResponse.error}`);
          continue;
        }
        const summaryResponse = await sendRuntimeMessage<SummaryResponse | RuntimeErrorResponse>({
          type: 'RUN_SUMMARIZE',
          subtitleText: subtitleResponse.text,
          videoTitle: subtitleResponse.video?.title || label,
          mode,
          template,
          config: requestConfig,
        });
        if ('error' in summaryResponse) {
          partNotes.push({
            page: page.page,
            title: page.part || subtitleResponse.video?.title || `P${page.page}`,
            content: '',
            subtitleCount: subtitleResponse.subtitles?.length || 0,
            source: subtitleResponse.source || 'cc',
            usage: null,
            error: summaryResponse.error,
          });
          addLog(`${label} 总结失败：${summaryResponse.error}`);
          continue;
        }
        partNotes.push({
          page: page.page,
          title: page.part || subtitleResponse.video?.title || `P${page.page}`,
          content: summaryResponse.result,
          subtitleCount: subtitleResponse.subtitles?.length || 0,
          source: subtitleResponse.source || 'cc',
          usage: summaryResponse.usage || null,
        });
        addLog(`${label} 完成：${formatUsage(summaryResponse.usage || null)}`);
      } catch (error: any) {
        partNotes.push({
          page: page.page,
          title: page.part || `P${page.page}`,
          content: '',
          subtitleCount: 0,
          source: 'cc',
          usage: null,
          error: error?.message || '未知错误',
        });
        addLog(`${label} 失败：${error?.message || '未知错误'}`);
      }
    }

    if (isStaleRequest(requestSeq)) return;
    const completed = partNotes.filter((part) => !part.error);
    if (!completed.length) {
      setState((s) => ({ ...s, status: 'error', error: '批量生成失败：所有分 P 都未完成' }));
      return;
    }

    let synthesis: string | null = null;
    let synthesisUsage: TokenUsage | null = null;
    try {
      addLog('开始生成全集综合总结');
      const synthesisResponse = await sendRuntimeMessage<SummaryResponse | RuntimeErrorResponse>({
        type: 'SYNTHESIZE_COLLECTION',
        videoTitle: stripPartSuffix(state.videoInfo.title),
        partNotes: completed.map((part) => ({
          page: part.page,
          title: part.title,
          content: part.content,
        })),
        mode,
        template,
        config: requestConfig,
      });
      if ('error' in synthesisResponse) {
        addLog(`全集综合总结失败：${synthesisResponse.error}`);
      } else {
        synthesis = synthesisResponse.result || null;
        synthesisUsage = synthesisResponse.usage || null;
        addLog(`全集综合总结完成：${formatUsage(synthesisUsage)}`);
      }
    } catch (error: any) {
      addLog(`全集综合总结失败：${error?.message || '未知错误'}`);
    }

    const generatedAt = new Date().toISOString();
    const collectionVideo: VideoInfo = {
      ...state.videoInfo,
      title: `${stripPartSuffix(state.videoInfo.title)}（合集）`,
      page: 1,
    };
    const content = buildCollectionMarkdown({
      title: stripPartSuffix(state.videoInfo.title),
      parts: partNotes,
      synthesis,
    });
    const usage = mergeTokenUsage([...partNotes.map((part) => part.usage), synthesisUsage]);
    const source = partNotes.some((part) => part.source === 'whisper') ? 'whisper' : 'cc';
    const draft: SavedNoteDraft = {
      videoInfo: collectionVideo,
      content,
      source,
      mode,
      template,
      usage,
      providerId: requestProvider.id,
      providerName: requestProvider.name,
      model: requestConfig.model,
      keyFrames: [],
      generatedAt,
    };
    await saveLatestDraft(draft);
    setHistory(await appendNoteHistory(draft));
    setState((s) => ({
      ...s,
      status: 'done',
      videoInfo: collectionVideo,
      subtitles: null,
      subtitleText: partNotes.map((part) => `# P${part.page} ${part.title}\n${part.content}`).join('\n\n'),
      subtitleSource: source,
      result: content,
      generatedMode: mode,
      generatedTemplate: template,
      generatedAt,
      usage,
      generatedProviderName: requestProvider.name,
      generatedModel: requestConfig.model,
      summaryChunks: partNotes.length,
      error: null,
    }));
    setNotice(`合集笔记已生成：完成 ${completed.length}/${partNotes.length} 个分 P`);
    addLog(`合集生成完成：完成 ${completed.length}/${partNotes.length}，${formatUsage(usage)}`);
  };

  const restoreDraft = (draft: SavedNoteDraft) => {
    setActiveView('summary');
    setState((s) => ({
      ...s,
      status: 'done',
      videoInfo: draft.videoInfo,
      subtitleSource: draft.source,
      result: draft.content,
      generatedMode: draft.mode || 'standard',
      generatedTemplate: draft.template || 'study',
      generatedAt: draft.generatedAt,
      usage: draft.usage || null,
      generatedProviderName: draft.providerName || null,
      generatedModel: draft.model || null,
      summaryChunks: null,
      error: null,
    }));
    setKeyFrames(normalizeKeyFrames(draft.keyFrames));
    setNotice(`已恢复历史笔记：${new Date(draft.generatedAt).toLocaleString()}`);
  };

  const buildCurrentDraft = (frames: KeyFrame[], contentOverride?: string): SavedNoteDraft | null => {
    const content = contentOverride ?? state.result;
    if (!state.videoInfo || !content || !state.generatedAt) return null;
    return {
      videoInfo: state.videoInfo,
      content,
      source: state.subtitleSource,
      mode: state.generatedMode || mode,
      template: state.generatedTemplate || template,
      usage: state.usage,
      providerId,
      providerName: state.generatedProviderName || undefined,
      model: state.generatedModel || undefined,
      keyFrames: frames,
      generatedAt: state.generatedAt,
    };
  };

  const persistKeyFrames = async (frames: KeyFrame[], contentOverride?: string) => {
    const draft = buildCurrentDraft(frames, contentOverride);
    if (!draft) return;
    try {
      await saveLatestDraft(draft);
      setHistory(await appendNoteHistory(draft));
    } catch (error) {
      console.error('[b-note] failed to persist key frames', error);
      addLog('关键画面保存失败：刷新后可能丢失');
    }
  };

  const {
    keyFrames,
    setKeyFrames,
    frameStatus,
    setFrameStatus,
    requestKeyFrame,
    captureFrame,
    captureAutoFrames,
    recaptureKeyFrame,
    deleteKeyFrame,
  } = useKeyFrames({
    videoInfo: state.videoInfo,
    result: state.result,
    onResultChange: (content) => setState((s) => ({ ...s, result: content })),
    onPersist: persistKeyFrames,
    addLog,
    setNotice,
  });

  const askVideo = async (question: string) => {
    const subtitleText = state.subtitleText;
    const videoInfo = state.videoInfo;
    const note = state.result;
    if (!subtitleText || !videoInfo || !note) {
      setNotice('请先生成笔记，再继续追问');
      return;
    }
    const normalizedSettings = normalizeProviderSettings(settings);
    const requestConfig = normalizedSettings.aiConfig;
    const requestProvider = PROVIDERS.find((p) => p.id === normalizedSettings.providerId) || provider;
    if (!requestConfig.apiKey.trim() && requestProvider.id !== 'ollama') {
      setNotice('请先配置 API Key 后再追问');
      return;
    }

    const userMessage: ChatMessage = {
      id: `${Date.now()}:user`,
      role: 'user',
      content: question,
    };
    setChatMessages((messages) => [...messages, userMessage]);
    setChatStatus('asking');
    addLog(`视频问答：${question}`);
    try {
      const response = await sendRuntimeMessage<SummaryResponse | RuntimeErrorResponse>({
        type: 'ASK_VIDEO',
        subtitleText,
        videoTitle: videoInfo.title,
        note,
        question,
        config: requestConfig,
      });
      if ('error' in response) {
        setNotice(`问答失败：${response.error}`);
        addLog(`问答失败：${response.error}`);
        return;
      }
      setChatMessages((messages) => [
        ...messages,
        {
          id: `${Date.now()}:assistant`,
          role: 'assistant',
          content: response.result,
          usage: response.usage || null,
        },
      ]);
      addLog(`问答完成：${formatUsage(response.usage || null)}`);
    } catch (e: any) {
      setNotice(`问答失败：${e?.message || '未知错误'}`);
      addLog(`问答失败：${e?.message || '未知错误'}`);
    } finally {
      setChatStatus('idle');
    }
  };

  return (
    <div className="flex h-screen flex-col bg-slate-50 text-slate-900">
      <Header activeView={activeView} onViewChange={setActiveView} />
      {activeView === 'settings' ? (
        <ConfigPanel
          config={config}
          onChange={updateConfig}
          providerId={providerId}
          onSelectProvider={selectProvider}
          provider={provider}
          obsidian={obsidian}
          onObsidianChange={updateObsidian}
          telegram={telegram}
          onTelegramChange={updateTelegram}
          webhook={webhook}
          onWebhookChange={updateWebhook}
          pricing={pricing}
          onPricingChange={updatePricing}
          autoCaptureKeyFrames={settings.autoCaptureKeyFrames}
          onAutoCaptureKeyFramesChange={updateAutoCaptureKeyFrames}
          onTestApi={testApiConfig}
          apiTestStatus={apiTestStatus}
          lastApiTestUsage={lastApiTestUsage}
        />
      ) : (
        <>
          {activeView === 'summary' && (
            <ActionBar
              status={state.status}
              mode={mode}
              onModeChange={updateMode}
              template={template}
              onTemplateChange={updateTemplate}
              onGenerate={generateNote}
              onExtract={extractSubtitles}
              onSummarize={runSummarize}
              onBatchGenerate={generateCollectionNote}
              hasSubtitles={!!state.subtitleText}
              hasResult={!!state.result}
              estimatedTokens={estimatedSubtitleTokens}
              videoInfo={state.videoInfo}
              onSelectPage={selectVideoPage}
            />
          )}
          <StatusPanel
            logs={[]}
            notice={notice}
            error={state.error}
            videoInfo={state.videoInfo}
            subtitleCount={state.subtitles?.length || 0}
            subtitleSource={state.subtitleSource}
            history={[]}
            onRestoreDraft={restoreDraft}
            onNotice={setNotice}
            compact={!!state.result || activeView !== 'subtitles'}
          />
          <ContentArea
            activeView={activeView}
            state={state}
            obsidian={obsidian}
            telegram={telegram}
            webhook={webhook}
            pricing={pricing}
            onNotice={setNotice}
            keyFrames={keyFrames}
            chatMessages={chatMessages}
            chatStatus={chatStatus}
            onAskVideo={askVideo}
            onCaptureFrame={captureFrame}
            onAutoCaptureFrames={captureAutoFrames}
            onRecaptureKeyFrame={recaptureKeyFrame}
            onDeleteKeyFrame={deleteKeyFrame}
            frameStatus={frameStatus}
            onExtract={extractSubtitles}
            onBatchGenerate={generateCollectionNote}
            onSelectPage={selectVideoPage}
            onOpenSummary={(headingId) => {
              setActiveView('summary');
              window.setTimeout(() => {
                if (headingId) document.getElementById(headingId)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
              }, 60);
            }}
          />
        </>
      )}
    </div>
  );
}

function normalizeProviderSettings(settings: AppSettings): AppSettings {
  const provider = PROVIDERS.find((p) => p.id === settings.providerId) || PROVIDERS[0];
  const model =
    provider.models.length > 0 && !provider.models.includes(settings.aiConfig.model)
      ? provider.defaultModel
      : settings.aiConfig.model;

  const baseUrl = settings.aiConfig.baseUrl || provider.baseUrl;

  return {
    ...settings,
    providerId: provider.id,
    aiConfig: {
      ...settings.aiConfig,
      baseUrl,
      model,
      transcriptionModel: settings.aiConfig.transcriptionModel || 'whisper-1',
      transcriptionBaseUrl: settings.aiConfig.transcriptionBaseUrl || '',
      transcriptionApiKey: settings.aiConfig.transcriptionApiKey || '',
      transcriptionWorkerUrl: settings.aiConfig.transcriptionWorkerUrl || '',
    },
  };
}

function stripPartSuffix(title: string): string {
  return title.replace(/\s+-\s+P\d+\s+.+$/i, '').trim() || title;
}
