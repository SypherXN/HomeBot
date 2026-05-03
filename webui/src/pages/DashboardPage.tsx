import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  getBuyItems,
  getCalendarItems,
  getCalendarToday,
  getCalendarUpcoming,
  getMoneySummary,
  getMoneyTransactions,
  getWishlistItems,
  type MoneySummary,
  type PagedBuyList,
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

function titlesFromCalendar(items: PagedCalendarList | null, max = 4): string[] {
  if (!items) return [];
  return items.items.slice(0, max).map((i) => i.title.trim() || "(untitled)");
}

type DashboardBundle = {
  buy: PagedBuyList;
  wishlist: PagedWishlistList;
  moneyTx: PagedMoneyTransactions;
  moneySummary: MoneySummary | null;
  today: PagedCalendarList;
  upcoming: PagedCalendarList;
  tasks: PagedCalendarList;
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

      const [buy, wishlist, moneyTx, today, upcoming, tasks, moneySummary] = await Promise.all([
        getBuyItems(tok, 0),
        getWishlistItems(tok, 0),
        getMoneyTransactions(tok, 0),
        getCalendarToday(tok, 0),
        getCalendarUpcoming(tok, 0),
        getCalendarItems(tok, 0, { type: "task" }),
        canPairSummary && u1 && u2
          ? getMoneySummary(tok, u1, u2, n1, n2).catch(() => null)
          : Promise.resolve(null as MoneySummary | null),
      ]);

      setSlice({
        status: "ready",
        value: {
          buy,
          wishlist,
          moneyTx,
          moneySummary,
          today,
          upcoming,
          tasks,
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
          Snapshot of your household data. Connection status is shown in the header. Configure the API
          in{" "}
          <Link to="/settings" className="text-blue-400 hover:underline">
            Settings
          </Link>
          .
        </p>
      </div>

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
            subtitle="Today & upcoming"
            stat={`${slice.value.today.totalCount} today · ${slice.value.upcoming.totalCount} upcoming`}
          >
            <div className="mt-2 space-y-3 text-sm">
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Today</div>
                <ul className="mt-1 space-y-1 text-slate-400">
                  {titlesFromCalendar(slice.value.today, 4).length === 0 ? (
                    <li>Nothing scheduled today.</li>
                  ) : (
                    titlesFromCalendar(slice.value.today, 4).map((t, i) => (
                      <li key={`t-${i}`} className="truncate">
                        {t}
                      </li>
                    ))
                  )}
                </ul>
              </div>
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Soon</div>
                <ul className="mt-1 space-y-1 text-slate-400">
                  {titlesFromCalendar(slice.value.upcoming, 4).length === 0 ? (
                    <li>No upcoming items on this page.</li>
                  ) : (
                    titlesFromCalendar(slice.value.upcoming, 4).map((t, i) => (
                      <li key={`u-${i}`} className="truncate">
                        {t}
                      </li>
                    ))
                  )}
                </ul>
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <QuickLink to="/buy" label="Buy list" hint="Shopping & tags" />
        <QuickLink to="/wishlist" label="Wishlist" hint="Wishes & owners" />
        <QuickLink to="/money" label="Money" hint="Split, payments, summary" />
        <QuickLink to="/calendar" label="Calendar" hint="Month, week, agenda, tasks" />
        <QuickLink to="/settings" label="Settings" hint="Token & actor id" />
      </div>
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

function QuickLink({ to, label, hint }: { to: string; label: string; hint: string }) {
  return (
    <Link
      to={to}
      className="rounded-lg border border-slate-800 bg-slate-950/40 px-4 py-3 text-sm transition hover:border-slate-600 hover:bg-slate-900/80"
    >
      <div className="font-medium text-white">{label}</div>
      <p className="mt-0.5 text-xs text-slate-500">{hint}</p>
    </Link>
  );
}
