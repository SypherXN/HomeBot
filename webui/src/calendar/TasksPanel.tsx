import type { CalendarListItem } from "../api";
import { Icon } from "../components/icons";

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
  /** One-tap complete straight from the list. */
  onQuickComplete?: (task: CalendarListItem) => void;
  quickCompletingId?: number | null;
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
  onQuickComplete,
  quickCompletingId,
}: Props) {
  return (
    <aside
      aria-labelledby="tasks-panel-heading"
      className="min-w-0 max-w-full hb-card p-4"
    >
      <div className="mb-3 flex min-w-0 items-center justify-between gap-2">
        <h2 id="tasks-panel-heading" className="text-base font-semibold text-white">
          Tasks
        </h2>
        <div className="flex min-w-0 shrink items-center gap-2">
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
            className="rounded-md border border-blue-500/60 bg-gradient-to-r from-blue-600 to-blue-700 px-2 py-1 text-xs font-medium text-white hover:from-blue-500 hover:to-blue-600 disabled:opacity-50"
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
            <li key={t.id} className="flex items-stretch gap-1.5">
              {onQuickComplete && (
                <button
                  type="button"
                  aria-label={`Mark "${t.title}" complete`}
                  title="Mark complete"
                  disabled={quickCompletingId === t.id}
                  onClick={() => onQuickComplete(t)}
                  className="flex w-8 shrink-0 items-center justify-center rounded-md border border-slate-800 bg-slate-950/40 text-slate-500 transition-colors hover:border-emerald-700/60 hover:bg-emerald-950/40 hover:text-emerald-300 disabled:opacity-50"
                >
                  {quickCompletingId === t.id ? (
                    <span className="text-xs">…</span>
                  ) : (
                    <Icon name="check" className="h-4 w-4" />
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={() => onPickTask(t)}
                className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-md border border-slate-800 bg-slate-950/40 px-3 py-2 text-left hover:border-slate-700 hover:bg-slate-900/60"
              >
                <span className="truncate text-sm font-medium text-slate-100">{t.title}</span>
                <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                  {t.dateText && (
                    <span className="inline-flex items-center gap-1 text-amber-300/90">
                      <Icon name="calendar" className="h-3 w-3" />
                      Due {t.dateText.slice(0, 10)}
                    </span>
                  )}
                  {t.assignedToMemberLabel && <span>{t.assignedToMemberLabel}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {canAuth && data && data.totalCount > 0 && (
        <div className="mt-3 flex min-w-0 flex-col gap-2 border-t border-slate-800 pt-3 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <span className="min-w-0 break-words">
            Page {data.page + 1} · {data.totalCount} total
          </span>
          <div className="flex w-full min-w-0 gap-1 sm:w-auto sm:justify-end">
            <button
              type="button"
              disabled={!data.hasPrev || loading}
              onClick={onPrevPage}
              className="min-h-9 min-w-0 flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 hover:bg-slate-800 disabled:opacity-40 sm:flex-none"
            >
              Prev
            </button>
            <button
              type="button"
              disabled={!data.hasNext || loading}
              onClick={onNextPage}
              className="min-h-9 min-w-0 flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 hover:bg-slate-800 disabled:opacity-40 sm:flex-none"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
