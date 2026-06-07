import type { SavedNoteDraft } from '@/src/lib/drafts';
import { formatUsage, getModeLabel } from '@/src/lib/note';

export function HistoryList({
  history,
  onRestoreDraft,
  compact = false,
}: {
  history: SavedNoteDraft[];
  onRestoreDraft: (draft: SavedNoteDraft) => void;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <details className="group relative shrink-0">
        <summary className="list-none rounded-md bg-slate-100 px-2.5 py-1.5 text-[11px] font-medium text-slate-600 transition hover:bg-slate-200 [&::-webkit-details-marker]:hidden">
          最近
        </summary>
        <div className="absolute right-0 z-30 mt-1 w-72 max-w-[calc(100vw-1.5rem)] rounded-lg border border-slate-200 bg-white p-2 shadow-xl">
          <div className="mb-1 px-1 text-[11px] font-semibold text-slate-500">最近笔记</div>
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {history.slice(0, 8).map((draft) => (
              <button
                key={`${draft.videoInfo.bvid}:${draft.videoInfo.cid}:${draft.generatedAt}`}
                type="button"
                onClick={() => onRestoreDraft(draft)}
                className="block w-full rounded-md bg-slate-50 px-2 py-1.5 text-left transition hover:bg-slate-100"
              >
                <div className="line-clamp-1 text-[11px] font-medium text-slate-700">
                  {draft.videoInfo.title}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400">
                  <span>{getModeLabel(draft.mode || 'standard')}</span>
                  <span>P{draft.videoInfo.page || 1}</span>
                  {draft.model && <span>{draft.model}</span>}
                  <span>{formatUsage(draft.usage)}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </details>
    );
  }

  return (
    <details className="rounded-md border border-slate-200 bg-white px-3 py-2">
      <summary className="cursor-pointer text-xs font-medium text-slate-500">最近笔记</summary>
      <div className="mt-2 space-y-1.5">
        {history.slice(0, 8).map((draft) => (
          <button
            key={`${draft.videoInfo.bvid}:${draft.videoInfo.cid}:${draft.generatedAt}`}
            type="button"
            onClick={() => onRestoreDraft(draft)}
            className="block w-full rounded-md bg-slate-50 px-2 py-1.5 text-left transition hover:bg-slate-100"
          >
            <div className="line-clamp-1 text-[11px] font-medium text-slate-700">
              {draft.videoInfo.title}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400">
              <span>{getModeLabel(draft.mode || 'standard')}</span>
              <span>P{draft.videoInfo.page || 1}</span>
              {draft.model && <span>{draft.model}</span>}
              <span>{formatUsage(draft.usage)}</span>
            </div>
          </button>
        ))}
      </div>
    </details>
  );
}
