import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  downloadCalendarIcs,
  getCalendarItems,
  getCalendarRange,
  getGoogleCalendarOAuthUrl,
  getGoogleCalendarStatus,
  getGoogleCalendars,
  postCalendarImportIcs,
  putGoogleCalendarPick,
  postGoogleCalendarDisconnect,
  postGoogleCalendarSync,
  postUndo,
  type GoogleCalendarStatus,
  type GoogleCalendarListItem,
  type CalendarRangeItem,
  type PagedCalendarList,
} from "../api";
import { useAuth } from "../auth/AuthContext";
import DiscordMemberSelect from "../components/DiscordMemberSelect";
import TimeZoneSelect from "../components/TimeZoneSelect";
import { useCalendarZone } from "../calendar/CalendarZoneContext";
import {
  addDaysYmd,
  addMonthsYmd,
  computeRangeQuery,
  dayRange,
  formatLongDateYmd,
  formatMonthYearYmd,
  formatWeekRangeYmd,
  parseAnchorYmd,
  todayYmd,
  weekRangeSunday,
  ymdListForDays,
} from "../calendar/calendarZoned";
import { useDiscordGuildRoster } from "../hooks/useDiscordGuildRoster";
import { useHorizontalSwipe } from "../hooks/useHorizontalSwipe";
import { useSearchHighlightId } from "../lib/searchHighlight";
import { validActorId } from "../lib/validation";
import AddItemModal from "../calendar/AddItemModal";
import AgendaView from "../calendar/AgendaView";
import ItemDetailModal from "../calendar/ItemDetailModal";
import MonthView from "../calendar/MonthView";
import TasksPanel from "../calendar/TasksPanel";
import TimeGridView from "../calendar/TimeGridView";

type View = "month" | "week" | "day" | "agenda";

const ALL_VIEWS: View[] = ["month", "week", "day", "agenda"];
const AGENDA_DAYS = 60;

export default function CalendarPage() {
  const { token, actorUserId } = useAuth();
  const { viewerTimeZone, effectiveViewerZone, setViewerTimeZone } = useCalendarZone();
  const tok = token.trim();
  const actor = actorUserId.trim();
  const canAuth = tok.length > 0;
  const canActor = canAuth && validActorId(actor);
  const guildRoster = useDiscordGuildRoster(token);

  const [params, setParams] = useSearchParams();
  const view = (ALL_VIEWS.includes(params.get("view") as View) ? params.get("view") : "month") as View;
  const dateParam = params.get("date");
  const anchorYmd = useMemo(
    () => parseAnchorYmd(dateParam, effectiveViewerZone),
    [dateParam, effectiveViewerZone]
  );

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
  const [gcal, setGcal] = useState<GoogleCalendarStatus | null>(null);
  const [gcalCalendars, setGcalCalendars] = useState<GoogleCalendarListItem[]>([]);
  const [undoBusy, setUndoBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  type ModalState =
    | { kind: "none" }
    | { kind: "add"; mode: "event" | "task"; ymd?: string }
    | {
        kind: "detail";
        itemId: number;
        isRecurring?: boolean;
        title?: string;
        instanceStartUtc?: string;
        /** Wall position on calendar (display override or canonical). */
        instanceWallClockUtc?: string;
      };
  const [modal, setModal] = useState<ModalState>({ kind: "none" });

  const rangeYmd = useMemo(
    () => computeRangeQuery(view, anchorYmd, effectiveViewerZone, AGENDA_DAYS),
    [view, anchorYmd, effectiveViewerZone]
  );

  const weekDayYmds = useMemo(() => {
    const { fromYmd } = weekRangeSunday(anchorYmd, effectiveViewerZone);
    return ymdListForDays(fromYmd, effectiveViewerZone, 7);
  }, [anchorYmd, effectiveViewerZone]);

  const singleDayYmds = useMemo(() => {
    const { fromYmd } = dayRange(anchorYmd, effectiveViewerZone);
    return [fromYmd];
  }, [anchorYmd, effectiveViewerZone]);

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
        rangeYmd.fromYmd,
        rangeYmd.toYmd,
        userFilter || undefined,
        effectiveViewerZone
      );
      setRange(data);
    } catch (err) {
      setRangeError(err instanceof Error ? err.message : String(err));
      setRange(null);
    } finally {
      setRangeLoading(false);
    }
  }, [canAuth, tok, rangeYmd.fromYmd, rangeYmd.toYmd, userFilter, effectiveViewerZone]);

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

  const highlightId = useSearchHighlightId();

  useEffect(() => {
    if (!canAuth || !highlightId) return;
    setModal({ kind: "detail", itemId: highlightId });
  }, [canAuth, highlightId]);

  useEffect(() => {
    if (!canAuth) {
      setGcal(null);
      return;
    }
    void getGoogleCalendarStatus(tok)
      .then(async (status) => {
        setGcal(status);
        if (status.connected) {
          try {
            const { calendars } = await getGoogleCalendars(tok);
            setGcalCalendars(calendars);
          } catch {
            setGcalCalendars([]);
          }
        } else {
          setGcalCalendars([]);
        }
      })
      .catch(() => setGcal({ configured: false, connected: false }));
    if (params.get("google") === "connected") {
      showBanner("ok", "Google Calendar connected.");
      const p = new URLSearchParams(params);
      p.delete("google");
      setParams(p, { replace: true });
    }
  }, [canAuth, tok, params, setParams]);

  async function connectGoogle() {
    if (!canAuth) return;
    try {
      const { url } = await getGoogleCalendarOAuthUrl(tok);
      window.location.href = url;
    } catch (e) {
      showBanner("err", e instanceof Error ? e.message : String(e));
    }
  }

  async function disconnectGoogle() {
    if (!canAuth) return;
    try {
      await postGoogleCalendarDisconnect(tok);
      setGcal(await getGoogleCalendarStatus(tok));
      showBanner("ok", "Google Calendar disconnected.");
    } catch (e) {
      showBanner("err", e instanceof Error ? e.message : String(e));
    }
  }

  async function pickGoogleCalendar(calendarId: string) {
    if (!canAuth || !calendarId) return;
    try {
      await putGoogleCalendarPick(tok, calendarId);
      setGcal(await getGoogleCalendarStatus(tok));
      showBanner("ok", "Google calendar updated.");
    } catch (e) {
      showBanner("err", e instanceof Error ? e.message : String(e));
    }
  }

  async function syncGoogleNow() {
    if (!canAuth) return;
    try {
      await postGoogleCalendarSync(tok);
      setGcal(await getGoogleCalendarStatus(tok));
      showBanner("ok", "Google sync started.");
      void loadRange();
    } catch (e) {
      showBanner("err", e instanceof Error ? e.message : String(e));
    }
  }

  function showBanner(kind: "ok" | "err", text: string) {
    setBanner({ kind, text });
    setTimeout(() => setBanner(null), 5000);
  }

  function setView(next: View) {
    const p = new URLSearchParams(params);
    p.set("view", next);
    setParams(p, { replace: true });
  }

  function setAnchorYmd(nextYmd: string) {
    const p = new URLSearchParams(params);
    p.set("date", nextYmd);
    setParams(p, { replace: true });
  }

  /** Open day view on a specific date (single URL update so date is not lost). */
  function openDay(ymd: string) {
    const p = new URLSearchParams(params);
    p.set("date", ymd);
    p.set("view", "day");
    setParams(p, { replace: true });
  }

  function gotoToday() {
    setAnchorYmd(todayYmd(effectiveViewerZone));
  }

  function step(direction: -1 | 1) {
    if (view === "month") setAnchorYmd(addMonthsYmd(anchorYmd, direction));
    else if (view === "week") setAnchorYmd(addDaysYmd(anchorYmd, 7 * direction));
    else if (view === "day") setAnchorYmd(addDaysYmd(anchorYmd, direction));
    else setAnchorYmd(addDaysYmd(anchorYmd, AGENDA_DAYS * direction));
  }

  const calendarSwipe = useHorizontalSwipe(step);

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

  const dateLabel = useMemo(
    () => formatRangeLabelYmd(view, anchorYmd, effectiveViewerZone),
    [view, anchorYmd, effectiveViewerZone]
  );

  async function handleExportIcs() {
    if (!canAuth) return;
    setExportBusy(true);
    try {
      await downloadCalendarIcs(
        tok,
        rangeYmd.fromYmd,
        rangeYmd.toYmd,
        effectiveViewerZone,
        userFilter || undefined
      );
      showBanner("ok", "Downloaded .ics file for current view range.");
    } catch (err) {
      showBanner("err", err instanceof Error ? err.message : String(err));
    } finally {
      setExportBusy(false);
    }
  }

  async function handleImportIcs(file: File) {
    if (!canAuth || !canActor) {
      showBanner("err", "Set actorUserId in Settings to import events.");
      return;
    }
    setImportBusy(true);
    try {
      const res = await postCalendarImportIcs(tok, actor, file);
      showBanner("ok", `Imported ${res.imported} event(s) from .ics (${res.parsed} parsed).`);
      void loadRange();
      void loadTasks();
    } catch (err) {
      showBanner("err", err instanceof Error ? err.message : String(err));
    } finally {
      setImportBusy(false);
    }
  }

  return (
    <div className="mx-auto min-w-0 max-w-6xl px-3 pb-12 sm:px-4">
      <header className="mb-4 border-b border-slate-800 pb-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
          <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Calendar</h1>
          <p className="min-w-0 break-words text-sm text-slate-500">
            {dateLabel}
            <span className="ml-2 text-xs text-slate-600">· {effectiveViewerZone}</span>
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

      {canAuth && gcal?.configured ? (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3 text-sm text-slate-300">
          <span className="font-medium text-slate-200">Google Calendar</span>
          {gcal.connected ? (
            <>
              <span className="text-emerald-400">Connected</span>
              {gcal.connection?.lastSyncAt ? (
                <span className="text-xs text-slate-500">Last sync: {gcal.connection.lastSyncAt}</span>
              ) : null}
              {gcal.connection?.lastSyncError ? (
                <span className="text-xs text-amber-400" title={gcal.connection.lastSyncError}>
                  Sync issue
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => void syncGoogleNow()}
                className="rounded-md bg-slate-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-600"
              >
                Sync now
              </button>
              <button
                type="button"
                onClick={() => void disconnectGoogle()}
                className="rounded-md border border-slate-600 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800"
              >
                Disconnect
              </button>
              {gcalCalendars.length > 0 ? (
                <select
                  value={gcal.connection?.calendarId ?? "primary"}
                  onChange={(e) => void pickGoogleCalendar(e.target.value)}
                  className="hb-input px-2 py-1 text-xs text-slate-200"
                  title="Target Google calendar"
                >
                  {gcalCalendars.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.summary}
                      {c.primary ? " (primary)" : ""}
                    </option>
                  ))}
                </select>
              ) : null}
            </>
          ) : (
            <>
              <span className="text-slate-500">Not connected</span>
              <button
                type="button"
                onClick={() => void connectGoogle()}
                className="rounded-md bg-gradient-to-r from-blue-600 to-blue-700 px-2.5 py-1 text-xs font-medium text-white hover:from-blue-500 hover:to-blue-600"
              >
                Connect Google
              </button>
            </>
          )}
        </div>
      ) : null}

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
        onAddEvent={() => setModal({ kind: "add", mode: "event", ymd: anchorYmd })}
        canAuth={canAuth}
        filterMode={filterMode}
        onFilterMode={setFilterMode}
        filterUser={filterUser}
        setFilterUser={setFilterUser}
        token={tok}
        guildRoster={guildRoster}
        canActor={canActor}
        viewerTimeZone={viewerTimeZone}
        onViewerTimeZone={setViewerTimeZone}
        onExportIcs={() => void handleExportIcs()}
        exportBusy={exportBusy}
        canExport={canAuth}
        onImportIcs={() => importInputRef.current?.click()}
        importBusy={importBusy}
        canImport={canAuth && canActor}
      />

      <input
        ref={importInputRef}
        type="file"
        accept=".ics,text/calendar"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleImportIcs(f);
          e.target.value = "";
        }}
      />

      {rangeError && (
        <p className="mb-4 rounded-lg border border-red-800/50 bg-red-950/30 px-3 py-2 text-sm text-red-200">
          {rangeError}
        </p>
      )}

      <div className="mt-4 flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 touch-pan-y" {...calendarSwipe}>
          {view === "month" && (
            <MonthView
              anchorYmd={anchorYmd}
              displayZone={effectiveViewerZone}
              events={range ?? []}
              onPickDay={openDay}
              onPickEvent={(ev) =>
                setModal({
                  kind: "detail",
                  itemId: ev.id,
                  isRecurring: ev.isRecurringInstance,
                  title: ev.title,
                  instanceStartUtc: ev.instanceStartUtc,
                  instanceWallClockUtc: ev.displayInstanceStartUtc ?? ev.instanceStartUtc,
                })
              }
            />
          )}
          {view === "week" && (
            <TimeGridView
              dayYmds={weekDayYmds}
              displayZone={effectiveViewerZone}
              events={range ?? []}
              onPickDay={openDay}
              onPickEvent={(ev) =>
                setModal({
                  kind: "detail",
                  itemId: ev.id,
                  isRecurring: ev.isRecurringInstance,
                  title: ev.title,
                  instanceStartUtc: ev.instanceStartUtc,
                  instanceWallClockUtc: ev.displayInstanceStartUtc ?? ev.instanceStartUtc,
                })
              }
            />
          )}
          {view === "day" && (
            <TimeGridView
              dayYmds={singleDayYmds}
              displayZone={effectiveViewerZone}
              events={range ?? []}
              onPickEvent={(ev) =>
                setModal({
                  kind: "detail",
                  itemId: ev.id,
                  isRecurring: ev.isRecurringInstance,
                  title: ev.title,
                  instanceStartUtc: ev.instanceStartUtc,
                  instanceWallClockUtc: ev.displayInstanceStartUtc ?? ev.instanceStartUtc,
                })
              }
            />
          )}
          {view === "agenda" && (
            <AgendaView
              events={range ?? []}
              displayZone={effectiveViewerZone}
              onPickEvent={(ev) =>
                setModal({
                  kind: "detail",
                  itemId: ev.id,
                  isRecurring: ev.isRecurringInstance,
                  title: ev.title,
                  instanceStartUtc: ev.instanceStartUtc,
                  instanceWallClockUtc: ev.displayInstanceStartUtc ?? ev.instanceStartUtc,
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
        initialYmd={modal.kind === "add" ? modal.ymd ?? null : null}
        eventTimeZoneDefault={effectiveViewerZone}
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
        instanceStartUtc={modal.kind === "detail" ? modal.instanceStartUtc : null}
        instanceWallClockUtc={modal.kind === "detail" ? modal.instanceWallClockUtc : null}
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
  viewerTimeZone,
  onViewerTimeZone,
  onExportIcs,
  exportBusy,
  canExport,
  onImportIcs,
  importBusy,
  canImport,
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
  viewerTimeZone: string;
  onViewerTimeZone: (z: string) => void;
  onExportIcs: () => void;
  exportBusy: boolean;
  canExport: boolean;
  onImportIcs: () => void;
  importBusy: boolean;
  canImport: boolean;
}) {
  return (
    <div className="flex min-w-0 w-full flex-col gap-3 hb-card p-3">
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onToday}
            className="shrink-0 rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
          >
            Today
          </button>
          {canExport && (
            <button
              type="button"
              disabled={exportBusy}
              onClick={onExportIcs}
              className="shrink-0 rounded-md hb-btn-soft px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700 disabled:opacity-50"
            >
              {exportBusy ? "Exporting…" : "Export .ics"}
            </button>
          )}
          {canImport && (
            <button
              type="button"
              disabled={importBusy}
              onClick={onImportIcs}
              className="shrink-0 rounded-md hb-btn-soft px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700 disabled:opacity-50"
            >
              {importBusy ? "Importing…" : "Import .ics"}
            </button>
          )}
          <div className="inline-flex shrink-0 items-center gap-1">
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
          </div>
        </div>
        <div className="grid min-w-0 w-full grid-cols-4 gap-0.5 rounded-lg border border-slate-700 bg-slate-900/60 p-0.5 text-xs sm:ml-1 sm:w-auto sm:max-w-sm sm:shrink-0 sm:text-sm">
          {ALL_VIEWS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onViewChange(v)}
              className={`min-h-[2.25rem] rounded-md px-1 py-1 capitalize leading-tight sm:px-2.5 sm:py-1 ${
                view === v ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-w-0 w-full flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center lg:gap-3">
        <div className="inline-flex max-w-full shrink-0 flex-wrap rounded-lg border border-slate-700 bg-slate-900/60 p-0.5 text-xs">
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
          <div className="grid min-w-0 w-full max-w-full grid-cols-1 gap-2 sm:grid-cols-2 sm:items-end">
            <div className="min-w-0">
              <label htmlFor="cal-filter-user" className="mb-1 block text-xs font-medium text-slate-400">
                User id
              </label>
              <input
                id="cal-filter-user"
                value={filterUser}
                onChange={(e) => setFilterUser(e.target.value)}
                inputMode="numeric"
                placeholder="Discord user id"
                className="box-border h-9 w-full min-w-0 rounded-md border border-slate-700 bg-slate-950 px-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <DiscordMemberSelect
              token={token}
              sharedRoster={guildRoster}
              label="Pick person"
              value={filterUser}
              onPickUserId={setFilterUser}
              className="min-w-0"
            />
          </div>
        )}
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <button
            type="button"
            disabled={!canAuth}
            onClick={onAddEvent}
            className="shrink-0 rounded-md border border-blue-500/60 bg-gradient-to-r from-blue-600 to-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:from-blue-500 hover:to-blue-600 disabled:opacity-50"
          >
            + Event
          </button>
          <label className="flex min-w-0 max-w-full flex-col gap-1 text-xs text-slate-400 sm:flex-row sm:items-center sm:gap-2">
            <span className="shrink-0">View TZ</span>
            <TimeZoneSelect
              value={viewerTimeZone}
              onChange={onViewerTimeZone}
              disabled={!canAuth}
              className="box-border h-9 min-h-9 w-full min-w-0 max-w-full rounded-md border border-slate-700 bg-slate-950 px-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none sm:max-w-[280px]"
            />
          </label>
        </div>
      </div>
    </div>
  );
}

function formatRangeLabelYmd(view: View, anchorYmd: string, zone: string): string {
  if (view === "month") return formatMonthYearYmd(anchorYmd, zone);
  if (view === "week") return formatWeekRangeYmd(anchorYmd, zone);
  if (view === "day") return formatLongDateYmd(anchorYmd, zone);
  return `${formatLongDateYmd(anchorYmd, zone)} + ${AGENDA_DAYS} days`;
}
