import {
  fetchSubtitleList,
  subtitlesToText,
  fetchVideoInfo,
  extractBvidFromUrl,
  extractPageFromUrl,
  type VideoPageInfo,
} from '@/src/lib/subtitle';
import { summarize, synthesizeCollection, testAIConnection, type SummaryMode, type SummaryTemplate, type AIConfig } from '@/src/lib/summarizer';
import { answerVideoQuestion } from '@/src/lib/summarizer';
import { explainTranscriptionError, transcribeBilibiliAudio } from '@/src/lib/transcriber';
import { loadSubtitleFromCache, saveSubtitleToCache } from '@/src/lib/subtitleCache';
import type { RuntimeMessage } from '@/src/lib/messages';

// ── Video cache per tab ──
interface CachedVideo {
  bvid: string;
  aid: number;
  cid: number;
  title: string;
  duration: number;
  page: number;
  pages?: VideoPageInfo[];
}
const tabVideos = new Map<number, CachedVideo>();

export default defineBackground(() => {
  console.log('[b-note] bg started');

  const chromeApi = (globalThis as any).chrome;
  chromeApi?.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true })?.catch?.(() => {});

  browser.runtime.onMessage.addListener((msg: RuntimeMessage, sender, sendResponse) => {
    if (msg.type === 'VIDEO_DETECTED') {
      if (sender.tab?.id != null) {
        tabVideos.set(sender.tab.id, msg.video);
      }
      sendResponse({ ok: true });
      return;
    }

    if (msg.type === 'GET_SUBTITLES') {
      handleGetSubtitles(msg, sendResponse);
      return true;
    }

    if (msg.type === 'RUN_SUMMARIZE') {
      handleSummarize(msg, sendResponse);
      return true;
    }

    if (msg.type === 'SYNTHESIZE_COLLECTION') {
      handleSynthesizeCollection(msg, sendResponse);
      return true;
    }

    if (msg.type === 'TEST_AI_CONFIG') {
      handleTestAIConfig(msg, sendResponse);
      return true;
    }

    if (msg.type === 'ASK_VIDEO') {
      handleAskVideo(msg, sendResponse);
      return true;
    }

    if (msg.type === 'SEEK_TO_TIME') {
      handleSeekToTime(msg, sendResponse);
      return true;
    }

    if (msg.type === 'CAPTURE_FRAME') {
      handleCaptureFrame(msg, sendResponse);
      return true;
    }
  });
});

async function getBilibiliTab(request?: { bvid?: string; page?: number }) {
  const requestedBvid = typeof request?.bvid === 'string' ? request.bvid : '';
  const requestedPage = Number(request?.page);
  const [active] = await browser.tabs.query({ active: true, currentWindow: true });
  if (matchesRequestedVideo(active, requestedBvid, requestedPage)) return active;

  const all = await browser.tabs.query({ url: '*://*.bilibili.com/video/*' });
  const matched = all.find((tab) => matchesRequestedVideo(tab, requestedBvid, requestedPage));
  if (requestedBvid || (Number.isFinite(requestedPage) && requestedPage > 1)) {
    return matched || null;
  }
  return matched || all[0] || null;
}

function matchesRequestedVideo(tab: BilibiliTab | undefined, bvid: string, page: number) {
  if (!tab?.url?.includes('bilibili.com/video/')) return false;
  if (bvid && !tab.url.includes(bvid)) return false;
  if (Number.isFinite(page) && page > 1) {
    const urlPage = extractPageFromUrl(tab.url);
    if (urlPage !== page) return false;
  }
  return true;
}

async function handleSynthesizeCollection(msg: Extract<RuntimeMessage, { type: 'SYNTHESIZE_COLLECTION' }>, sendResponse: (r: any) => void) {
  try {
    const result = await synthesizeCollection({
      videoTitle: msg.videoTitle || 'B站合集',
      partNotes: Array.isArray(msg.partNotes) ? msg.partNotes : [],
      mode: msg.mode as SummaryMode,
      template: msg.template as SummaryTemplate,
      config: msg.config as AIConfig,
    });
    sendResponse({ result: result.content, usage: result.usage, chunks: result.chunks || 1 });
  } catch (e: any) {
    console.error('[b-note] synthesize collection failed', e);
    sendResponse({ error: e.message || '合集综合总结失败' });
  }
}

async function handleCaptureFrame(msg: Extract<RuntimeMessage, { type: 'CAPTURE_FRAME' }>, sendResponse: (r: any) => void) {
  try {
    const tab = await getBilibiliTab({ bvid: msg.bvid, page: Number(msg.page) });
    if (!tab?.id) {
      throw new Error('请先打开一个B站视频页面');
    }
    const seconds = Number(msg.seconds);
    const requestedSeconds = Number.isFinite(seconds) ? seconds : undefined;
    const response = await browser.tabs
      .sendMessage(tab.id, {
        type: 'CAPTURE_VIDEO_FRAME',
        seconds: requestedSeconds,
      })
      .catch((error: any) => ({ error: error?.message || '内容脚本截图失败' }));
    if (response?.ok) {
      sendResponse(response);
      return;
    }

    const fallback = await captureVisibleTabFrame(tab, requestedSeconds, response?.seconds);
    if (fallback?.ok) {
      sendResponse({
        ...fallback,
        fallback: 'visible-tab',
        sourceError: response?.error,
      });
      return;
    }

    sendResponse({ error: response?.error || '截图失败' });
  } catch (e: any) {
    console.error('[b-note] capture frame failed', e);
    sendResponse({ error: e.message || '截图失败' });
  }
}

async function captureVisibleTabFrame(
  tab: BilibiliTab,
  requestedSeconds?: number,
  capturedSeconds?: number,
) {
  if (!tab.id || tab.windowId == null) return null;

  const [active] = await browser.tabs.query({ active: true, currentWindow: true });
  if (active?.id !== tab.id) {
    throw new Error('视频帧截图失败。请先切回当前 B 站视频标签页，再点截图');
  }

  const dataUrl = await browser.tabs.captureVisibleTab(tab.windowId, {
    format: 'jpeg',
    quality: 82,
  });
  return {
    ok: true,
    dataUrl,
    seconds: Number.isFinite(capturedSeconds) ? capturedSeconds : requestedSeconds || 0,
    width: 0,
    height: 0,
  };
}

interface BilibiliTab {
  id?: number;
  url?: string;
  windowId?: number;
}

async function resolveVideo(tab: BilibiliTab, requestedPage?: number): Promise<CachedVideo> {
  const cached = tab.id != null ? tabVideos.get(tab.id) : undefined;
  const targetPage = requestedPage || (tab.url ? extractPageFromUrl(tab.url) : 1);
  if (cached && cached.page === targetPage) return cached;

  const bvid = tab.url ? extractBvidFromUrl(tab.url) : null;
  const targetBvid = bvid || cached?.bvid;
  if (!targetBvid) throw new Error('未能识别B站视频链接');

  const info = await fetchVideoInfo(targetBvid, targetPage);
  const v: CachedVideo = {
    bvid: info.bvid,
    aid: info.aid,
    cid: info.cid,
    title: info.title,
    duration: info.duration,
    page: info.page,
    pages: info.pages,
  };
  if (tab.id != null) tabVideos.set(tab.id, v);
  return v;
}

async function handleGetSubtitles(msg: Extract<RuntimeMessage, { type: 'GET_SUBTITLES' }>, sendResponse: (r: any) => void) {
  try {
    const tab = await getBilibiliTab();
    if (!tab) {
      sendResponse({ error: '请先打开一个B站视频页面' });
      return;
    }

    const requestedPage = Number(msg.page);
    const video = await resolveVideo(tab, Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : undefined);
    if (!msg.forceRefresh) {
      const cached = await loadSubtitleFromCache(video);
      if (cached?.subtitles?.length) {
        sendResponse({
          video: cached.videoInfo,
          subtitles: cached.subtitles,
          text: cached.text,
          source: cached.source,
          cached: true,
          cachedAt: cached.cachedAt,
        });
        return;
      }
    }

    const transcriptionLogs: string[] = [];
    let subtitles = await fetchSubtitleList(video.aid, video.cid);
    let source: 'cc' | 'whisper' = 'cc';

    if (!subtitles?.length) {
      source = 'whisper';
      subtitles = await transcribeBilibiliAudio(video, msg.config as AIConfig, {
        onProgress: (event) => {
          const attempt = event.attempt ? ` (${event.attempt})` : '';
          const message = `${event.stage}${attempt}: ${event.message}`;
          transcriptionLogs.push(message);
          console.log('[b-note] transcribe', message);
        },
      });
    }

    console.log('[b-note] subtitles:', subtitles.length, 'entries, source:', source, 'aid:', video.aid, 'cid:', video.cid);

    const videoInfo = { title: video.title, bvid: video.bvid, cid: video.cid, duration: video.duration, page: video.page, aid: video.aid, pages: video.pages };
    const text = subtitlesToText(subtitles);
    await saveSubtitleToCache({
      videoInfo,
      subtitles,
      text,
      source,
      cachedAt: new Date().toISOString(),
    });

    sendResponse({
      video: videoInfo,
      subtitles,
      text,
      source,
      cached: false,
      transcriptionLogs,
    });
  } catch (e: any) {
    console.error('[b-note] get subtitles failed', e);
    sendResponse({ error: explainTranscriptionError(e) || e.message || '字幕获取失败' });
  }
}

async function handleAskVideo(msg: Extract<RuntimeMessage, { type: 'ASK_VIDEO' }>, sendResponse: (r: any) => void) {
  try {
    const result = await answerVideoQuestion({
      subtitleText: msg.subtitleText || '',
      note: msg.note || '',
      videoTitle: msg.videoTitle || 'B站视频',
      question: msg.question || '',
      config: msg.config as AIConfig,
    });
    sendResponse({ result: result.content, usage: result.usage, chunks: result.chunks || 1 });
  } catch (e: any) {
    console.error('[b-note] ask video failed', e);
    sendResponse({ error: e.message || '问答失败' });
  }
}

async function handleSummarize(msg: Extract<RuntimeMessage, { type: 'RUN_SUMMARIZE' }>, sendResponse: (r: any) => void) {
  try {
    const { subtitleText, videoTitle, mode, config, template } = msg;
    const result = await summarize(subtitleText, videoTitle, mode as SummaryMode, config as AIConfig, template as SummaryTemplate);
    sendResponse({ result: result.content, usage: result.usage, chunks: result.chunks || 1 });
  } catch (e: any) {
    console.error('[b-note] summarize failed', e);
    sendResponse({ error: e.message || '总结失败' });
  }
}

async function handleTestAIConfig(msg: Extract<RuntimeMessage, { type: 'TEST_AI_CONFIG' }>, sendResponse: (r: any) => void) {
  try {
    const usage = await testAIConnection(msg.config as AIConfig);
    sendResponse({ ok: true, usage });
  } catch (e: any) {
    console.error('[b-note] api test failed', e);
    sendResponse({ error: e.message || 'API 测试失败' });
  }
}

async function handleSeekToTime(msg: Extract<RuntimeMessage, { type: 'SEEK_TO_TIME' }>, sendResponse: (r: any) => void) {
  try {
    const seconds = Number(msg.seconds);
    if (!Number.isFinite(seconds) || seconds < 0) {
      throw new Error('时间戳无效');
    }
    const tab = await getBilibiliTab();
    if (!tab?.id) {
      throw new Error('请先打开一个B站视频页面');
    }
    const response = await browser.tabs.sendMessage(tab.id, {
      type: 'SEEK_TO_TIME',
      seconds,
    });
    sendResponse(response || { ok: true });
  } catch (e: any) {
    console.error('[b-note] seek failed', e);
    sendResponse({ error: e.message || '跳转失败' });
  }
}
