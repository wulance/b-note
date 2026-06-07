import type { SubtitleEntry, VideoInfo } from '@/src/lib/subtitle';
import type { SummaryMode, SummaryTemplate, TokenUsage } from '@/src/lib/summarizer';

export type Status = 'idle' | 'loading_subtitle' | 'ready' | 'summarizing' | 'done' | 'error';
export type AppView = 'note' | 'settings' | 'activity';
export type ConfigSection = 'ai' | 'transcription' | 'preferences' | 'export' | 'publish' | 'pricing';

export interface AppState {
  status: Status;
  videoInfo: VideoInfo | null;
  subtitles: SubtitleEntry[] | null;
  subtitleText: string | null;
  subtitleSource: 'cc' | 'whisper' | null;
  result: string | null;
  generatedMode: SummaryMode | null;
  generatedTemplate: SummaryTemplate | null;
  generatedAt: string | null;
  usage: TokenUsage | null;
  generatedProviderName: string | null;
  generatedModel: string | null;
  summaryChunks: number | null;
  error: string | null;
}

export interface ExtractedSubtitleResult {
  videoInfo: VideoInfo;
  subtitles: SubtitleEntry[];
  subtitleText: string;
  subtitleSource: 'cc' | 'whisper';
  cached?: boolean;
  cachedAt?: string | null;
}
