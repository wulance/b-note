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
          <div className="truncate rounded-lg border border-emerald-200 bg-emerald-50/95 px-3 py-2 text-[11px] font-semibold text-emerald-700 shadow-lg backdrop-blur">
            {notice}
          </div>
        )}
        {error && (
          <div className="pointer-events-auto max-h-28 overflow-y-auto rounded-lg border border-red-200 bg-red-50/95 px-3 py-2 text-[11px] leading-relaxed text-red-700 shadow-lg backdrop-blur">
            {error}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2 border-b border-slate-200 bg-white px-3 py-3">
      {notice && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
          {notice}
        </div>
      )}
      {error && (
        <div className="max-h-28 overflow-y-auto rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs leading-relaxed text-red-700">
          {error}
        </div>
      )}
      {videoInfo && (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="line-clamp-2 text-xs font-semibold leading-relaxed text-slate-700">
            {videoInfo.title}
          </div>
          {subtitleCount > 0 && (
            <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
              <span>{subtitleCount} 条字幕</span>
              <span className="rounded bg-white px-1.5 py-0.5 ring-1 ring-slate-200">
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
