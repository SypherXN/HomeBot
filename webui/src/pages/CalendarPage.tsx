import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  getCalendarItems,
  getCalendarRange,
  postUndo,
  type CalendarRangeItem,
  type PagedCalendarList,
} from "../api";
import { useAuth } from "../auth/AuthContext";
import DiscordMemberSelect from "../components/DiscordMemberSelect";
import { useDiscordGuildRoster } from "../hooks/useDiscordGuildRoster";
import { validActorId } from "../lib/validation";
import AddItemModal from "../calendar/AddItemModal";
import AgendaView from "../calendar/AgendaView";
import {
  addDays,
  addMonths,
  endOfMonthGrid,
  formatLongDate,
  formatMonthYear,
  formatWeekRange,
  startOfDay,
  startOfMonthGrid,
  startOfWeek,
  ymd,
} from "../calendar/dateUtils";
import ItemDetailModal from "../calendar/ItemDetailModal";
import MonthView from "../calendar/MonthView";
import TasksPanel from "../calendar/TasksPanel";
import TimeGridView from "../calendar/TimeGridView";

type View = "month" | "week" | "day" | "agenda";

const ALL_VIEWS: View[] = ["month", "week", "day", "agenda"];
const AGENDA_DAYS = 60;

export default function CalendarPage() {
  const { token, actorUserId } = useAuth();
  const tok = token.trim();
  const actor = actorUserId.trim();
  const canAuth = tok.length > 0;
  const canActor = canAuth && validActorId(actor);
  const guildRoster = useDiscordGuildRoster(token);

  const [params, setParams] = useSearchParams();
  const view = (ALL_VIEWS.includes(params.get("view") as View) ? params.get("view") : "month") as View;
  const anchor = useMemo(() => parseDateParam(params.get("date")) ?? startOfDay(new Date()), [params]);

  const [filterMode, setFilterMode] = useState<"all" | "me" | "user">("all");
  const [filterUser, setFilterUser] = useState("");

  const userFilter = useMemo(() => {
    if (filterMode === "me" && canActor) return actor;
    if (filterMode === "user") {
      const t = filterUser.trim();
      return /^\d+$/.test(t) && t !== "0" ? t : "";
    }
    return "";
  }, [filterMode, canActor, actor, filterUser]);

  const [range, setRange] = useState<CalendarRangeItem[] | null>(null);
  const [rangeLoading, setRangeLoading] = useState(false);
  const [rangeError, setRangeError] = useState<string | null>(null);

  const [tasksData, setTasksData] = useState<PagedCalendarList | null>(null);
  const [tasksPage, setTasksPage] = useState(0);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);

  const [banner, setBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [undoBusy, setUndoBusy] = useState(false);

  type ModalState =
    | { kind: "none" }
    | { kind: "add"; mode: "event" | "task"; date?: Date }
    | { kind: "detail"; itemId: number; isRecurring?: boolean; title?: string };
  const [modal, setModal] = useState<ModalState>({ kind: "none" });

  const visibleWindow = useMemo(() => computeWindow(view, anchor), [view, anchor]);

  const loadRange = useCallback(async () => {
    if (!canAuth) {
      setRange(null);
      return;
    }
    setRangeLoading(true);
    setRangeError(null);
    try {
      const data = await getCalendarRange(
        tok,
        ymd(visibleWindow.from),
        ymd(visibleWindow.to),
        userFilter || undefined
      );
      setRange(data);
    } catch (err) {
      setRangeError(err instanceof Error ? err.message : String(err));
      setRange(null);
    } finally {
      setRangeLoading(false);
    }
  }, [canAuth, tok, visibleWindow.from, visibleWindow.to, userFilter]);

  const loadTasks = useCallback(async () => {
    if (!canAuth) {
      setTasksData(null);
      return;
    }
    setTasksLoading(true);
    setTasksError(null);
    try {
      const data = await getCalendarItems(tok, tasksPage, { type: "task" });
      if (data.items.length === 0 && data.hasPrev) {
        setTasksPage((p) => Math.max(0, p - 1));
        return;
      }
      setTasksData(data);
    } catch (err) {
      setTasksError(err instanceof Error ? err.message : String(err));
      setTasksData(null);
    } finally {
      setTasksLoading(false);
    }
  }, [canAuth, tok, tasksPage]);

  useEffect(() => {
    void loadRange();
  }, [loadRange]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  function showBanner(kind: "ok" | "err", text: string) {
    setBanner({ kind, text });
    setTimeout(() => setBanner(null), 5000);
  }

  function setView(next: View) {
    const p = new URLSearchParams(params);
    p.set("view", next);
    setParams(p, { replace: true });
  }

  function setAnchor(next: Date) {
    const p = new URLSearchParams(params);
    p.set("date", ymd(next));
    setParams(p, { replace: true });
  }

  function gotoToday() {
    setAnchor(startOfDay(new Date()));
  }

  function step(direction: -1 | 1) {
    if (view === "month") setAnchor(addMonths(anchor, direction));
    else if (view === "week") setAnchor(addDays(anchor, 7 * direction));
    else if (view === "day") setAnchor(addDays(anchor, direction));
    else setAnchor(addDays(anchor, AGENDA_DAYS * direction));
  }

  async function handleUndo() {
    if (!canActor) {
      showBanner("err", "Set actorUserId in Settings to undo.");
      return;
    }
    setUndoBusy(true);
    try {
      const r = await postUndo(tok, actor);
      if (!r.undone) {
        showBanner("err", (r.message && r.message.trim()) || "Nothing to undo for this actor.");
        return;
      }
      showBanner("ok", "Last action was undone.");
      void loadRange();
      void loadTasks();
    } catch (err) {
      showBanner("err", err instanceof Error ? err.message : String(err));
    } finally {
      setUndoBusy(false);
    }
  }

  const dateLabel = useMemo(() => formatRangeLabel(view, anchor), [view, anchor]);

  return (
    <div className="mx-auto max-w-6xl px-3 pb-12 sm:px-4">
      <header className="mb-4 border-b border-slate-800 pb-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
          <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Calendar</h1>
          <p className="text-sm text-slate-500">
            {dateLabel}
            {rangeLoading && <span className="ml-2 text-xs text-slate-600">refreshing…</span>}
          </p>
        </div>
      </header>

      {banner && (
        <div
          role="status"
          className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
            banner.kind === "ok"
              ? "border-emerald-800/60 bg-emerald-950/50 text-emerald-100"
              : "border-red-800/60 bg-red-950/40 text-red-100"
          }`}
        >
          {banner.text}
        </div>
      )}

      {!canAuth && (
        <div className="mb-6 rounded-lg border border-amber-700/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">
          Add your API token in{" "}
          <Link to="/settings" className="font-medium text-amber-50 underline">
            Settings
          </Link>{" "}
          to load the calendar.
        </div>
      )}

      <Toolbar
        view={view}
        onViewChange={setView}
        onPrev={() => step(-1)}
        onNext={() => step(1)}
        onToday={gotoToday}
        onAddEvent={() => setModal({ kind: "add", mode: "event", date: anchor })}
        canAuth={canAuth}
        filterMode={filterMode}
        onFilterMode={setFilterMode}
        filterUser={filterUser}
        setFilterUser={setFilterUser}
        token={tok}
        guildRoster={guildRoster}
        canActor={canActor}
      />

      {rangeError && (
        <p className="mb-4 rounded-lg border border-red-800/50 bg-red-950/30 px-3 py-2 text-sm text-red-200">
          {rangeError}
        </p>
      )}

      <div className="mt-4 flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          {view === "month" && (
            <MonthView
              anchor={anchor}
              events={range ?? []}
              onPickDay={(d) => {
                setAnchor(d);
                setView("day");
              }}
              onPickEvent={(ev) =>
                setModal({
                  kind: "detail",
                  itemId: ev.id,
                  isRecurring: ev.isRecurringInstance,
                  title: ev.title,
                })
              }
            />
          )}
          {view === "week" && (
            <TimeGridView
              days={Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i))}
              events={range ?? []}
              onPickEvent={(ev) =>
                setModal({
                  kind: "detail",
                  itemId: ev.id,
                  isRecurring: ev.isRecurringInstance,
                  title: ev.title,
                })
              }
            />
          )}
          {view === "day" && (
            <TimeGridView
              days={[startOfDay(anchor)]}
              events={range ?? []}
              onPickEvent={(ev) =>
                setModal({
                  kind: "detail",
                  itemId: ev.id,
                  isRecurring: ev.isRecurringInstance,
                  title: ev.title,
                })
              }
            />
          )}
          {view === "agenda" && (
            <AgendaView
              events={range ?? []}
              onPickEvent={(ev) =>
                setModal({
                  kind: "detail",
                  itemId: ev.id,
                  isRecurring: ev.isRecurringInstance,
                  title: ev.title,
                })
              }
            />
          )}

          {canAuth && (
            <div className="mt-4 flex flex-col gap-2 border-t border-slate-800 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-slate-500">
                Undo reverts your latest logged action across all features (buy, wishlist, money, calendar).
              </p>
              <button
                type="button"
                disabled={!canActor || undoBusy}
                onClick={() => void handleUndo()}
                className="min-h-[40px] shrink-0 rounded-lg border border-amber-700/80 bg-amber-950/40 px-4 py-2 text-sm font-medium text-amber-100 hover:bg-amber-950/70 disabled:opacity-40"
              >
                {undoBusy ? "Undoing…" : "Undo last action"}
              </button>
            </div>
          )}
        </div>

        <div className="lg:w-80 lg:shrink-0">
          <TasksPanel
            loading={tasksLoading}
            error={tasksError}
            data={tasksData}
            canAuth={canAuth}
            onAddTask={() => setModal({ kind: "add", mode: "task" })}
            onPickTask={(t) =>
              setModal({ kind: "detail", itemId: t.id, isRecurring: false, title: t.title })
            }
            onPrevPage={() => setTasksPage((p) => Math.max(0, p - 1))}
            onNextPage={() => setTasksPage((p) => p + 1)}
            onRefresh={() => void loadTasks()}
          />
        </div>
      </div>

      <AddItemModal
        open={modal.kind === "add"}
        initialMode={modal.kind === "add" ? modal.mode : "event"}
        initialDate={modal.kind === "add" ? modal.date ?? null : null}
        token={tok}
        guildRoster={guildRoster}
        onClose={() => setModal({ kind: "none" })}
        onCreated={(mode) => {
          setModal({ kind: "none" });
          showBanner("ok", `Added ${mode}.`);
          if (mode === "event") void loadRange();
          else void loadTasks();
        }}
        onError={(m) => showBanner("err", m)}
      />

      <ItemDetailModal
        open={modal.kind === "detail"}
        itemId={modal.kind === "detail" ? modal.itemId : null}
        isRecurringInstance={modal.kind === "detail" ? modal.isRecurring : false}
        initialTitle={modal.kind === "detail" ? modal.title : ""}
        token={tok}
        actorUserId={actor}
        onClose={() => setModal({ kind: "none" })}
        onChanged={() => {
          void loadRange();
          void loadTasks();
        }}
        onError={(m) => showBanner("err", m)}
        onSuccess={(m) => showBanner("ok", m)}
      />
    </div>
  );
}

function Toolbar({
  view,
  onViewChange,
  onPrev,
  onNext,
  onToday,
  onAddEvent,
  canAuth,
  filterMode,
  onFilterMode,
  filterUser,
  setFilterUser,
  token,
  guildRoster,
  canActor,
}: {
  view: View;
  onViewChange: (v: View) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onAddEvent: () => void;
  canAuth: boolean;
  filterMode: "all" | "me" | "user";
  onFilterMode: (m: "all" | "me" | "user") => void;
  filterUser: string;
  setFilterUser: (s: string) => void;
  token: string;
  guildRoster: ReturnType<typeof useDiscordGuildRoster>;
  canActor: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900/40 p-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onToday}
          className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
        >
          Today
        </button>
        <button
          type="button"
          onClick={onPrev}
          aria-label="Previous"
          className="rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
        >
          ‹
        </button>
        <button
          type="button"
          onClick={onNext}
          aria-label="Next"
          className="rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
        >
          ›
        </button>
        <div className="ml-1 inline-flex rounded-lg border border-slate-700 bg-slate-900/60 p-0.5 text-sm">
          {ALL_VIEWS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onViewChange(v)}
              className={`rounded-md px-2.5 py-1 capitalize ${
                view === v ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-slate-700 bg-slate-900/60 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => onFilterMode("all")}
            className={`rounded-md px-2 py-1 ${filterMode === "all" ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-200"}`}
          >
            Everyone
          </button>
          <button
            type="button"
            onClick={() => onFilterMode("me")}
            disabled={!canActor}
            className={`rounded-md px-2 py-1 ${filterMode === "me" ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-200"} disabled:opacity-50`}
            title={canActor ? undefined : "Set actorUserId in Settings"}
          >
            Me
          </button>
          <button
            type="button"
            onClick={() => onFilterMode("user")}
            className={`rounded-md px-2 py-1 ${filterMode === "user" ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-200"}`}
          >
            User…
          </button>
        </div>
        {filterMode === "user" && (
          <div className="flex items-center gap-2">
            <input
              value={filterUser}
              onChange={(e) => setFilterUser(e.target.value)}
              inputMode="numeric"
              placeholder="User id"
              className="h-9 w-32 rounded-md border border-slate-700 bg-slate-950 px-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
            />
            <DiscordMemberSelect
              token={token}
              sharedRoster={guildRoster}
              label=""
              onPickUserId={setFilterUser}
            />
          </div>
        )}
        <button
          type="button"
          disabled={!canAuth}
          onClick={onAddEvent}
          className="rounded-md border border-blue-600 bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
        >
          + Event
        </button>
      </div>
    </div>
  );
}

function parseDateParam(s: string | null): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function computeWindow(view: View, anchor: Date): { from: Date; to: Date } {
  if (view === "month") {
    return { from: startOfMonthGrid(anchor), to: endOfMonthGrid(anchor) };
  }
  if (view === "week") {
    const from = startOfWeek(anchor);
    return { from, to: addDays(from, 7) };
  }
  if (view === "day") {
    const from = startOfDay(anchor);
    return { from, to: addDays(from, 1) };
  }
  const from = startOfDay(anchor);
  return { from, to: addDays(from, AGENDA_DAYS) };
}

function formatRangeLabel(view: View, anchor: Date): string {
  if (view === "month") return formatMonthYear(anchor);
  if (view === "week") return formatWeekRange(anchor);
  if (view === "day") return formatLongDate(anchor);
  return `${formatLongDate(anchor)} + ${AGENDA_DAYS} days`;
}
