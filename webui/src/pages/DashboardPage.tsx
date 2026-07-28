import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  getBuyItems,
  getStaleBuyItems,
  getBudgetNotificationCount,
  getCalendarItems,
  getCalendarToday,
  getCalendarUpcoming,
  getGoogleCalendarStatus,
  getMealPlan,
  getMeta,
  getMoneySummary,
  getMoneyTransactions,
  getBudgetSummaryMonth,
  getBudgetSummaryByCategory,
  getBudgetGoals,
  getWishlistItems,
  postCalendarItemComplete,
  postMealPlanAddToBuy,
  type CalendarListItem,
  type MealPlanEntry,
  type MoneySummary,
  type PagedBuyList,
  type BuyListItem,
  type PagedCalendarList,
  type PagedMoneyTransactions,
  type PagedWishlistList,
} from "../api";
import { useAuth } from "../auth/AuthContext";
import { useDiscordGuildRoster } from "../hooks/useDiscordGuildRoster";
import { useUndoToast } from "../hooks/useUndoToast";
import { useToasts } from "../components/toastContext";
import { titleCase } from "../lib/titleCase";
import { validActorId } from "../lib/validation";
import { Icon, type IconName } from "../components/icons";

function formatMoney(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Slice<T> =
  | { status: "need_token" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; value: T };

function balanceLine(s: MoneySummary): string {
  const a = s.user1Name || s.user1MemberLabel || `User ${s.user1Id}`;
  const b = s.user2Name || s.user2MemberLabel || `User ${s.user2Id}`;
  if (s.balance > 0) return `${b} owes ${a} $${formatMoney(s.balance)} (net).`;
  if (s.balance < 0) return `${a} owes ${b} $${formatMoney(Math.abs(s.balance))} (net).`;
  return `${a} and ${b} are even (net).`;
}

function calendarLine(item: CalendarListItem, mode: "today" | "upcoming"): string {
  const base = item.title.trim() || "(untitled)";
  if (mode === "upcoming" && item.dateText?.trim()) {
    return `${base} · ${item.dateText}`;
  }
  return base;
}

type DashboardBundle = {
  buy: PagedBuyList;
  wishlist: PagedWishlistList;
  moneyTx: PagedMoneyTransactions;
  moneySummary: MoneySummary | null;
  budgetMonth: {
    income: number;
    expenses: number;
    net: number;
    topCategory: string;
    goalsCount: number;
    goalsProgress: string | null;
  } | null;
  budgetAlertCount: number;
  today: PagedCalendarList;
  upcoming: PagedCalendarList;
  tasks: PagedCalendarList;
  mealsToday: MealPlanEntry[];
  staleBuy: BuyListItem[];
  ops: {
    backupWarning: string | null;
    googleConnected: boolean | null;
  };
};

function greetingLine(): { greeting: string; dateLine: string } {
  const now = new Date();
  const hour = now.getHours();
  const greeting =
    hour < 5 ? "Up late?" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const dateLine = now.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  return { greeting, dateLine };
}

export default function DashboardPage() {
  const { token, webUsername, actorUserId } = useAuth();
  const tok = token.trim();
  const actor = actorUserId.trim();
  const canAuth = tok.length > 0;
  const canActor = canAuth && validActorId(actor);
  const { greeting, dateLine } = greetingLine();
  const guildRoster = useDiscordGuildRoster(token);
  const undoToast = useUndoToast();
  const { showToast } = useToasts();

  const [slice, setSlice] = useState<Slice<DashboardBundle>>({ status: "loading" });
  const [onlyMine, setOnlyMine] = useState(false);
  const [completingId, setCompletingId] = useState<number | null>(null);
  const [addingMealId, setAddingMealId] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!canAuth) {
      setSlice({ status: "need_token" });
      return;
    }
    setSlice({ status: "loading" });
    try {
      const roster = guildRoster.data;
      const canPairSummary =
        roster?.available === true && roster.members.length >= 2;
      const u1 = canPairSummary ? roster.members[0].userId : "";
      const u2 = canPairSummary ? roster.members[1].userId : "";
      const n1 = canPairSummary ? roster.members[0].displayName : "";
      const n2 = canPairSummary ? roster.members[1].displayName : "";

      const month = new Date().toISOString().slice(0, 7);
      const todayYmd = new Date().toISOString().slice(0, 10);
      const [buy, wishlist, moneyTx, today, upcoming, tasks, moneySummary, budgetSummary, budgetCats, budgetGoals, meta, mealPlan, budgetAlerts, gcal, staleBuy] =
        await Promise.all([
        getBuyItems(tok, 0),
        getWishlistItems(tok, 0),
        getMoneyTransactions(tok, 0),
        getCalendarToday(tok, 0),
        getCalendarUpcoming(tok, 0),
        getCalendarItems(tok, 0, { type: "task" }),
        canPairSummary && u1 && u2
          ? getMoneySummary(tok, u1, u2, n1, n2).catch(() => null)
          : Promise.resolve(null as MoneySummary | null),
        getBudgetSummaryMonth(tok, month).catch(() => null),
        getBudgetSummaryByCategory(tok, month).catch(() => []),
        getBudgetGoals(tok).catch(() => []),
        getMeta().catch(() => null),
        getMealPlan(tok, todayYmd, todayYmd).catch(() => ({ entries: [] as MealPlanEntry[] })),
        getBudgetNotificationCount(tok).catch(() => ({ count: 0 })),
        getGoogleCalendarStatus(tok).catch(() => null),
        getStaleBuyItems(tok, 14, 8).catch(() => ({ days: 14, items: [] as BuyListItem[] })),
      ]);
      const topCat = budgetCats[0];
      const topGoal = budgetGoals[0];
      const budgetMonth =
        budgetSummary != null
          ? {
              income: budgetSummary.totalIncome,
              expenses: budgetSummary.totalExpenses,
              net: budgetSummary.net,
              topCategory: topCat ? `${topCat.label} (${topCat.percent}%)` : "—",
              goalsCount: budgetGoals.length,
              goalsProgress: topGoal
                ? `${topGoal.name}: ${topGoal.percentComplete}%`
                : null,
            }
          : null;

      const backups =
        meta && typeof meta === "object" && meta !== null
          ? (meta as { backups?: { exists?: boolean; latestModifiedUtc?: string } }).backups
          : undefined;
      let backupWarning: string | null = null;
      if (backups && backups.exists === false) backupWarning = "No backup directory configured.";
      else if (backups?.latestModifiedUtc) {
        const ageMs = Date.now() - Date.parse(backups.latestModifiedUtc);
        if (Number.isFinite(ageMs) && ageMs > 7 * 24 * 60 * 60 * 1000) {
          backupWarning = `Latest backup is ${Math.floor(ageMs / 86400000)} days old.`;
        }
      }

      setSlice({
        status: "ready",
        value: {
          buy,
          wishlist,
          moneyTx,
          moneySummary,
          budgetMonth,
          budgetAlertCount: budgetAlerts.count,
          today,
          upcoming,
          tasks,
          mealsToday: mealPlan.entries,
          staleBuy: staleBuy.items,
          ops: {
            backupWarning,
            googleConnected: gcal ? gcal.connected : null,
          },
        },
      });
    } catch (e) {
      setSlice({
        status: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }, [canAuth, tok, guildRoster.data]);

  useEffect(() => {
    void load();
  }, [load]);

  const bundle = slice.status === "ready" ? slice.value : null;

  const tonightEntry = useMemo(
    () => bundle?.mealsToday.find((e) => e.mealSlot.toLowerCase() === "dinner") ?? null,
    [bundle]
  );

  const visibleToday = useMemo(() => {
    if (!bundle) return [];
    const items = bundle.today.items;
    if (!onlyMine || !canActor) return items;
    return items.filter((it) => !it.assignedTo || it.assignedTo === "0" || it.assignedTo === actor);
  }, [bundle, onlyMine, canActor, actor]);

  const visibleTasks = useMemo(() => {
    if (!bundle) return [];
    const items = bundle.tasks.items.slice(0, 5);
    if (!onlyMine || !canActor) return items;
    return items.filter((it) => !it.assignedTo || it.assignedTo === "0" || it.assignedTo === actor);
  }, [bundle, onlyMine, canActor, actor]);

  async function completeCalendarItem(item: CalendarListItem) {
    if (!canActor) {
      showToast({ message: "Set your actor (Discord user id) in Settings to complete items.", kind: "error" });
      return;
    }
    setCompletingId(item.id);
    try {
      await postCalendarItemComplete(tok, actor, item.id);
      undoToast(`Completed "${item.title.trim() || "(untitled)"}".`, () => void load());
      void load();
    } catch (err) {
      showToast({ message: err instanceof Error ? err.message : String(err), kind: "error" });
    } finally {
      setCompletingId(null);
    }
  }

  async function addMealToBuy(entry: MealPlanEntry) {
    if (!canActor) {
      showToast({ message: "Set your actor (Discord user id) in Settings first.", kind: "error" });
      return;
    }
    setAddingMealId(entry.id);
    try {
      await postMealPlanAddToBuy(tok, entry.id, actor);
      undoToast("Added tonight's ingredients to the buy list.", () => void load());
    } catch (err) {
      showToast({ message: err instanceof Error ? err.message : String(err), kind: "error" });
    } finally {
      setAddingMealId(null);
    }
  }

  const attentionRows: { icon: IconName; text: ReactNode; to: string; action: string }[] = [];
  if (bundle) {
    if (bundle.budgetAlertCount > 0) {
      attentionRows.push({
        icon: "budget",
        text: `${bundle.budgetAlertCount} budget alert${bundle.budgetAlertCount === 1 ? "" : "s"} pending review`,
        to: "/budget",
        action: "Review",
      });
    }
    if (bundle.staleBuy.length > 0) {
      attentionRows.push({
        icon: "buy",
        text: `${bundle.staleBuy.length} item${bundle.staleBuy.length === 1 ? "" : "s"} on the buy list for 14+ days — ${bundle.staleBuy
          .slice(0, 2)
          .map((i) => i.name)
          .join(", ")}${bundle.staleBuy.length > 2 ? "…" : ""}`,
        to: "/buy",
        action: "Clean up",
      });
    }
    if (!tonightEntry) {
      attentionRows.push({
        icon: "meals",
        text: "No dinner planned for tonight",
        to: "/meals",
        action: "Plan dinner",
      });
    }
    if (bundle.ops.backupWarning) {
      attentionRows.push({
        icon: "alert",
        text: bundle.ops.backupWarning,
        to: "/health",
        action: "Diagnostics",
      });
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-400">{dateLine}</p>
        <h1 className="mt-1 text-3xl font-semibold text-white">
          <span className="hb-text-gradient">{greeting}</span>
          {webUsername ? `, ${titleCase(webUsername)}` : ""}
        </h1>
        <p className="mt-1.5 text-slate-400">
          Here's what needs you today.
        </p>
      </div>

      {/* Cockpit stat strip */}
      {bundle && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="At a glance">
          <div className="hb-stat px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Net this month</p>
            <p className={`mt-1 font-display text-xl font-semibold ${bundle.budgetMonth ? (bundle.budgetMonth.net >= 0 ? "text-emerald-400" : "text-red-400") : "text-slate-500"}`}>
              {bundle.budgetMonth ? `$${formatMoney(bundle.budgetMonth.net)}` : "—"}
            </p>
          </div>
          <div className="hb-stat px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Today</p>
            <p className="mt-1 font-display text-xl font-semibold text-white">{bundle.today.totalCount}</p>
          </div>
          <div className="hb-stat px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Open tasks</p>
            <p className="mt-1 font-display text-xl font-semibold text-white">{bundle.tasks.totalCount}</p>
          </div>
          <div className="hb-stat px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Alerts</p>
            <p className={`mt-1 font-display text-xl font-semibold ${bundle.budgetAlertCount > 0 ? "text-amber-400" : "text-slate-500"}`}>
              {bundle.budgetAlertCount}
            </p>
          </div>
        </div>
      )}

      {!canAuth && (
        <div className="rounded-lg border border-amber-700/50 bg-amber-950/40 px-4 py-3 text-sm text-amber-100">
          No bearer token stored.{" "}
          <Link to="/login" className="font-medium text-amber-50 underline">
            Sign in
          </Link>{" "}
          with a household account, or add <code className="rounded bg-slate-900 px-1">HOMEBOT_API_TOKEN</code> in{" "}
          <Link to="/settings" className="font-medium text-amber-50 underline">
            Settings
          </Link>
          .
        </div>
      )}

      {slice.status === "error" && (
        <div className="rounded-lg border border-red-800/60 bg-red-950/40 px-4 py-3 text-sm text-red-100">
          Could not load dashboard: {slice.message}
          <button
            type="button"
            className="ml-3 text-red-200 underline hover:text-white"
            onClick={() => void load()}
          >
            Retry
          </button>
        </div>
      )}

      {slice.status === "loading" && canAuth && (
        <p className="text-sm text-slate-500">Loading overview…</p>
      )}

      {bundle && (
        <>
          {/* Catch-up inbox */}
          {attentionRows.length > 0 && (
            <section aria-label="Needs attention">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Needs attention
              </h2>
              <ul className="space-y-2">
                {attentionRows.map((row, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-3 rounded-2xl border border-amber-800/40 bg-amber-950/25 px-4 py-3"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-300">
                      <Icon name={row.icon} className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-amber-100/90">{row.text}</span>
                    <Link
                      to={row.to}
                      className="shrink-0 rounded-lg bg-amber-500/20 px-2.5 py-1 text-xs font-semibold text-amber-200 transition-colors hover:bg-amber-500/30"
                    >
                      {row.action}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="grid gap-4 lg:grid-cols-5">
            {/* Tonight */}
            <section className="hb-border-glow lg:col-span-2" aria-label="Tonight">
            <div className="hb-card relative h-full overflow-hidden p-5">
              <div
                className="pointer-events-none absolute inset-0 bg-gradient-to-br from-cyan-500/15 via-transparent to-violet-600/10"
                aria-hidden
              />
              <div className="relative">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600/20 text-blue-300">
                    <Icon name="meals" className="h-4 w-4" />
                  </span>
                  <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-blue-300">
                    Tonight
                  </h2>
                </div>
                {tonightEntry ? (
                  <>
                    <p className="mt-3 text-xl font-semibold text-white">
                      {tonightEntry.customLabel || tonightEntry.recipeName || "Dinner TBD"}
                    </p>
                    <p className="mt-1 text-sm text-slate-400">
                      {bundle.mealsToday.length} meal{bundle.mealsToday.length === 1 ? "" : "s"} planned today
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={addingMealId === tonightEntry.id}
                        onClick={() => void addMealToBuy(tonightEntry)}
                        className="rounded-xl bg-blue-600/80 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
                      >
                        {addingMealId === tonightEntry.id ? "Adding…" : "Add ingredients to buy list"}
                      </button>
                      <Link
                        to="/meals"
                        className="rounded-xl hb-btn-soft px-3 py-1.5 text-xs font-semibold text-slate-200"
                      >
                        Meal plan
                      </Link>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="mt-3 text-xl font-semibold text-white">Nothing planned yet</p>
                    <p className="mt-1 text-sm text-slate-400">
                      Pick dinner and the ingredients can go straight to the buy list.
                    </p>
                    <Link
                      to="/meals"
                      className="mt-4 inline-block rounded-xl bg-blue-600/80 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-500"
                    >
                      Plan tonight
                    </Link>
                  </>
                )}
              </div>
            </div>
            </section>

            {/* Today band */}
            <section className="hb-card p-5 lg:col-span-3" aria-label="Today">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600/20 text-blue-300">
                    <Icon name="calendar" className="h-4 w-4" />
                  </span>
                  <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-blue-300">
                    Today
                  </h2>
                </div>
                {canActor && (
                  <button
                    type="button"
                    onClick={() => setOnlyMine((v) => !v)}
                    aria-pressed={onlyMine}
                    className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                      onlyMine
                        ? "border-blue-500/60 bg-blue-950/60 text-blue-200"
                        : "border-slate-700 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <Icon name="user" className="h-3.5 w-3.5" />
                    Assigned to me
                  </button>
                )}
              </div>

              {visibleToday.length === 0 && visibleTasks.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">
                  Nothing scheduled{onlyMine ? " for you" : ""} — enjoy the quiet.
                </p>
              ) : (
                <ul className="mt-3 divide-y divide-slate-800/70">
                  {visibleToday.map((it) => (
                    <li
                      key={it.instanceStartUtc ? `t-${it.id}-${it.instanceStartUtc}` : `t-${it.id}`}
                      className="flex items-center gap-3 py-2.5"
                    >
                      <button
                        type="button"
                        disabled={completingId === it.id}
                        onClick={() => void completeCalendarItem(it)}
                        aria-label={`Complete ${it.title}`}
                        title={canActor ? "Mark complete" : "Set actorUserId in Settings to complete"}
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-600 text-transparent transition-colors hover:border-emerald-400 hover:bg-emerald-500/15 hover:text-emerald-300 disabled:opacity-50"
                      >
                        <Icon name="check" className="h-3 w-3" />
                      </button>
                      <span className="min-w-0 flex-1 truncate text-sm text-slate-200">
                        {calendarLine(it, "today")}
                      </span>
                      {it.assignedToMemberLabel && (
                        <span className="shrink-0 rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400">
                          {it.assignedToMemberLabel}
                        </span>
                      )}
                    </li>
                  ))}
                  {visibleTasks.map((it) => (
                    <li key={`task-${it.id}`} className="flex items-center gap-3 py-2.5">
                      <button
                        type="button"
                        disabled={completingId === it.id}
                        onClick={() => void completeCalendarItem(it)}
                        aria-label={`Complete ${it.title}`}
                        title={canActor ? "Mark complete" : "Set actorUserId in Settings to complete"}
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-600 text-transparent transition-colors hover:border-emerald-400 hover:bg-emerald-500/15 hover:text-emerald-300 disabled:opacity-50"
                      >
                        <Icon name="check" className="h-3 w-3" />
                      </button>
                      <span className="min-w-0 flex-1 truncate text-sm text-slate-300">
                        {it.title.trim() || "(untitled)"}
                      </span>
                      <span className="shrink-0 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-500">
                        task
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {(bundle.today.totalCount > visibleToday.length || bundle.tasks.totalCount > 5) && (
                <p className="mt-2 text-xs text-slate-500">
                  <Link to="/calendar" className="text-blue-400 hover:underline">
                    Open calendar
                  </Link>{" "}
                  for the full list.
                </p>
              )}
            </section>
          </div>

          {/* Later / at a glance */}
          <section aria-label="Later">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Later
            </h2>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <SnapshotCard
                to="/calendar"
                icon="calendar"
                title="Coming up"
                subtitle="Next on the calendar"
                stat={`${bundle.upcoming.totalCount} upcoming`}
              >
                <ul className="mt-2 space-y-1 text-sm text-slate-400">
                  {bundle.upcoming.items.length === 0 ? (
                    <li>Nothing on the horizon.</li>
                  ) : (
                    bundle.upcoming.items.slice(0, 4).map((it) => (
                      <li
                        key={it.instanceStartUtc ? `u-${it.id}-${it.instanceStartUtc}` : `u-${it.id}`}
                        className="truncate"
                      >
                        {calendarLine(it, "upcoming")}
                      </li>
                    ))
                  )}
                </ul>
              </SnapshotCard>

              <SnapshotCard
                to="/buy"
                icon="buy"
                title="Buy list"
                subtitle="Active shopping items"
                stat={`${bundle.buy.totalCount} open`}
              >
                <ul className="mt-2 space-y-1 text-sm text-slate-400">
                  {bundle.buy.items.length === 0 ? (
                    <li>Nothing on the list.</li>
                  ) : (
                    bundle.buy.items.slice(0, 5).map((it) => (
                      <li key={it.id} className="truncate">
                        {it.name}
                        {it.store ? <span className="text-slate-500"> · {it.store}</span> : null}
                      </li>
                    ))
                  )}
                </ul>
              </SnapshotCard>

              <SnapshotCard
                to="/budget"
                icon="budget"
                title="Budget"
                subtitle="This month"
                stat={bundle.budgetMonth ? `$${formatMoney(bundle.budgetMonth.net)} net` : "—"}
              >
                {bundle.budgetMonth ? (
                  <div className="mt-2 space-y-1 text-sm text-slate-400">
                    <p>
                      Income ${formatMoney(bundle.budgetMonth.income)} · spent $
                      {formatMoney(bundle.budgetMonth.expenses)}
                    </p>
                    <p>Top category: {titleCase(bundle.budgetMonth.topCategory)}</p>
                    {bundle.budgetMonth.goalsCount > 0 && (
                      <p>
                        {bundle.budgetMonth.goalsCount} savings goal
                        {bundle.budgetMonth.goalsCount === 1 ? "" : "s"}
                        {bundle.budgetMonth.goalsProgress ? ` · ${bundle.budgetMonth.goalsProgress}` : ""}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">No budget data yet.</p>
                )}
              </SnapshotCard>

              <SnapshotCard
                to="/wishlist"
                icon="wishlist"
                title="Wishlist"
                subtitle="Open wishes"
                stat={`${bundle.wishlist.totalCount} open`}
              >
                <ul className="mt-2 space-y-1 text-sm text-slate-400">
                  {bundle.wishlist.items.length === 0 ? (
                    <li>No wishlist rows.</li>
                  ) : (
                    bundle.wishlist.items.slice(0, 5).map((it) => (
                      <li key={it.id} className="truncate">
                        {it.name}
                        {it.priority ? <span className="text-slate-500"> · {it.priority}</span> : null}
                      </li>
                    ))
                  )}
                </ul>
              </SnapshotCard>

              <SnapshotCard
                to="/money"
                icon="money"
                title="Money"
                subtitle="Transactions & balance"
                stat={`${bundle.moneyTx.totalCount} transactions`}
              >
                {bundle.moneySummary ? (
                  <p className="mt-2 text-sm leading-relaxed text-slate-300">
                    {balanceLine(bundle.moneySummary)}
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">
                    {guildRoster.data?.available === false
                      ? "Discord roster unavailable — open Money to pick two people for net balance."
                      : (guildRoster.data?.members.length ?? 0) < 2
                        ? "Need at least two guild members in roster to show a sample net balance here."
                        : "Could not load sample balance for the first two roster members."}
                  </p>
                )}
              </SnapshotCard>

              <SnapshotCard
                to="/calendar"
                icon="tasks"
                title="Tasks"
                subtitle="Open calendar tasks"
                stat={`${bundle.tasks.totalCount} open`}
              >
                <ul className="mt-2 space-y-1 text-sm text-slate-400">
                  {bundle.tasks.items.length === 0 ? (
                    <li>No open tasks.</li>
                  ) : (
                    bundle.tasks.items.slice(0, 5).map((it) => (
                      <li key={it.id} className="truncate">
                        {it.title.trim() || "(untitled)"}
                      </li>
                    ))
                  )}
                </ul>
              </SnapshotCard>
            </div>
          </section>

          {bundle.ops.googleConnected != null && (
            <p className="text-xs text-slate-500">
              Google Calendar:{" "}
              {bundle.ops.googleConnected ? (
                <span className="text-emerald-400">connected</span>
              ) : (
                <span className="text-slate-400">not connected</span>
              )}{" "}
              ·{" "}
              <Link to="/calendar" className="text-blue-400 hover:underline">
                Calendar settings
              </Link>
            </p>
          )}
        </>
      )}
    </div>
  );
}

function SnapshotCard({
  to,
  icon,
  title,
  subtitle,
  stat,
  children,
}: {
  to: string;
  icon: IconName;
  title: string;
  subtitle: string;
  stat: string;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      className="group flex flex-col hb-card p-4 text-left transition-all hover:-translate-y-0.5 hover:border-cyan-400/40 hover:shadow-[0_0_28px_-8px] hover:shadow-cyan-400/25"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/15 text-blue-300 ring-1 ring-blue-400/20 transition-all group-hover:bg-blue-500/25 group-hover:ring-blue-400/40">
            <Icon name={icon} className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-white">{title}</div>
            <p className="mt-0.5 truncate text-xs text-slate-500">{titleCase(subtitle)}</p>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-slate-800/80 px-2.5 py-0.5 text-xs font-medium text-slate-200 ring-1 ring-slate-700/60">
          {stat}
        </span>
      </div>
      <div className="mt-2 flex-1">{children}</div>
      <span className="mt-3 text-xs font-medium text-blue-400">
        Open{" "}
        <span aria-hidden className="inline-block transition-transform group-hover:translate-x-0.5">
          →
        </span>
      </span>
    </Link>
  );
}
