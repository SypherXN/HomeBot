import { useCallback, useEffect, useState, type ReactNode } from "react";
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

function formatDashboardCalendarLine(item: PagedCalendarList["items"][number], mode: "today" | "upcoming"): string {
  const base = item.title.trim() || "(untitled)";
  const icon = item.type === "task" ? "📝" : "📅";
  if (mode === "upcoming" && item.dateText?.trim()) {
    return `${icon} ${base} · ${item.dateText}`;
  }
  return `${icon} ${base}`;
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

export default function DashboardPage() {
  const { token } = useAuth();
  const tok = token.trim();
  const canAuth = tok.length > 0;
  const guildRoster = useDiscordGuildRoster(token);

  const [slice, setSlice] = useState<Slice<DashboardBundle>>({ status: "loading" });

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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-white">Dashboard</h1>
        <p className="mt-1 text-slate-400">
          Today at a glance — meals, calendar, lists, budget, and ops. Press{" "}
          <kbd className="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-300">/</kbd> to search. Configure in{" "}
          <Link to="/settings" className="text-blue-400 hover:underline">
            Settings
          </Link>
          .
        </p>
      </div>

      {slice.status === "ready" && (slice.value.ops.backupWarning || slice.value.budgetAlertCount > 0) ? (
        <div className="space-y-2">
          {slice.value.ops.backupWarning ? (
            <div className="rounded-lg border border-amber-800/50 bg-amber-950/40 px-4 py-2 text-sm text-amber-100">
              {slice.value.ops.backupWarning}{" "}
              <Link to="/health" className="font-medium underline">
                Diagnostics
              </Link>
            </div>
          ) : null}
          {slice.value.budgetAlertCount > 0 ? (
            <div className="rounded-lg border border-amber-800/50 bg-amber-950/40 px-4 py-2 text-sm text-amber-100">
              {slice.value.budgetAlertCount} budget alert{slice.value.budgetAlertCount === 1 ? "" : "s"} pending.{" "}
              <Link to="/budget" className="font-medium underline">
                Review budget
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}

      {slice.status === "ready" && slice.value.ops.googleConnected != null ? (
        <p className="text-xs text-slate-500">
          Google Calendar:{" "}
          {slice.value.ops.googleConnected ? (
            <span className="text-emerald-400">connected</span>
          ) : (
            <span className="text-slate-400">not connected</span>
          )}{" "}
          ·{" "}
          <Link to="/calendar" className="text-blue-400 hover:underline">
            Calendar settings
          </Link>
        </p>
      ) : null}

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

      {slice.status === "ready" && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <SnapshotCard
            to="/meals"
            title="Meals today"
            subtitle="Plan & dinner"
            stat={`${slice.value.mealsToday.length} planned`}
          >
            <ul className="mt-2 space-y-1 text-sm text-slate-400">
              {slice.value.mealsToday.length === 0 ? (
                <li>Nothing on the meal plan today.</li>
              ) : (
                slice.value.mealsToday.map((e) => (
                  <li key={e.id} className="truncate">
                    <span className="text-slate-500">{e.mealSlot}:</span>{" "}
                    {e.customLabel || e.recipeName || "TBD"}
                  </li>
                ))
              )}
            </ul>
          </SnapshotCard>

          <SnapshotCard
            to="/buy"
            title="Buy list"
            subtitle="Active shopping items"
            stat={`${slice.value.buy.totalCount} open`}
          >
            <ul className="mt-2 space-y-1 text-sm text-slate-400">
              {slice.value.buy.items.length === 0 ? (
                <li>Nothing on the list.</li>
              ) : (
                slice.value.buy.items.slice(0, 5).map((it) => (
                  <li key={it.id} className="truncate">
                    {it.name}
                    {it.store ? (
                      <span className="text-slate-500"> · {it.store}</span>
                    ) : null}
                  </li>
                ))
              )}
            </ul>
          </SnapshotCard>

          {slice.value.staleBuy.length > 0 ? (
            <SnapshotCard
              to="/buy"
              title="Stale buy items"
              subtitle="On the list 14+ days"
              stat={`${slice.value.staleBuy.length} aging`}
            >
              <ul className="mt-2 space-y-1 text-sm text-amber-200/90">
                {slice.value.staleBuy.map((it) => (
                  <li key={it.id} className="truncate">
                    {it.name}
                    {it.store ? <span className="text-amber-200/60"> · {it.store}</span> : null}
                  </li>
                ))}
              </ul>
            </SnapshotCard>
          ) : null}

          <SnapshotCard
            to="/wishlist"
            title="Wishlist"
            subtitle="Open wishes"
            stat={`${slice.value.wishlist.totalCount} open`}
          >
            <ul className="mt-2 space-y-1 text-sm text-slate-400">
              {slice.value.wishlist.items.length === 0 ? (
                <li>No wishlist rows.</li>
              ) : (
                slice.value.wishlist.items.slice(0, 5).map((it) => (
                  <li key={it.id} className="truncate">
                    {it.name}
                    {it.priority ? (
                      <span className="text-slate-500"> · {it.priority}</span>
                    ) : null}
                  </li>
                ))
              )}
            </ul>
          </SnapshotCard>

          <SnapshotCard
            to="/budget"
            title="Budget"
            subtitle="This month"
            stat={
              slice.value.budgetMonth
                ? `$${formatMoney(slice.value.budgetMonth.net)} net`
                : "—"
            }
          >
            {slice.value.budgetMonth ? (
              <div className="mt-2 space-y-1 text-sm text-slate-400">
                <p>
                  Income ${formatMoney(slice.value.budgetMonth.income)} · spent $
                  {formatMoney(slice.value.budgetMonth.expenses)}
                </p>
                <p>Top category: {slice.value.budgetMonth.topCategory}</p>
                {slice.value.budgetMonth.goalsCount > 0 && (
                  <p>
                    {slice.value.budgetMonth.goalsCount} savings goal
                    {slice.value.budgetMonth.goalsCount === 1 ? "" : "s"}
                    {slice.value.budgetMonth.goalsProgress
                      ? ` · ${slice.value.budgetMonth.goalsProgress}`
                      : ""}
                  </p>
                )}
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-500">No budget data yet.</p>
            )}
          </SnapshotCard>

          <SnapshotCard
            to="/money"
            title="Money"
            subtitle="Transactions & balance"
            stat={`${slice.value.moneyTx.totalCount} transactions`}
          >
            {slice.value.moneySummary ? (
              <p className="mt-2 text-sm leading-relaxed text-slate-300">
                {balanceLine(slice.value.moneySummary)}
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
            title="Calendar"
            subtitle="Today & upcoming (first page each)"
            stat={`${slice.value.today.totalCount} today · ${slice.value.upcoming.totalCount} upcoming`}
          >
            <div className="mt-2 space-y-3 text-sm">
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Today</div>
                <ul className="mt-1 space-y-1 text-slate-400">
                  {slice.value.today.items.length === 0 ? (
                    <li>Nothing scheduled today.</li>
                  ) : (
                    slice.value.today.items.map((it) => (
                      <li
                        key={it.instanceStartUtc ? `t-${it.id}-${it.instanceStartUtc}` : `t-${it.id}`}
                        className="truncate"
                      >
                        {formatDashboardCalendarLine(it, "today")}
                      </li>
                    ))
                  )}
                </ul>
                {slice.value.today.totalCount > slice.value.today.items.length ? (
                  <p className="mt-1 text-xs text-slate-500">
                    +{slice.value.today.totalCount - slice.value.today.items.length} more today — open Calendar for the
                    full list.
                  </p>
                ) : null}
              </div>
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Soon</div>
                <ul className="mt-1 space-y-1 text-slate-400">
                  {slice.value.upcoming.items.length === 0 ? (
                    <li>No upcoming items on this page.</li>
                  ) : (
                    slice.value.upcoming.items.map((it) => (
                      <li
                        key={it.instanceStartUtc ? `u-${it.id}-${it.instanceStartUtc}` : `u-${it.id}`}
                        className="truncate"
                      >
                        {formatDashboardCalendarLine(it, "upcoming")}
                      </li>
                    ))
                  )}
                </ul>
                {slice.value.upcoming.totalCount > slice.value.upcoming.items.length ? (
                  <p className="mt-1 text-xs text-slate-500">
                    +{slice.value.upcoming.totalCount - slice.value.upcoming.items.length} more upcoming — open Calendar.
                  </p>
                ) : null}
              </div>
            </div>
          </SnapshotCard>

          <SnapshotCard
            to="/calendar"
            title="Tasks"
            subtitle="Open calendar tasks"
            stat={`${slice.value.tasks.totalCount} open`}
          >
            <ul className="mt-2 space-y-1 text-sm text-slate-400">
              {slice.value.tasks.items.length === 0 ? (
                <li>No open tasks.</li>
              ) : (
                slice.value.tasks.items.slice(0, 5).map((it) => (
                  <li key={it.id} className="truncate">
                    {it.title.trim() || "(untitled)"}
                  </li>
                ))
              )}
            </ul>
          </SnapshotCard>
        </div>
      )}
    </div>
  );
}

function SnapshotCard({
  to,
  title,
  subtitle,
  stat,
  children,
}: {
  to: string;
  title: string;
  subtitle: string;
  stat: string;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      className="flex flex-col rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-left transition hover:border-slate-600 hover:bg-slate-900"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-white">{title}</div>
          <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
        </div>
        <span className="shrink-0 rounded-md bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-200">
          {stat}
        </span>
      </div>
      <div className="mt-1 flex-1">{children}</div>
      <span className="mt-3 text-xs font-medium text-blue-400">Open →</span>
    </Link>
  );
}
