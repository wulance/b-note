import type { SavedNoteDraft } from '@/src/lib/drafts';
import { ActivityLog } from './ActivityLog';
import { HistoryList } from './HistoryList';

export function ActivityPanel({
  logs,
  history,
  onRestoreDraft,
  onNotice,
}: {
  logs: string[];
  history: SavedNoteDraft[];
  onRestoreDraft: (draft: SavedNoteDraft) => void;
  onNotice: (message: string | null) => void;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 px-3 py-3">
      <div className="space-y-3">
        {logs.length > 0 ? (
          <ActivityLog logs={logs} onNotice={onNotice} />
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 text-xs text-slate-500">
            暂无运行记录
          </div>
        )}
        {history.length > 0 ? (
          <HistoryList history={history} onRestoreDraft={onRestoreDraft} />
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 text-xs text-slate-500">
            暂无最近笔记
          </div>
        )}
      </div>
    </div>
  );
}
