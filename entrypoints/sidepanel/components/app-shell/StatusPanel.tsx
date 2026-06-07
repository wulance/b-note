import type { SavedNoteDraft } from '@/src/lib/drafts';
import type { VideoInfo } from '@/src/lib/subtitle';
import { ActivityLog } from './ActivityLog';
import { HistoryList } from './HistoryList';

export function StatusPanel({
  logs,
  notice,
  error,
  videoInfo,
  subtitleCount,
  subtitleSource,
  history,
  onRestoreDraft,
  onNotice,
  compact,
}: {
  logs: string[];
  notice: string | null;
  error: string | null;
  videoInfo: VideoInfo | null;
  subtitleCount: number;
  subtitleSource: 'cc' | 'whisper' | null;
  history: SavedNoteDraft[];
  onRestoreDraft: (draft: SavedNoteDraft) => void;
  onNotice: (message: string | null) => void;
  compact: boolean;
}) {
  if (!logs.length && !notice && !error && !videoInfo && !history.length) return null;

  if (compact) {
    if (!notice && !error) return null;
    return (
      <div className="pointer-events-none fixed bottom-4 left-3 right-3 z-50 space-y-1.5">
        {notice && (
          <div className="overflow-hidden rounded-[10px] border border-[var(--bn-separator-soft)] bg-[var(--bn-chrome)] text-[11px] font-semibold text-[var(--bn-text)] shadow-lg backdrop-blur-xl">
            <div className="flex">
              <span className="w-1 shrink-0 bg-[var(--bn-success)]" />
              <span className="truncate px-3 py-2">{notice}</span>
            </div>
          </div>
        )}
        {error && (
          <div className="pointer-events-auto max-h-28 overflow-hidden rounded-[10px] border border-[var(--bn-separator-soft)] bg-[var(--bn-chrome)] text-[11px] leading-relaxed text-[var(--bn-text)] shadow-lg backdrop-blur-xl">
            <div className="flex">
              <span className="w-1 shrink-0 bg-[var(--bn-danger)]" />
              <span className="overflow-y-auto px-3 py-2">{error}</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2 border-b border-[var(--bn-separator-soft)] bg-[var(--bn-chrome)] px-3 py-3 backdrop-blur-xl">
      {notice && (
        <div className="overflow-hidden rounded-[10px] border border-[var(--bn-separator-soft)] bg-white/80 text-xs font-medium text-[var(--bn-text)]">
          <div className="flex">
            <span className="w-1 shrink-0 bg-[var(--bn-success)]" />
            <span className="px-3 py-2">{notice}</span>
          </div>
        </div>
      )}
      {error && (
        <div className="max-h-28 overflow-hidden rounded-[10px] border border-[var(--bn-separator-soft)] bg-white/80 text-xs leading-relaxed text-[var(--bn-text)]">
          <div className="flex">
            <span className="w-1 shrink-0 bg-[var(--bn-danger)]" />
            <span className="overflow-y-auto px-3 py-2">{error}</span>
          </div>
        </div>
      )}
      {videoInfo && (
        <div className="rounded-[10px] border border-[var(--bn-separator-soft)] bg-white/75 px-3 py-2">
          <div className="line-clamp-2 text-xs font-semibold leading-relaxed text-[var(--bn-text)]">
            {videoInfo.title}
          </div>
          {subtitleCount > 0 && (
            <div className="mt-1 flex items-center gap-2 text-[11px] text-[var(--bn-text-secondary)]">
              <span>{subtitleCount} 条字幕</span>
              <span className="rounded-full bg-black/[0.05] px-1.5 py-0.5">
                {subtitleSource === 'whisper' ? 'Whisper' : 'CC'}
              </span>
            </div>
          )}
        </div>
      )}
      {logs.length > 0 && <ActivityLog logs={logs} onNotice={onNotice} />}
      {history.length > 0 && <HistoryList history={history} onRestoreDraft={onRestoreDraft} />}
    </div>
  );
}
