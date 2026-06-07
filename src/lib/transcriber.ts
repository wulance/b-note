import type { SubtitleEntry } from './subtitle';
import type { AIConfig } from './summarizer';

interface TranscribeVideo {
  bvid: string;
  cid: number;
  title: string;
  duration: number;
}

interface WhisperSegment {
  start?: number;
  end?: number;
  text?: string;
}

interface AudioCandidate {
  urls: string[];
  bandwidth: number;
  codecs?: string;
  mimeType?: string;
}

export interface TranscriptionProgress {
  stage: 'audio_url' | 'download' | 'upload' | 'done';
  message: string;
  attempt?: number;
}

export function explainTranscriptionError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || '未知错误');
  if (/转写 Worker|worker/i.test(message)) {
    return `${message}。请确认转写服务已启动、允许跨域请求，并配置了 Whisper 服务。`;
  }
  if (/404|not found/i.test(message)) {
    return `${message}。当前 Base URL 可能没有 /audio/transcriptions 接口，请切换 OpenAI 或兼容 Whisper 的网关。`;
  }
  if (/401|403|unauthorized|forbidden/i.test(message)) {
    return `${message}。请检查转写服务的 API Key 权限是否包含音频转写。`;
  }
  if (/429|rate/i.test(message)) {
    return `${message}。转写服务限流了，请稍后重试或换用更高额度的服务。`;
  }
  if (/超过 24MB/.test(message)) {
    return `${message}。建议优先使用 B 站 CC 字幕，或在配置中填写转写 Worker URL 来启用服务端分片/压缩。`;
  }
  return message;
}

interface TranscriptionOptions {
  onProgress?: (event: TranscriptionProgress) => void;
}

const MAX_AUDIO_BYTES = 24 * 1024 * 1024;
const BILIBILI_REFERRER = 'https://www.bilibili.com/';
const MAX_RETRY_ATTEMPTS = 3;
const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

export async function transcribeBilibiliAudio(
  video: TranscribeVideo,
  config: AIConfig,
  options: TranscriptionOptions = {}
): Promise<SubtitleEntry[]> {
  const workerUrl = getTranscriptionWorkerUrl(config);
  if (workerUrl) {
    return transcribeWithWorker(video, config, workerUrl, options);
  }

  if (!getTranscriptionBaseUrl(config)) throw new Error('请先配置支持 Whisper 的 Base URL');

  const audio = await fetchBestBilibiliAudio(video, options);
  if (audio.blob.size > MAX_AUDIO_BYTES) {
    throw new Error(`音频文件约 ${formatBytes(audio.blob.size)}，超过 24MB，暂不支持自动转写该视频`);
  }

  return transcribeAudioBlob(audio.blob, video, config, options);
}

async function fetchBestBilibiliAudio(video: TranscribeVideo, options: TranscriptionOptions) {
  const candidates = await fetchBilibiliAudioCandidates(video, options);

  let lastError: unknown = null;
  for (const candidate of candidates) {
    for (const audioUrl of candidate.urls) {
      try {
        options.onProgress?.({
          stage: 'download',
          message: `尝试下载音频流（带宽 ${formatBandwidth(candidate.bandwidth)}）`,
        });
        const audioResp = await retryAsync(
          () => fetch(audioUrl, {
            credentials: 'include',
            referrer: BILIBILI_REFERRER,
          }),
          {
            label: '下载音频',
            onProgress: options.onProgress,
            stage: 'download',
          }
        );
        if (!audioResp.ok) {
          throw new Error(`音频下载失败 (${audioResp.status})`);
        }

        const contentLength = Number(audioResp.headers.get('content-length') || 0);
        if (contentLength > MAX_AUDIO_BYTES) {
          throw new Error(`音频文件约 ${formatBytes(contentLength)}，超过 24MB，暂不支持自动转写该视频`);
        }

        const contentType = audioResp.headers.get('content-type') || 'audio/mp4';
        const blob = await readAudioBlobWithProgress(audioResp, contentType, contentLength, options);
        if (blob.size > MAX_AUDIO_BYTES) {
          throw new Error(`音频文件约 ${formatBytes(blob.size)}，超过 24MB，暂不支持自动转写该视频`);
        }
        options.onProgress?.({
          stage: 'download',
          message: `音频下载完成：${formatBytes(blob.size)}`,
        });
        return {
          blob,
          contentType,
        };
      } catch (error) {
        lastError = error;
        options.onProgress?.({
          stage: 'download',
          message: `当前音频流不可用：${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }
  }

  if (lastError instanceof Error) throw lastError;
  throw new Error('B站音频流地址为空');
}

async function fetchBilibiliAudioCandidates(video: TranscribeVideo, options: TranscriptionOptions): Promise<AudioCandidate[]> {
  const url = new URL('https://api.bilibili.com/x/player/playurl');
  url.searchParams.set('bvid', video.bvid);
  url.searchParams.set('cid', String(video.cid));
  url.searchParams.set('fnval', '16');
  url.searchParams.set('fourk', '1');

  options.onProgress?.({ stage: 'audio_url', message: '正在获取 B 站音频流地址' });
  const resp = await retryAsync(
    () => fetch(url, { credentials: 'include' }),
    {
      label: '获取音频流地址',
      onProgress: options.onProgress,
      stage: 'audio_url',
    }
  );
  const json = await resp.json();
  if (json.code !== 0 || !json.data?.dash?.audio?.length) {
    throw new Error('未能获取 B站音频流');
  }

  return [...json.data.dash.audio]
    .map((candidate: any) => ({
      urls: getAudioUrls(candidate),
      bandwidth: Number(candidate.bandwidth || 0),
      codecs: candidate.codecs,
      mimeType: candidate.mimeType || candidate.mime_type,
    }))
    .filter((candidate) => candidate.urls.length)
    .sort((a, b) => (a.bandwidth || 0) - (b.bandwidth || 0));
}

async function transcribeWithWorker(
  video: TranscribeVideo,
  config: AIConfig,
  workerUrl: string,
  options: TranscriptionOptions
): Promise<SubtitleEntry[]> {
  const candidates = await fetchBilibiliAudioCandidates(video, options);
  if (!candidates.length) throw new Error('B站音频流地址为空');

  options.onProgress?.({
    stage: 'upload',
    message: '正在请求转写 Worker 分片/压缩音频',
  });
  const response = await retryAsync(
    () => fetch(workerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        video,
        audioCandidates: candidates,
        model: config.transcriptionModel || 'whisper-1',
        referrer: BILIBILI_REFERRER,
      }),
    }),
    {
      label: '转写 Worker',
      onProgress: options.onProgress,
      stage: 'upload',
    }
  );

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`转写 Worker 失败 (${response.status}): ${compactErrorText(text)}`);
  }

  const data = await response.json();
  const segments = normalizeWorkerSegments(data, video);
  options.onProgress?.({ stage: 'done', message: `Worker 转写完成：${segments.length} 段字幕` });
  return segments;
}

async function readAudioBlobWithProgress(
  response: Response,
  contentType: string,
  contentLength: number,
  options: TranscriptionOptions
): Promise<Blob> {
  if (!response.body?.getReader) {
    return response.blob();
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  let lastReported = 0;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;
    chunks.push(value);
    received += value.byteLength;
    if (received > MAX_AUDIO_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new Error(`音频文件约 ${formatBytes(received)}，超过 24MB，暂不支持自动转写该视频`);
    }
    const percent = contentLength > 0 ? Math.floor((received / contentLength) * 100) : 0;
    const shouldReport = contentLength > 0 ? percent >= lastReported + 20 : received - lastReported >= 2 * 1024 * 1024;
    if (shouldReport) {
      lastReported = contentLength > 0 ? percent : received;
      options.onProgress?.({
        stage: 'download',
        message: contentLength > 0
          ? `音频下载中：${percent}%（${formatBytes(received)} / ${formatBytes(contentLength)}）`
          : `音频下载中：${formatBytes(received)}`,
      });
    }
  }

  return new Blob(chunks.map(toBlobPart), { type: contentType });
}

function toBlobPart(bytes: Uint8Array): BlobPart {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function getAudioUrls(candidate: any): string[] {
  const urls = [
    candidate.baseUrl,
    candidate.base_url,
    ...(candidate.backupUrl || []),
    ...(candidate.backup_url || []),
  ];
  return [...new Set(urls.filter(Boolean))];
}

export async function transcribeAudioBlob(
  blob: Blob,
  video: TranscribeVideo,
  config: AIConfig,
  options: TranscriptionOptions = {}
): Promise<SubtitleEntry[]> {
  const endpoint = `${getTranscriptionBaseUrl(config).replace(/\/+$/, '')}/audio/transcriptions`;
  const headers: Record<string, string> = {};
  const apiKey = getTranscriptionApiKey(config);
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  options.onProgress?.({
    stage: 'upload',
    message: `正在上传音频到转写接口：${formatBytes(blob.size)}`,
  });

  const resp = await retryAsync(
    () => {
      const form = new FormData();
      const file = new File([blob], `${sanitizeFileName(video.title)}.m4a`, {
        type: blob.type || 'audio/mp4',
      });

      form.set('file', file);
      form.set('model', config.transcriptionModel || 'whisper-1');
      form.set('response_format', 'verbose_json');
      form.append('timestamp_granularities[]', 'segment');

      return fetch(endpoint, {
        method: 'POST',
        headers,
        body: form,
      });
    },
    {
      label: 'Whisper 转写',
      onProgress: options.onProgress,
      stage: 'upload',
    }
  );

  if (!resp.ok) {
    const errorText = await resp.text();
    throw new Error(`Whisper 转写失败 (${resp.status}): ${compactErrorText(errorText)}`);
  }

  const data = await resp.json();
  if (Array.isArray(data.segments) && data.segments.length > 0) {
    const segments = data.segments
      .map((segment: WhisperSegment) => ({
        from: Number(segment.start || 0),
        to: Number(segment.end || segment.start || 0),
        content: String(segment.text || '').trim(),
      }))
      .filter((entry: SubtitleEntry) => entry.content);
    options.onProgress?.({ stage: 'done', message: `转写完成：${segments.length} 段字幕` });
    return segments;
  }

  if (typeof data.text === 'string' && data.text.trim()) {
    options.onProgress?.({ stage: 'done', message: '转写完成：返回整段文本' });
    return [
      {
        from: 0,
        to: video.duration || 0,
        content: data.text.trim(),
      },
    ];
  }

  throw new Error('Whisper 未返回有效转写文本');
}

async function retryAsync(
  task: () => Promise<Response>,
  {
    label,
    stage,
    onProgress,
  }: {
    label: string;
    stage: TranscriptionProgress['stage'];
    onProgress?: (event: TranscriptionProgress) => void;
  }
): Promise<Response> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt += 1) {
    try {
      onProgress?.({ stage, attempt, message: `${label}：第 ${attempt}/${MAX_RETRY_ATTEMPTS} 次尝试` });
      const response = await task();
      if (!response.ok && RETRYABLE_STATUS.has(response.status) && attempt < MAX_RETRY_ATTEMPTS) {
        lastError = new Error(`${label} 暂时不可用 (${response.status})`);
        await response.body?.cancel().catch(() => undefined);
        await waitBeforeRetry(attempt);
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt >= MAX_RETRY_ATTEMPTS) break;
      onProgress?.({
        stage,
        attempt,
        message: `${label} 失败，准备重试：${error instanceof Error ? error.message : String(error)}`,
      });
      await waitBeforeRetry(attempt);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`${label} 失败`);
}

function waitBeforeRetry(attempt: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, 350 * attempt));
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '未知大小';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function formatBandwidth(bandwidth: unknown): string {
  const value = Number(bandwidth);
  if (!Number.isFinite(value) || value <= 0) return '未知';
  if (value < 1000 * 1000) return `${Math.round(value / 1000)}kbps`;
  return `${(value / 1000 / 1000).toFixed(1)}Mbps`;
}

function compactErrorText(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length > 500 ? `${normalized.slice(0, 500)}...` : normalized;
}

function sanitizeFileName(name: string): string {
  return (
    name
      .trim()
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/\s+/g, ' ')
      .slice(0, 80) || 'b-note-audio'
  );
}

function getTranscriptionBaseUrl(config: AIConfig): string {
  return (config.transcriptionBaseUrl || config.baseUrl || '').trim();
}

function getTranscriptionApiKey(config: AIConfig): string {
  return (config.transcriptionApiKey || config.apiKey || '').trim();
}

function getTranscriptionWorkerUrl(config: AIConfig): string {
  return (config.transcriptionWorkerUrl || '').trim();
}

function normalizeWorkerSegments(data: any, video: TranscribeVideo): SubtitleEntry[] {
  const rawSegments = Array.isArray(data?.segments) ? data.segments : Array.isArray(data?.subtitles) ? data.subtitles : [];
  const segments = rawSegments
    .map((segment: any) => ({
      from: Number(segment.from ?? segment.start ?? 0),
      to: Number(segment.to ?? segment.end ?? segment.from ?? segment.start ?? 0),
      content: String(segment.content ?? segment.text ?? '').trim(),
    }))
    .filter((entry: SubtitleEntry) => entry.content);
  if (segments.length) return segments;
  if (typeof data?.text === 'string' && data.text.trim()) {
    return [{ from: 0, to: video.duration || 0, content: data.text.trim() }];
  }
  throw new Error('转写 Worker 未返回有效字幕');
}
