import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useAuth } from "../auth/AuthContext";
import { useTheme } from "../theme/ThemeProvider";
import { useDiscordGuildRoster } from "../hooks/useDiscordGuildRoster";
import { useHorizontalSwipe } from "../hooks/useHorizontalSwipe";
import { useUndoToast } from "../hooks/useUndoToast";
import { validActorId } from "../lib/validation";
import { titleCase } from "../lib/titleCase";
import { formatMoney, formatMonthLong } from "../lib/budgetMoney";
import {
  deleteBudgetTransaction,
  getBudgetAccounts,
  getBudgetAudit,
  getBudgetCategories,
  getBudgetExchangeRates,
  getBudgetForecast,
  getBudgetEnvelopes,
  getBudgetGoals,
  getBudgetIncomePlan,
  getBudgetNotifications,
  postBudgetNotificationDismiss,
  getBudgetSummaryByCategory,
  getBudgetSummaryByUser,
  getBudgetSummaryMonth,
  getBudgetTags,
  getBudgetTaxSummary,
  getBudgetBills,
  getBudgetRecurring,
  getBudgetTransactions,
  getBudgetTrends,
  type BudgetAccount,
  type BudgetAuditEntry,
  type BudgetCategory,
  type BudgetExchangeRate,
  type BudgetEnvelope,
  type BudgetForecastCategory,
  type BudgetGoal,
  type BudgetIncomePlan,
  type BudgetMonthSummary,
  type BudgetNotificationItem,
  type BudgetRecurring,
  type BudgetBill,
  type BudgetSummarySlice,
  type BudgetTaxSummaryLine,
  type BudgetTransactionListItem,
  type PagedBudgetTransactions,
} from "../api";
import { highlightRowClass, useSearchHighlightId } from "../lib/searchHighlight";
import { Icon } from "../components/icons";
import Sheet from "../components/Sheet";
import BudgetAccountsPanel from "./budget/BudgetAccountsPanel";
import BudgetAnnualSnapshot from "./budget/BudgetAnnualSnapshot";
import BudgetAttentionInbox, { type AttentionItem } from "./budget/BudgetAttentionInbox";
import BudgetCategoryEditor from "./budget/BudgetCategoryEditor";
import BudgetTransactionEditModal from "./budget/BudgetTransactionEditModal";
import BudgetCsvExport from "./budget/BudgetCsvExport";
import BudgetAuditLog from "./budget/BudgetAuditLog";
import BudgetBillsRecurring from "./budget/BudgetBillsRecurring";
import BudgetCurrencyPanel from "./budget/BudgetCurrencyPanel";
import BudgetCsvImport from "./budget/BudgetCsvImport";
import BudgetEnvelopeEditor from "./budget/BudgetEnvelopeEditor";
import BudgetFiltersPanel, { type BudgetFilters } from "./budget/BudgetFiltersPanel";
import BudgetGoalsPanel from "./budget/BudgetGoalsPanel";
import BudgetIncomeBanner from "./budget/BudgetIncomeBanner";
import BudgetOverviewHero from "./budget/BudgetOverviewHero";
import BudgetQuickAdd from "./budget/BudgetQuickAdd";
import BudgetSetupChecklist from "./budget/BudgetSetupChecklist";
import BudgetTaxSummary from "./budget/BudgetTaxSummary";
import BudgetTransactionForm from "./budget/BudgetTransactionForm";
import BudgetTrendChart from "./budget/BudgetTrendChart";

const CHART_COLORS_DARK = ["#00f0ff", "#a855f7", "#34d399", "#fbbf24", "#fb7185", "#38bdf8", "#e879f9", "#a3e635"];
// Deeper twins of the neon ramp so slices stay legible on the light canvas.
const CHART_COLORS_LIGHT = ["#0891b2", "#7c3aed", "#059669", "#d97706", "#e11d48", "#0284c7", "#c026d3", "#65a30d"];

const EMPTY_FILTERS: BudgetFilters = {
  merchant: "",
  noteContains: "",
  amountMin: "",
  amountMax: "",
  tag: "",
};

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

type ChartMode = "category" | "user";
type BudgetTab = "overview" | "ledger" | "plan";
type PlanSection = "plan" | "accounts" | "bills" | "goals" | "tools";

export default function BudgetPage() {
  const { token, actorUserId } = useAuth();
  const { theme } = useTheme();
  const chartColors = theme === "dark" ? CHART_COLORS_DARK : CHART_COLORS_LIGHT;
  const tok = token.trim();
  const actor = validActorId(actorUserId) ? actorUserId.trim() : "";
  const roster = useDiscordGuildRoster(token);
  const undoToast = useUndoToast();
  const [params] = useSearchParams();
  const highlightId = useSearchHighlightId();
  const highlightRef = useRef<HTMLLIElement>(null);
  const initialPage = Number.parseInt(params.get("page") ?? "0", 10);
  const initialTabParam = params.get("tab");
  const initialTab: BudgetTab =
    initialTabParam === "ledger" || initialTabParam === "plan" ? initialTabParam : "overview";

  const [month, setMonth] = useState(currentMonth);
  const [spenderFilter, setSpenderFilter] = useState("");
  const [chartMode, setChartMode] = useState<ChartMode>("category");
  const [scope, setScope] = useState<"household" | "all">("household");
  const [filters, setFilters] = useState<BudgetFilters>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<BudgetFilters>(EMPTY_FILTERS);

  const [categories, setCategories] = useState<BudgetCategory[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [summary, setSummary] = useState<BudgetMonthSummary | null>(null);
  const [byCategory, setByCategory] = useState<BudgetSummarySlice[]>([]);
  const [byUser, setByUser] = useState<BudgetSummarySlice[]>([]);
  const [txData, setTxData] = useState<PagedBudgetTransactions | null>(null);

  useEffect(() => {
    if (!highlightId || !txData?.items.some((r) => r.id === highlightId)) return;
    highlightRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [highlightId, txData]);

  const [envelopes, setEnvelopes] = useState<BudgetEnvelope[]>([]);
  const [goals, setGoals] = useState<BudgetGoal[]>([]);
  const [trends, setTrends] = useState<Awaited<ReturnType<typeof getBudgetTrends>>>([]);
  const [incomePlan, setIncomePlan] = useState<BudgetIncomePlan | null>(null);
  const [forecast, setForecast] = useState<BudgetForecastCategory[]>([]);
  const [notifications, setNotifications] = useState<BudgetNotificationItem[]>([]);
  const [audit, setAudit] = useState<BudgetAuditEntry[]>([]);
  const [taxSummary, setTaxSummary] = useState<BudgetTaxSummaryLine[]>([]);
  const [exchangeRates, setExchangeRates] = useState<BudgetExchangeRate[]>([]);
  const [bills, setBills] = useState<BudgetBill[]>([]);
  const [recurring, setRecurring] = useState<BudgetRecurring[]>([]);
  const [accounts, setAccounts] = useState<BudgetAccount[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [listPage, setListPage] = useState(
    Number.isFinite(initialPage) && initialPage >= 0 ? initialPage : 0
  );
  const [tab, setTab] = useState<BudgetTab>(initialTab);
  const [planSection, setPlanSection] = useState<PlanSection>("plan");
  const [addOpen, setAddOpen] = useState(false);
  const [dismissBusyKey, setDismissBusyKey] = useState<string | null>(null);

  useEffect(() => {
    if (highlightId) setTab("ledger");
  }, [highlightId]);
  const [trendMonths, setTrendMonths] = useState(6);
  const [trendGroupBy, setTrendGroupBy] = useState<"category" | "user">("category");
  const [editTx, setEditTx] = useState<BudgetTransactionListItem | null>(null);

  const categoryNameById = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);

  const stepMonth = useCallback(
    (delta: number) => {
      setListPage(0);
      setMonth((m) => shiftMonth(m, delta));
    },
    []
  );
  const swipe = useHorizontalSwipe((dir) => stepMonth(dir));

  const dismissNotification = useCallback(
    async (key: string) => {
      if (!tok || !actor || !key) return;
      setDismissBusyKey(key);
      try {
        await postBudgetNotificationDismiss(tok, actor, key);
        setNotifications((prev) => prev.filter((n) => n.key !== key));
        window.dispatchEvent(new Event("homebot-budget-alerts-changed"));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setDismissBusyKey(null);
      }
    },
    [tok, actor]
  );

  const load = useCallback(async () => {
    if (!tok) return;
    setError(null);
    try {
      const spenderQ = spenderFilter || undefined;
      const [cats, tags, sm, catSlices, userSlices, txs, envs, g, tr, ip, fc, notes, au, tax, rates, billRows, recurringRows, accts] =
        await Promise.all([
          getBudgetCategories(tok),
          getBudgetTags(tok).catch(() => [] as string[]),
          getBudgetSummaryMonth(tok, month, { spentByUserId: spenderQ, scope }),
          getBudgetSummaryByCategory(tok, month, { spentByUserId: spenderQ, scope }),
          getBudgetSummaryByUser(tok, month),
          getBudgetTransactions(tok, listPage, {
            month,
            spentByUserId: spenderQ,
            scope,
            merchant: appliedFilters.merchant || undefined,
            noteContains: appliedFilters.noteContains || undefined,
            amountMin: appliedFilters.amountMin || undefined,
            amountMax: appliedFilters.amountMax || undefined,
            tag: appliedFilters.tag || undefined,
          }),
          getBudgetEnvelopes(tok, month),
          getBudgetGoals(tok),
          getBudgetTrends(tok, trendMonths, trendGroupBy),
          getBudgetIncomePlan(tok, month).catch(() => null),
          getBudgetForecast(tok, month).catch(() => [] as BudgetForecastCategory[]),
          getBudgetNotifications(tok).catch(() => [] as BudgetNotificationItem[]),
          getBudgetAudit(tok, 50).catch(() => [] as BudgetAuditEntry[]),
          getBudgetTaxSummary(tok, Number(month.slice(0, 4))).catch(() => [] as BudgetTaxSummaryLine[]),
          getBudgetExchangeRates(tok).catch(() => [] as BudgetExchangeRate[]),
          getBudgetBills(tok).catch(() => [] as BudgetBill[]),
        getBudgetRecurring(tok).catch(() => [] as BudgetRecurring[]),
        getBudgetAccounts(tok).catch(() => [] as BudgetAccount[]),
      ]);
      setCategories(cats);
      setAllTags(tags);
      setSummary(sm);
      setByCategory(catSlices);
      setByUser(userSlices);
      setTxData(txs);
      setEnvelopes(envs);
      setGoals(g);
      setTrends(tr);
      setIncomePlan(ip);
      setForecast(fc);
      setNotifications(notes);
      setAudit(au);
      setTaxSummary(tax);
      setExchangeRates(rates);
      setBills(billRows);
      setRecurring(recurringRows);
      setAccounts(accts);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [tok, month, spenderFilter, scope, listPage, appliedFilters, trendMonths, trendGroupBy]);

  useEffect(() => {
    void load();
  }, [load]);

  const chartData = (chartMode === "category" ? byCategory : byUser).map((slice) => ({
    key: slice.key,
    label: titleCase(slice.label),
    total: slice.total,
  }));

  const envelopeSpent = useMemo(() => envelopes.reduce((sum, e) => sum + e.actualAmount, 0), [envelopes]);

  const attentionItems = useMemo(() => {
    const items: AttentionItem[] = [];
    for (const e of envelopes) {
      if (e.targetAmount > 0 && e.actualAmount > e.targetAmount) {
        items.push({
          key: `over-${e.categoryId}`,
          message: overBudgetMessage(titleCase(e.categoryName), e.actualAmount, e.targetAmount),
        });
      }
    }
    for (const f of forecast) {
      if (f.envelopeTarget != null && f.envelopeTarget > 0 && f.projectedMonthEnd > f.envelopeTarget) {
        // Skip when already flagged as over-budget from actuals.
        if (items.some((i) => i.key === `over-${f.categoryId}`)) continue;
        items.push({
          key: `pace-${f.categoryId}`,
          message: paceMessage(titleCase(f.categoryName), f.projectedMonthEnd, f.envelopeTarget, f.monthToDate),
        });
      }
    }
    if (month === currentMonth()) {
      const today = new Date().getDate();
      for (const b of bills) {
        if (!b.isActive) continue;
        if (b.dueDay < today && b.dueDay >= today - 7) {
          items.push({
            key: `bill-${b.id}`,
            message: `${titleCase(b.name)} (~$${formatMoney(b.amountEstimate)}) was due on the ${ordinal(b.dueDay)} and hasn't been paid.`,
          });
        } else if (b.dueDay >= today && b.dueDay <= today + 3) {
          items.push({
            key: `bill-${b.id}`,
            message: `${titleCase(b.name)} (~$${formatMoney(b.amountEstimate)}) is due on the ${ordinal(b.dueDay)}.`,
          });
        }
      }
    }
    const uncategorized = txData?.items.filter((r) => r.type === "expense" && r.categoryId == null).length ?? 0;
    if (uncategorized > 0) {
      items.push({
        key: "uncategorized",
        message: `${uncategorized} expense${uncategorized === 1 ? " is" : "s are"} uncategorized.`,
        action: {
          label: "Review",
          onClick: () => setTab("ledger"),
        },
      });
    }
    for (const n of notifications) {
      items.push({
        key: `n-${n.key || `${n.kind}-${n.message}`}`,
        message: n.message,
        action:
          actor && n.key
            ? { label: "Dismiss", onClick: () => void dismissNotification(n.key), busy: dismissBusyKey === n.key }
            : undefined,
      });
    }
    return items;
  }, [envelopes, forecast, bills, month, txData, notifications, actor, dismissBusyKey, dismissNotification]);

  const isFresh = categories.length === 0 && (txData?.items.length ?? 0) === 0 && summary != null;

  async function handleDelete(row: BudgetTransactionListItem) {
    if (!tok || !actor) return;
    if (!confirm("Delete this transaction?")) return;
    await deleteBudgetTransaction(tok, actor, row.id);
    undoToast(`Deleted ${titleCase(row.categoryName ?? row.type)} $${formatMoney(row.amount)}`, () => void load());
    await load();
  }

  function applyFilters() {
    setListPage(0);
    setAppliedFilters({ ...filters });
  }

  function clearFilters() {
    setFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    setSpenderFilter("");
    setListPage(0);
  }

  function goPlan(section: PlanSection) {
    setTab("plan");
    setPlanSection(section);
  }

  if (!tok) {
    return (
      <div className="hb-card p-6 text-slate-300">
        Sign in via Settings to use Budget.
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24 md:pb-0" {...swipe}>
      <header>
        <h1 className="text-3xl font-semibold text-white">Budget</h1>
        <p className="mt-1 text-sm text-slate-400">
          Your household money — what's left, where it went, what's next.
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-red-900/50 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => stepMonth(-1)}
            aria-label="Previous month"
            className="rounded-lg hb-btn-soft px-2.5 py-2 text-slate-300 hover:bg-slate-700"
          >
            ‹
          </button>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Month</label>
            <input
              type="month"
              value={month}
              onChange={(e) => {
                setListPage(0);
                setMonth(e.target.value);
              }}
              className="hb-input px-3 py-2 text-slate-100"
            />
          </div>
          <button
            type="button"
            onClick={() => stepMonth(1)}
            aria-label="Next month"
            className="rounded-lg hb-btn-soft px-2.5 py-2 text-slate-300 hover:bg-slate-700"
          >
            ›
          </button>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-400">Scope</label>
          <select
            value={scope}
            onChange={(e) => {
              setListPage(0);
              setScope(e.target.value as "household" | "all");
            }}
            className="hb-input px-3 py-2 text-slate-100"
          >
            <option value="household">Household</option>
            <option value="all">Include Personal</option>
          </select>
        </div>
        <span className="hidden text-xs text-slate-500 md:inline">Swipe left/right to change month on mobile</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["overview", "Overview"],
            ["ledger", "Ledger"],
            ["plan", "Plan"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              tab === id ? "bg-gradient-to-r from-blue-600 to-blue-700 text-white" : "bg-slate-800 text-slate-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {isFresh ? (
        <BudgetSetupChecklist
          categories={categories}
          accounts={accounts}
          incomePlan={incomePlan}
          hasTransactions={(txData?.items.length ?? 0) > 0}
          onAddCategories={() => goPlan("accounts")}
          onEditPlan={() => goPlan("plan")}
          onAddAccount={() => goPlan("accounts")}
          onAddTransaction={() => setAddOpen(true)}
        />
      ) : (
        tab === "overview" && (
          <>
            <BudgetOverviewHero month={month} summary={summary} incomePlan={incomePlan} envelopeSpent={envelopeSpent} />
            <BudgetAttentionInbox month={month} items={attentionItems} />
          </>
        )
      )}

      {tab === "overview" && (
        <>
          <section className="hb-card p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-medium text-white">Quick add</h2>
              <span className="text-xs text-slate-500">or open full form from the + button</span>
            </div>
            <BudgetQuickAdd
              token={tok}
              actor={actor}
              month={month}
              categories={categories}
              accounts={accounts}
              roster={roster}
              onSaved={load}
            />
          </section>

          {summary && summary.totalExpenses + summary.totalIncome > 0 ? (
            <section className="hb-card p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-medium text-white">Charts</h2>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setChartMode("category")}
                    className={`rounded-lg px-3 py-1 text-sm ${chartMode === "category" ? "bg-gradient-to-r from-blue-600 to-blue-700 text-white" : "bg-slate-800 text-slate-300"}`}
                  >
                    By Category
                  </button>
                  <button
                    type="button"
                    onClick={() => setChartMode("user")}
                    className={`rounded-lg px-3 py-1 text-sm ${chartMode === "user" ? "bg-gradient-to-r from-blue-600 to-blue-700 text-white" : "bg-slate-800 text-slate-300"}`}
                  >
                    By Spender
                  </button>
                </div>
              </div>
              {chartData.length === 0 ? (
                <p className="text-sm text-slate-500">No expense data for {formatMonthLong(month)} yet.</p>
              ) : (
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={chartData}
                        dataKey="total"
                        nameKey="label"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        label={({ name, percent }) => {
                          const pct = typeof percent === "number" ? (percent * 100).toFixed(0) : "0";
                          return `${String(name ?? "")} ${pct}%`;
                        }}
                      >
                        {chartData.map((_, i) => (
                          <Cell key={i} fill={chartColors[i % chartColors.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => `$${formatMoney(Number(v ?? 0))}`} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>
          ) : null}

          <section className="hb-card p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-medium text-white">Spending trends</h2>
              <div className="flex flex-wrap gap-2">
                <select
                  value={trendMonths}
                  onChange={(e) => setTrendMonths(Number(e.target.value))}
                  className="hb-input px-2 py-1 text-sm text-slate-100"
                >
                  {[3, 6, 9, 12].map((n) => (
                    <option key={n} value={n}>
                      Last {n} months
                    </option>
                  ))}
                </select>
                <select
                  value={trendGroupBy}
                  onChange={(e) => setTrendGroupBy(e.target.value as "category" | "user")}
                  className="hb-input px-2 py-1 text-sm text-slate-100"
                >
                  <option value="category">By Category</option>
                  <option value="user">By Spender</option>
                </select>
              </div>
            </div>
            <BudgetTrendChart trends={trends} />
          </section>

          <BudgetAnnualSnapshot token={tok} year={Number(month.slice(0, 4))} />
        </>
      )}

      {tab === "ledger" && (
        <>
          <section className="hb-card p-4">
            <BudgetQuickAdd
              token={tok}
              actor={actor}
              month={month}
              categories={categories}
              accounts={accounts}
              roster={roster}
              onSaved={load}
            />
          </section>

          <BudgetFiltersPanel
            token={tok}
            roster={roster}
            spenderFilter={spenderFilter}
            onSpenderFilter={(v) => {
              setListPage(0);
              setSpenderFilter(v);
            }}
            filters={filters}
            onFiltersChange={setFilters}
            allTags={allTags}
            onApply={applyFilters}
            onClear={clearFilters}
          />

          <section className="hb-card p-4">
            <h2 className="mb-3 text-lg font-medium text-white">Transactions</h2>
            {!txData ? (
              <p className="text-slate-500">Loading…</p>
            ) : txData.items.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-700 p-6 text-center">
                <p className="text-sm text-slate-400">
                  {hasActiveFilters(appliedFilters, spenderFilter)
                    ? "No transactions match these filters."
                    : `Nothing logged for ${formatMonthLong(month)} yet.`}
                </p>
                {!hasActiveFilters(appliedFilters, spenderFilter) && actor && (
                  <button
                    type="button"
                    onClick={() => setAddOpen(true)}
                    className="mt-3 rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-2 text-sm font-medium text-white"
                  >
                    Add the first one
                  </button>
                )}
                {hasActiveFilters(appliedFilters, spenderFilter) && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="mt-3 rounded-lg hb-btn-soft px-4 py-2 text-sm text-slate-200"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            ) : (
              <ul className="divide-y divide-slate-800">
                {txData.items.map((row) => (
                  <li
                    key={row.id}
                    ref={row.id === highlightId ? highlightRef : undefined}
                    className={`py-3 text-sm ${highlightRowClass(row.id, highlightId)}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <span className={row.type === "income" ? "text-emerald-400" : "text-amber-300"}>
                          ${formatMoney(row.amount)}
                        </span>{" "}
                        <span className="text-white">
                          {titleCase(row.categoryName ?? row.type)}
                        </span>
                        <span className="text-slate-500"> · {row.spentByMemberLabel}</span>
                        {row.merchant && <span className="text-slate-500"> · {row.merchant}</span>}
                        {row.isPending && (
                          <span className="ml-1 rounded bg-amber-900/50 px-1 text-xs text-amber-200">Pending</span>
                        )}
                        {row.type === "expense" && row.categoryId == null && (
                          <span className="ml-1 rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-400">Uncategorized</span>
                        )}
                      </div>
                      {actor ? (
                        <span className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setEditTx(row)}
                            className="text-blue-400 hover:text-blue-300"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDelete(row)}
                            className="text-red-400 hover:text-red-300"
                          >
                            Delete
                          </button>
                        </span>
                      ) : (
                        <span className="text-xs text-slate-600">Set “Acting as” in Settings to edit</span>
                      )}
                    </div>
                    {row.note && <p className="mt-1 text-slate-500">{row.note}</p>}
                    {row.receiptUrl && (
                      <p className="mt-1">
                        <a
                          href={row.receiptUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-400 hover:underline"
                        >
                          Receipt
                        </a>
                      </p>
                    )}
                    {row.tags.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {row.tags.map((t) => (
                          <span key={t} className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-300">
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                    {row.splits.length > 0 && (
                      <ul className="mt-1 text-xs text-slate-500">
                        {row.splits.map((s) => (
                          <li key={s.id}>
                            Split ${formatMoney(s.amount)}
                            {s.categoryId != null ? ` · ${categoryNameById.get(s.categoryId) ?? "Uncategorized"}` : ""}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {txData && (txData.hasPrev || txData.hasNext) && (
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={!txData?.hasPrev}
                  onClick={() => setListPage((p) => Math.max(0, p - 1))}
                  className="rounded bg-slate-800 px-3 py-1 text-sm text-slate-300 disabled:opacity-40"
                >
                  Prev
                </button>
                <button
                  type="button"
                  disabled={!txData?.hasNext}
                  onClick={() => setListPage((p) => p + 1)}
                  className="rounded bg-slate-800 px-3 py-1 text-sm text-slate-300 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            )}
          </section>
        </>
      )}

      {tab === "plan" && (
        <>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["plan", "Plan"],
                ["accounts", "Accounts & categories"],
                ["bills", "Bills & recurring"],
                ["goals", "Goals"],
                ["tools", "Tools"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setPlanSection(id)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-medium ${
                  planSection === id
                    ? "bg-gradient-to-r from-blue-600 to-blue-700 text-white"
                    : "bg-slate-800/80 text-slate-400 hover:text-slate-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {planSection === "plan" && (
            <>
              <BudgetIncomeBanner token={tok} actor={actor} month={month} plan={incomePlan} onSaved={load} />
              <section className="hb-card p-4">
                <h2 className="mb-3 text-lg font-medium text-white">Envelope budgets — {formatMonthLong(month)}</h2>
                {actor ? (
                  <BudgetEnvelopeEditor
                    token={tok}
                    actor={actor}
                    month={month}
                    categories={categories}
                    envelopes={envelopes}
                    onSaved={load}
                  />
                ) : (
                  <p className="text-sm text-slate-500">Set “Acting as” in Settings to edit envelopes.</p>
                )}
              </section>
            </>
          )}

          {planSection === "accounts" && (
            <>
              <BudgetAccountsPanel token={tok} actor={actor} month={month} accounts={accounts} onSaved={load} />
              <section className="hb-card p-4">
                <h2 className="mb-3 text-lg font-medium text-white">Categories</h2>
                <BudgetCategoryEditor token={tok} actor={actor} categories={categories} onSaved={load} />
              </section>
            </>
          )}

          {planSection === "bills" && (
            <BudgetBillsRecurring
              token={tok}
              actor={actor}
              categories={categories}
              roster={roster}
              bills={bills}
              recurring={recurring}
              defaultSpender={actor || spenderFilter}
              onSaved={load}
            />
          )}

          {planSection === "goals" && (
            <BudgetGoalsPanel token={tok} actor={actor} categories={categories} goals={goals} onSaved={load} />
          )}

          {planSection === "tools" && (
            <>
              <div className="grid gap-6 lg:grid-cols-2">
                <BudgetCurrencyPanel token={tok} actor={actor} rates={exchangeRates} onSaved={load} />
                <BudgetAuditLog entries={audit} />
              </div>

              <section className="hb-card p-4">
                <h2 className="mb-3 text-lg font-medium text-white">Tax summary snapshot</h2>
                {taxSummary.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    No tax-tagged spending loaded for {month.slice(0, 4)}. Use the panel below to query another year.
                  </p>
                ) : (
                  <ul className="grid gap-1 text-sm text-slate-300 sm:grid-cols-2">
                    {taxSummary.map((t) => (
                      <li key={t.categoryId} className="flex justify-between rounded border border-slate-800 px-2 py-1">
                        <span>{titleCase(t.categoryName)}</span>
                        <span>${formatMoney(t.total)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <BudgetTaxSummary token={tok} />

              <section className="hb-card p-4">
                <h2 className="mb-3 text-lg font-medium text-white">Import & export</h2>
                <div className="grid gap-4 md:grid-cols-2">
                  <BudgetCsvImport
                    token={tok}
                    actor={actor}
                    defaultSpender={actor || spenderFilter}
                    onImported={load}
                  />
                  <div className="space-y-3">
                    <BudgetCsvExport token={tok} defaultMonth={month} />
                    <p className="text-xs text-slate-500">
                      Discord: over-budget and bill-due alerts post to the budget channel (debounced). Weekly digest
                      Sundays ~17:00 UTC.
                    </p>
                  </div>
                </div>
              </section>
            </>
          )}
        </>
      )}

      {actor && (
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          aria-label="Add transaction"
          className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-950/50 transition-transform hover:scale-105 md:bottom-8 md:right-8"
        >
          <Icon name="plus" className="h-6 w-6" />
        </button>
      )}

      <Sheet open={addOpen} title="Add transaction" onClose={() => setAddOpen(false)}>
        <BudgetTransactionForm
          token={tok}
          actor={actor}
          month={month}
          categories={categories}
          accounts={accounts}
          roster={roster}
          onSaved={async () => {
            setAddOpen(false);
            await load();
          }}
        />
      </Sheet>

      <BudgetTransactionEditModal
        open={editTx != null}
        row={editTx}
        token={tok}
        actor={actor}
        categories={categories}
        accounts={accounts}
        roster={roster}
        onClose={() => setEditTx(null)}
        onSaved={load}
      />
    </div>
  );
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

function overBudgetMessage(categoryName: string, spent: number, target: number): string {
  return `${categoryName} is over budget by $${formatMoney(spent - target)} ($${formatMoney(spent)} of $${formatMoney(target)}).`;
}

function paceMessage(categoryName: string, projected: number, target: number, mtd: number): string {
  return `At this rate you'll spend about $${formatMoney(projected)} on ${categoryName} this month (limit $${formatMoney(target)}, $${formatMoney(mtd)} so far).`;
}

function hasActiveFilters(f: BudgetFilters, spender: string): boolean {
  return Boolean(
    spender.trim() ||
      f.merchant.trim() ||
      f.noteContains.trim() ||
      f.amountMin.trim() ||
      f.amountMax.trim() ||
      f.tag.trim()
  );
}
