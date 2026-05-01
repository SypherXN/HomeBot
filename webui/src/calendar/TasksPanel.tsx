import type { CalendarListItem } from "../api";

type Props = {
  loading: boolean;
  error: string | null;
  data: { items: CalendarListItem[]; page: number; totalCount: number; hasNext: boolean; hasPrev: boolean } | null;
  onPickTask: (task: CalendarListItem) => void;
  onAddTask: () => void;
  onPrevPage: () => void;
  onNextPage: () => void;
  onRefresh: () => void;
  canAuth: boolean;
};

export default function TasksPanel({
  loading,
  error,
  data,
  onPickTask,
  onAddTask,
  onPrevPage,
  onNextPage,
  onRefresh,
  canAuth,
}: Props) {
  return (
    <aside
      aria-labelledby="tasks-panel-heading"
      className="rounded-xl border border-slate-800 bg-slate-900/40 p-4"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id="tasks-panel-heading" className="text-base font-semibold text-white">
          Tasks
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!canAuth || loading}
            onClick={onRefresh}
            className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50"
          >
            {loading ? "…" : "Refresh"}
          </button>
          <button
            type="button"
            disabled={!canAuth}
            onClick={onAddTask}
            className="rounded-md border border-blue-600 bg-blue-700 px-2 py-1 text-xs font-medium text-white hover:bg-blue-600 disabled:opacity-50"
          >
            + Task
          </button>
        </div>
      </div>

      {error && (
        <p className="mb-3 rounded border border-red-800/60 bg-red-950/30 px-3 py-2 text-xs text-red-200">
          {error}
        </p>
      )}

      {!canAuth && (
        <p className="text-sm text-slate-400">Add an API token in Settings to load tasks.</p>
      )}

      {canAuth && data && data.totalCount === 0 && !loading && (
        <p className="rounded border border-dashed border-slate-700 px-3 py-6 text-center text-sm text-slate-400">
          No open tasks.
        </p>
      )}

      {canAuth && data && data.items.length > 0 && (
        <ul className="space-y-2">
          {data.items.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => onPickTask(t)}
                className="flex w-full flex-col gap-0.5 rounded-md border border-slate-800 bg-slate-950/40 px-3 py-2 text-left hover:border-slate-700 hover:bg-slate-900/60"
              >
                <span className="truncate text-sm font-medium text-slate-100">{t.title}</span>
                {t.assignedToMemberLabel && (
                  <span className="text-xs text-slate-500">{t.assignedToMemberLabel}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {canAuth && data && data.totalCount > 0 && (
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-800 pt-3 text-xs text-slate-400">
          <span>
            Page {data.page + 1} · {data.totalCount} total
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={!data.hasPrev || loading}
              onClick={onPrevPage}
              className="rounded border border-slate-700 bg-slate-900 px-2 py-1 hover:bg-slate-800 disabled:opacity-40"
            >
              Prev
            </button>
            <button
              type="button"
              disabled={!data.hasNext || loading}
              onClick={onNextPage}
              className="rounded border border-slate-700 bg-slate-900 px-2 py-1 hover:bg-slate-800 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
