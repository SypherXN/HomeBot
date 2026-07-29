import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useAuth } from "../auth/AuthContext";
import { useTheme } from "../theme/ThemeProvider";
import { useDiscordGuildRoster } from "../hooks/useDiscordGuildRoster";
import { validActorId } from "../lib/validation";
import { titleCase } from "../lib/titleCase";
import {
  deleteBudgetTransaction,
  postUndo,
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
import BudgetAccountsPanel from "./budget/BudgetAccountsPanel";
import BudgetAnnualSnapshot from "./budget/BudgetAnnualSnapshot";
import BudgetCategoryEditor from "./budget/BudgetCategoryEditor";
import BudgetTransactionEditModal from "./budget/BudgetTransactionEditModal";
import BudgetAlertsPanel from "./budget/BudgetAlertsPanel";
import BudgetCsvExport from "./budget/BudgetCsvExport";
import BudgetAuditLog from "./budget/BudgetAuditLog";
import BudgetBillsRecurring from "./budget/BudgetBillsRecurring";
import BudgetCurrencyPanel from "./budget/BudgetCurrencyPanel";
import BudgetCsvImport from "./budget/BudgetCsvImport";
import BudgetEnvelopeEditor from "./budget/BudgetEnvelopeEditor";
import BudgetFiltersPanel, { type BudgetFilters } from "./budget/BudgetFiltersPanel";
import BudgetGoalsPanel from "./budget/BudgetGoalsPanel";
import BudgetIncomeBanner from "./budget/BudgetIncomeBanner";
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

function formatMoney(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

type ChartMode = "category" | "user";
type BudgetTab = "overview" | "ledger" | "plan";

export default function BudgetPage() {
  const { token, actorUserId } = useAuth();
  const { theme } = useTheme();
  const chartColors = theme === "dark" ? CHART_COLORS_DARK : CHART_COLORS_LIGHT;
  const tok = token.trim();
  const actor = validActorId(actorUserId) ? actorUserId.trim() : "";
  const roster = useDiscordGuildRoster(token);
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

  useEffect(() => {
    if (highlightId) setTab("ledger");
  }, [highlightId]);
  const [trendMonths, setTrendMonths] = useState(6);
  const [trendGroupBy, setTrendGroupBy] = useState<"category" | "user">("category");
  const [editTx, setEditTx] = useState<BudgetTransactionListItem | null>(null);
  const [undoBusy, setUndoBusy] = useState(false);
  const [undoMsg, setUndoMsg] = useState<string | null>(null);
  const [dismissBusyKey, setDismissBusyKey] = useState<string | null>(null);

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

  async function handleDelete(row: BudgetTransactionListItem) {
    if (!tok || !actor) return;
    if (!confirm("Delete this transaction?")) return;
    await deleteBudgetTransaction(tok, actor, row.id);
    await load();
  }

  async function handleUndo() {
    if (!actor) {
      setUndoMsg("Set actorUserId in Settings to use undo.");
      return;
    }
    setUndoBusy(true);
    setUndoMsg(null);
    try {
      const r = await postUndo(tok, actor);
      if (!r.undone) {
        setUndoMsg(r.message?.trim() || "Nothing to undo for this actor.");
        return;
      }
      setUndoMsg("Last action was undone.");
      await load();
    } catch (e) {
      setUndoMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setUndoBusy(false);
    }
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

  if (!tok) {
    return (
      <div className="hb-card p-6 text-slate-300">
        Sign in via Settings to use Budget.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-semibold text-white">Budget</h1>
        <p className="mt-1 text-sm text-slate-400">
          Household spending by category and person. Money page is for splits between people.
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-red-900/50 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
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
        {actor && (
          <button
            type="button"
            disabled={undoBusy}
            onClick={() => void handleUndo()}
            className="rounded-lg border border-amber-700/80 bg-amber-950/40 px-3 py-2 text-sm text-amber-100 hover:bg-amber-950/70 disabled:opacity-50"
          >
            {undoBusy ? "Undoing…" : "Undo last action"}
          </button>
        )}
      </div>
      {undoMsg && (
        <p className="text-sm text-slate-300" role="status">
          {undoMsg}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["overview", "Overview"],
            ["ledger", "Ledger"],
            ["plan", "Plan & tools"],
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

      {tab === "ledger" && (
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
      )}

      {(tab === "overview" || tab === "ledger") && summary && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="hb-card p-4">
            <div className="text-xs text-slate-400">Income</div>
            <div className="text-xl font-semibold text-emerald-400">${formatMoney(summary.totalIncome)}</div>
          </div>
          <div className="hb-card p-4">
            <div className="text-xs text-slate-400">Expenses</div>
            <div className="text-xl font-semibold text-amber-300">${formatMoney(summary.totalExpenses)}</div>
          </div>
          <div className="hb-card p-4">
            <div className="text-xs text-slate-400">Net</div>
            <div className="text-xl font-semibold text-white">${formatMoney(summary.net)}</div>
          </div>
        </div>
      )}

      {tab === "overview" && (
        <>
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
              <p className="text-sm text-slate-500">No expense data for this month.</p>
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

          <BudgetIncomeBanner token={tok} actor={actor} month={month} plan={incomePlan} onSaved={load} />
          <BudgetAlertsPanel
            forecast={forecast}
            notifications={notifications}
            onDismiss={actor ? dismissNotification : undefined}
            dismissBusyKey={dismissBusyKey}
          />
          <BudgetAnnualSnapshot token={tok} year={Number(month.slice(0, 4))} />
        </>
      )}

      {tab === "ledger" && (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="hb-card p-4">
              <h2 className="mb-3 text-lg font-medium text-white">Add transaction</h2>
              <BudgetTransactionForm
                token={tok}
                actor={actor}
                month={month}
                categories={categories}
                accounts={accounts}
                roster={roster}
                onSaved={load}
              />
            </section>

            <section className="hb-card p-4">
              <h2 className="mb-3 text-lg font-medium text-white">Categories</h2>
              <BudgetCategoryEditor token={tok} actor={actor} categories={categories} onSaved={load} />
            </section>
          </div>

          <section className="hb-card p-4">
            <h2 className="mb-3 text-lg font-medium text-white">Transactions</h2>
            {!txData ? (
              <p className="text-slate-500">Loading…</p>
            ) : txData.items.length === 0 ? (
              <p className="text-slate-500">No transactions match your filters.</p>
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
                      </div>
                      <span className="flex gap-2">
                        {actor && (
                          <button
                            type="button"
                            onClick={() => setEditTx(row)}
                            className="text-blue-400 hover:text-blue-300"
                          >
                            Edit
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void handleDelete(row)}
                          className="text-red-400 hover:text-red-300"
                        >
                          Delete
                        </button>
                      </span>
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
                            {s.categoryId != null ? ` · cat #${s.categoryId}` : ""}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
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
          </section>
        </>
      )}

      {tab === "plan" && (
        <>
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

          <BudgetAccountsPanel token={tok} actor={actor} month={month} accounts={accounts} onSaved={load} />

          <section className="hb-card p-4">
            <h2 className="mb-3 text-lg font-medium text-white">Envelope budgets — {month}</h2>
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
              <p className="text-sm text-slate-500">Set actor in Settings to edit envelopes.</p>
            )}
          </section>

          <BudgetGoalsPanel token={tok} actor={actor} categories={categories} goals={goals} onSaved={load} />

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
