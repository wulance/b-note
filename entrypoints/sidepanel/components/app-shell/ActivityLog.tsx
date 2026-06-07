export function ActivityLog({
  logs,
  onNotice,
  compact = false,
}: {
  logs: string[];
  onNotice: (message: string | null) => void;
  compact?: boolean;
}) {
  const copyLogs = async () => {
    try {
      await navigator.clipboard.writeText(logs.join('\n'));
      onNotice('已复制运行记录');
    } catch {
      onNotice('复制运行记录失败，请检查剪贴板权限');
    }
  };

  if (compact) {
    return (
      <details className="group relative shrink-0">
        <summary className="list-none rounded-md bg-slate-100 px-2.5 py-1.5 text-[11px] font-medium text-slate-600 transition hover:bg-slate-200 [&::-webkit-details-marker]:hidden">
          记录
        </summary>
        <div className="absolute right-0 z-30 mt-1 w-72 max-w-[calc(100vw-1.5rem)] rounded-lg border border-slate-200 bg-white p-2 shadow-xl">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="px-1 text-[11px] font-semibold text-slate-500">运行记录</div>
            <button
              type="button"
              onClick={copyLogs}
              className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600 transition hover:bg-slate-200"
            >
              复制
            </button>
          </div>
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {logs.map((log) => (
              <div key={log} className="rounded bg-slate-50 px-2 py-1 text-[11px] leading-relaxed text-slate-500">
                {log}
              </div>
            ))}
          </div>
        </div>
      </details>
    );
  }

  return (
    <details className="rounded-md border border-slate-200 bg-white px-3 py-2">
      <summary className="cursor-pointer text-xs font-medium text-slate-500">运行记录</summary>
      <button
        type="button"
        onClick={copyLogs}
        className="mt-2 rounded-md bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600 transition hover:bg-slate-200"
      >
        复制记录
      </button>
      <div className="mt-2 space-y-1">
        {logs.map((log) => (
          <div key={log} className="text-[11px] leading-relaxed text-slate-500">
            {log}
          </div>
        ))}
      </div>
    </details>
  );
}
