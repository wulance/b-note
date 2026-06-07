import type { AppView } from '../../types';

export function Header({
  activeView,
  onViewChange,
}: {
  activeView: AppView;
  onViewChange: (view: AppView) => void;
}) {
  const tabs: Array<{ id: AppView; label: string }> = [
    { id: 'subtitles', label: '字幕' },
    { id: 'summary', label: '总结' },
    { id: 'outline', label: '大纲' },
    { id: 'settings', label: '设置' },
  ];

  return (
    <div className="shrink-0 border-b border-[var(--bn-separator-soft)] bg-[var(--bn-chrome)] px-3 py-2 shadow-[0_1px_0_rgba(0,0,0,0.04)] backdrop-blur-xl">
      <div className="flex items-center gap-2">
        <div className="min-w-0 shrink-0">
          <h1 className="text-sm font-extrabold leading-tight tracking-tight text-[var(--bn-text)]">b-note</h1>
          <p className="text-[11px] font-medium leading-none text-[var(--bn-text-tertiary)]">B站视频笔记</p>
        </div>
        <div className="grid min-w-0 flex-1 grid-cols-4 gap-1 rounded-[10px] bg-black/[0.05] p-1 ring-1 ring-black/[0.04]">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onViewChange(tab.id)}
              aria-pressed={activeView === tab.id}
              className={`min-h-8 rounded-[8px] px-1.5 py-1.5 text-xs font-semibold transition ${
                activeView === tab.id
                  ? 'bg-white text-[var(--bn-text)] shadow-[0_1px_2px_rgba(0,0,0,0.08)] ring-1 ring-black/[0.04]'
                  : 'text-[var(--bn-text-secondary)] hover:bg-white/60 hover:text-[var(--bn-text)]'
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
