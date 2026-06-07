import type { VideoInfo } from './subtitle';
import type { AIConfig, SummaryMode, SummaryTemplate, TokenUsage } from './summarizer';

export type RuntimeMessage =
  | { type: 'VIDEO_DETECTED'; video: VideoInfo }
  | { type: 'GET_SUBTITLES'; config?: AIConfig; page?: number; forceRefresh?: boolean }
  | {
      type: 'RUN_SUMMARIZE';
      subtitleText: string;
      videoTitle: string;
      mode: SummaryMode;
      template: SummaryTemplate;
      config: AIConfig;
    }
  | {
      type: 'SYNTHESIZE_COLLECTION';
      videoTitle: string;
      partNotes: Array<{ page: number; title: string; content: string }>;
      mode: SummaryMode;
      template: SummaryTemplate;
      config: AIConfig;
    }
  | {
      type: 'GENERATE_TAGS';
      videoTitle: string;
      note: string;
      transcript?: string;
      config: AIConfig;
    }
  | { type: 'FETCH_MODELS'; config: AIConfig }
  | { type: 'TEST_AI_CONFIG'; config: AIConfig }
  | {
      type: 'ASK_VIDEO';
      subtitleText: string;
      videoTitle: string;
      note: string;
      question: string;
      config: AIConfig;
    }
  | { type: 'SEEK_TO_TIME'; seconds: number }
  | { type: 'CAPTURE_FRAME'; seconds?: number; bvid?: string; page?: number };

export type ContentMessage =
  | { type: 'CAPTURE_VIDEO_FRAME'; seconds?: number }
  | { type: 'PREPARE_VISIBLE_FRAME'; seconds?: number }
  | { type: 'SEEK_TO_TIME'; seconds: number };

export interface RuntimeOkResponse {
  ok?: true;
}

export interface RuntimeErrorResponse {
  error: string;
  video?: VideoInfo;
}

export type RuntimeResponse = RuntimeOkResponse | RuntimeErrorResponse;

export interface SubtitleResponse extends RuntimeOkResponse {
  video: VideoInfo;
  subtitles: Array<{ from: number; to: number; content: string }>;
  text: string;
  source: 'cc' | 'whisper';
  cached?: boolean;
  cachedAt?: string;
  transcriptionLogs?: string[];
}

export interface SummaryResponse extends RuntimeOkResponse {
  result: string;
  usage: TokenUsage | null;
  chunks?: number;
}

export interface TagGenerationResponse extends RuntimeOkResponse {
  tags: string[];
  usage: TokenUsage | null;
}

export interface ModelListResponse extends RuntimeOkResponse {
  models: string[];
}

export interface CaptureFrameResponse extends RuntimeOkResponse {
  ok: true;
  dataUrl: string;
  seconds: number;
  width: number;
  height: number;
  fallback?: string;
  sourceError?: string;
}
