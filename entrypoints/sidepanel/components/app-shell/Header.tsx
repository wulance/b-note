import type { AppView } from '../../types';

export function Header({
  activeView,
  onViewChange,
}: {
  activeView: AppView;
  onViewChange: (view: AppView) => void;
}) {
  const tabs: Array<{ id: AppView; label: string }> = [
    { id: 'note', label: '笔记' },
    { id: 'settings', label: '设置' },
    { id: 'activity', label: '记录' },
  ];

  return (
    <div className="shrink-0 border-b border-slate-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur">
      <div className="flex items-center gap-2">
        <div className="min-w-0 shrink-0">
          <h1 className="text-sm font-extrabold leading-tight tracking-tight text-slate-950">b-note</h1>
          <p className="text-[10px] font-medium leading-none text-slate-400">B站视频笔记</p>
        </div>
        <div className="grid min-w-0 flex-1 grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1 ring-1 ring-slate-200">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onViewChange(tab.id)}
              aria-pressed={activeView === tab.id}
              className={`rounded-md px-2 py-1.5 text-xs font-semibold transition ${
                activeView === tab.id
                  ? 'bg-white text-blue-700 shadow-sm ring-1 ring-slate-200'
                  : 'text-slate-500 hover:bg-white/60 hover:text-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
