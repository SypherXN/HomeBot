import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useAuth } from "../auth/AuthContext";
import { useTheme } from "../theme/ThemeProvider";
import { useDiscordGuildRoster } from "../hooks/useDiscordGuildRoster";
import { useHorizontalSwipe } from "../hooks/useHorizontalSwipe";
import { useUndoToast } from "../hooks/useUndoToast";
import { useToasts } from "../components/toastContext";
import { validActorId } from "../lib/validation";
import { titleCase } from "../lib/titleCase";
import { layerForAssignee } from "../lib/personLayers";
import { categoryDotStyle, formatMoney, formatMonthLong } from "../lib/budgetMoney";
import {
  deleteBudgetTransaction,
  patchBudgetTransaction,
  getBudgetAccounts,
  getBudgetAudit,
  getBudgetBillSkips,
  postBudgetBillSkip,
  deleteBudgetBillSkip,
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
import {
  loadBudgetDensity,
  loadBudgetMode,
  saveBudgetDensity,
  saveBudgetMode,
  type BudgetDensity,
  type BudgetMode,
} from "../lib/budgetPrefs";
import { shareSvgAsPng } from "../lib/shareChart";
import Sheet from "../components/Sheet";
import ConfirmDialog from "../components/ConfirmDialog";
import SwipeableRow from "../components/SwipeableRow";
import { Icon } from "../components/icons";
import BudgetAccountsPanel from "./budget/BudgetAccountsPanel";
import BudgetAccountsStrip from "./budget/BudgetAccountsStrip";
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
import BudgetFairnessSnapshot from "./budget/BudgetFairnessSnapshot";
import BudgetFiltersPanel, { type BudgetFilters } from "./budget/BudgetFiltersPanel";
import BudgetGoalsCard from "./budget/BudgetGoalsCard";
import BudgetGoalsPanel from "./budget/BudgetGoalsPanel";
import BudgetIncomeBanner from "./budget/BudgetIncomeBanner";
import BudgetInsights from "./budget/BudgetInsights";
import BudgetMonthClose from "./budget/BudgetMonthClose";
import BudgetMonthNoteBanner from "./budget/BudgetMonthNoteBanner";
import BudgetOpeningBalanceWizard from "./budget/BudgetOpeningBalanceWizard";
import BudgetOverviewHero from "./budget/BudgetOverviewHero";
import BudgetQuickAdd, { type QuickAddPrefill } from "./budget/BudgetQuickAdd";
import BudgetRecurringPreview from "./budget/BudgetRecurringPreview";
import BudgetScenarioPanel from "./budget/BudgetScenarioPanel";
import BudgetSetupChecklist from "./budget/BudgetSetupChecklist";
import BudgetStatStrip from "./budget/BudgetStatStrip";
import BudgetTaxSummary from "./budget/BudgetTaxSummary";
import BudgetTransactionForm from "./budget/BudgetTransactionForm";
import BudgetTrendChart from "./budget/BudgetTrendChart";
import BudgetUpcomingBills from "./budget/BudgetUpcomingBills";
import BudgetWeekHeatmap from "./budget/BudgetWeekHeatmap";
import BudgetCategorizeRulesPanel from "./settings/BudgetCategorizeRulesPanel";

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

function hasActiveFilters(f: BudgetFilters, spender: string, categoryId: number | null): boolean {
  return Boolean(
    categoryId != null ||
      spender.trim() ||
      f.merchant.trim() ||
      f.noteContains.trim() ||
      f.amountMin.trim() ||
      f.amountMax.trim() ||
      f.tag.trim()
  );
}

function dayLabel(isoDay: string): string {
  const d = new Date(`${isoDay}T12:00:00`);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const key = (x: Date) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  if (key(d) === key(today)) return "Today";
  if (key(d) === key(yesterday)) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

type ChartMode = "category" | "user";
type BudgetTab = "overview" | "ledger" | "plan";
type PlanSection = "plan" | "accounts" | "bills" | "goals" | "year" | "tools";
type ScopeView = "household" | "all" | "mine";

export default function BudgetPage() {
  const { token, actorUserId } = useAuth();
  const { theme } = useTheme();
  const chartColors = theme === "dark" ? CHART_COLORS_DARK : CHART_COLORS_LIGHT;
  const tok = token.trim();
  const actor = validActorId(actorUserId) ? actorUserId.trim() : "";
  const roster = useDiscordGuildRoster(token);
  const undoToast = useUndoToast();
  const { showToast } = useToasts();
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
  const [categoryFilter, setCategoryFilter] = useState<number | null>(null);

  const [categories, setCategories] = useState<BudgetCategory[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [summary, setSummary] = useState<BudgetMonthSummary | null>(null);
  const [byCategory, setByCategory] = useState<BudgetSummarySlice[]>([]);
  const [byUser, setByUser] = useState<BudgetSummarySlice[]>([]);
  const [txData, setTxData] = useState<PagedBudgetTransactions | null>(null);
  const [ledgerItems, setLedgerItems] = useState<BudgetTransactionListItem[]>([]);
  const [ledgerPage, setLedgerPage] = useState(
    Number.isFinite(initialPage) && initialPage >= 0 ? initialPage : 0
  );
  const [ledgerHasNext, setLedgerHasNext] = useState(false);
  const [ledgerLoadingMore, setLedgerLoadingMore] = useState(false);
  const ledgerSentinelRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [monthTxAll, setMonthTxAll] = useState<BudgetTransactionListItem[]>([]);
  const [budgetMode, setBudgetMode] = useState<BudgetMode>(() => loadBudgetMode());
  const [budgetDensity, setBudgetDensity] = useState<BudgetDensity>(() => loadBudgetDensity());
  const [skippedBillIds, setSkippedBillIds] = useState<number[]>([]);

  useEffect(() => {
    if (!highlightId || !ledgerItems.some((r) => r.id === highlightId)) return;
    highlightRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [highlightId, ledgerItems]);

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
  const [tab, setTab] = useState<BudgetTab>(initialTab);
  const [planSection, setPlanSection] = useState<PlanSection>("plan");
  const [addOpen, setAddOpen] = useState(false);
  const [dismissBusyKey, setDismissBusyKey] = useState<string | null>(null);
  const [quickAddPrefill, setQuickAddPrefill] = useState<QuickAddPrefill>(null);
  const [deleteTarget, setDeleteTarget] = useState<BudgetTransactionListItem | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkCategoryId, setBulkCategoryId] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);

  useEffect(() => {
    if (highlightId) setTab("ledger");
  }, [highlightId]);
  const [trendMonths, setTrendMonths] = useState(6);
  const [trendGroupBy, setTrendGroupBy] = useState<"category" | "user">("category");
  const [editTx, setEditTx] = useState<BudgetTransactionListItem | null>(null);

  const categoryNameById = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);
  const categoryColorByName = useMemo(
    () => new Map(categories.map((c) => [c.name.toLowerCase(), c.color] as const)),
    [categories]
  );

  const scopeView: ScopeView =
    scope === "all" && spenderFilter && spenderFilter === actor ? "mine" : scope === "all" ? "all" : "household";

  function setScopeView(v: ScopeView) {
    setLedgerPage(0);
    if (v === "household") {
      setScope("household");
      setSpenderFilter("");
    } else if (v === "all") {
      setScope("all");
      setSpenderFilter("");
    } else {
      setScope("all");
      setSpenderFilter(actor);
    }
  }

  const stepMonth = useCallback((delta: number) => {
    setLedgerPage(0);
    setMonth((m) => shiftMonth(m, delta));
  }, []);
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

  // Core month-scoped data; not refetched when only the ledger page / trend window changes.
  const loadCore = useCallback(async () => {
    if (!tok) return;
    try {
      const spenderQ = spenderFilter || undefined;
      const [cats, tags, sm, catSlices, userSlices, envs, g, ip, fc, notes, au, tax, rates, billRows, recurringRows, accts, skips] =
        await Promise.all([
          getBudgetCategories(tok),
          getBudgetTags(tok).catch(() => [] as string[]),
          getBudgetSummaryMonth(tok, month, { spentByUserId: spenderQ, scope }),
          getBudgetSummaryByCategory(tok, month, { spentByUserId: spenderQ, scope }),
          getBudgetSummaryByUser(tok, month),
          getBudgetEnvelopes(tok, month),
          getBudgetGoals(tok),
          getBudgetIncomePlan(tok, month).catch(() => null),
          getBudgetForecast(tok, month).catch(() => [] as BudgetForecastCategory[]),
          getBudgetNotifications(tok).catch(() => [] as BudgetNotificationItem[]),
          getBudgetAudit(tok, 50).catch(() => [] as BudgetAuditEntry[]),
          getBudgetTaxSummary(tok, Number(month.slice(0, 4))).catch(() => [] as BudgetTaxSummaryLine[]),
          getBudgetExchangeRates(tok).catch(() => [] as BudgetExchangeRate[]),
          getBudgetBills(tok).catch(() => [] as BudgetBill[]),
          getBudgetRecurring(tok).catch(() => [] as BudgetRecurring[]),
          getBudgetAccounts(tok).catch(() => [] as BudgetAccount[]),
          getBudgetBillSkips(tok, month).catch(() => ({ billIds: [] as number[] })),
        ]);
      setCategories(cats);
      setAllTags(tags);
      setSummary(sm);
      setByCategory(catSlices);
      setByUser(userSlices);
      setEnvelopes(envs);
      setGoals(g);
      setIncomePlan(ip);
      setForecast(fc);
      setNotifications(notes);
      setAudit(au);
      setTaxSummary(tax);
      setExchangeRates(rates);
      setBills(billRows);
      setRecurring(recurringRows);
      setAccounts(accts);
      setSkippedBillIds(skips.billIds);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [tok, month, spenderFilter, scope]);

  const loadTx = useCallback(
    async (page: number, append: boolean) => {
      if (!tok) return;
      try {
        const txs = await getBudgetTransactions(tok, page, {
          month,
          spentByUserId: spenderFilter || undefined,
          scope,
          categoryId: categoryFilter != null ? String(categoryFilter) : undefined,
          merchant: appliedFilters.merchant || undefined,
          noteContains: appliedFilters.noteContains || undefined,
          amountMin: appliedFilters.amountMin || undefined,
          amountMax: appliedFilters.amountMax || undefined,
          tag: appliedFilters.tag || undefined,
        });
        setTxData(txs);
        setLedgerHasNext(txs.hasNext);
        setLedgerItems((prev) => (append ? [...prev, ...txs.items] : txs.items));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [tok, month, spenderFilter, scope, appliedFilters, categoryFilter]
  );

  const loadMonthTxAll = useCallback(async () => {
    if (!tok) return;
    try {
      const all: BudgetTransactionListItem[] = [];
      let page = 0;
      let hasNext = true;
      while (hasNext && page < 5) {
        const txs = await getBudgetTransactions(tok, page, {
          month,
          spentByUserId: spenderFilter || undefined,
          scope,
        });
        all.push(...txs.items);
        hasNext = txs.hasNext;
        page++;
      }
      setMonthTxAll(all);
    } catch {
      setMonthTxAll([]);
    }
  }, [tok, month, spenderFilter, scope]);

  const loadTrends = useCallback(async () => {
    if (!tok) return;
    try {
      setTrends(await getBudgetTrends(tok, trendMonths, trendGroupBy));
    } catch {
      setTrends([]);
    }
  }, [tok, trendMonths, trendGroupBy]);

  const load = useCallback(async () => {
    if (!tok) return;
    setError(null);
    setLedgerPage(0);
    await Promise.all([loadCore(), loadTx(0, false), loadTrends(), loadMonthTxAll()]);
  }, [tok, loadCore, loadTx, loadTrends, loadMonthTxAll]);

  useEffect(() => {
    void loadCore();
  }, [loadCore]);
  useEffect(() => {
    setLedgerPage(0);
    void loadTx(0, false);
  }, [tok, month, spenderFilter, scope, appliedFilters, categoryFilter, loadTx]);
  useEffect(() => {
    if (tab === "overview") void loadMonthTxAll();
  }, [tab, loadMonthTxAll]);
  useEffect(() => {
    void loadTrends();
  }, [loadTrends]);

  useEffect(() => {
    if (tab !== "ledger" || !ledgerHasNext || ledgerLoadingMore) return;
    const el = ledgerSentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setLedgerLoadingMore(true);
          const nextPage = ledgerPage + 1;
          void loadTx(nextPage, true).finally(() => {
            setLedgerPage(nextPage);
            setLedgerLoadingMore(false);
          });
        }
      },
      { rootMargin: "200px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [tab, ledgerHasNext, ledgerLoadingMore, ledgerPage, loadTx]);

  const chartData = (chartMode === "category" ? byCategory : byUser).map((slice) => ({
    key: slice.key,
    label: titleCase(slice.label),
    total: slice.total,
  }));

  function sliceColor(slice: BudgetSummarySlice, index: number): string {
    if (chartMode === "category") {
      const c = categoryColorByName.get(slice.label.toLowerCase());
      if (c?.trim()) return c.trim();
    } else {
      const layer = layerForAssignee(slice.key);
      // Person dot classes are Tailwind; extract the hex from the palette via computed fallback.
      const dotHex = DOT_HEX[layer.dot] ?? null;
      if (dotHex) return dotHex;
    }
    return chartColors[index % chartColors.length];
  }

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
    const uncategorized = monthTxAll.filter((r) => r.type === "expense" && r.categoryId == null).length;
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
    for (const a of accounts) {
      if (a.isActive === false || a.accountType !== "credit" || !a.creditLimit || a.creditLimit <= 0) continue;
      const owed = Math.abs(Math.min(0, a.currentBalance));
      const utilization = (owed / a.creditLimit) * 100;
      const remaining = a.creditLimit - owed;
      if (utilization >= 90 || remaining <= 100) {
        items.push({
          key: `credit-${a.id}`,
          message: `${a.name} is near its limit — $${formatMoney(remaining)} left of $${formatMoney(a.creditLimit)} (${utilization.toFixed(0)}%).`,
        });
      } else if (utilization >= 80) {
        items.push({
          key: `credit-${a.id}`,
          message: `${a.name} is at ${utilization.toFixed(0)}% of its $${formatMoney(a.creditLimit)} limit.`,
        });
      }
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
  }, [envelopes, forecast, bills, month, monthTxAll, notifications, actor, accounts, dismissBusyKey, dismissNotification]);

  const txGroups = useMemo(() => {
    if (ledgerItems.length === 0 && !txData) return [];
    const groups = new Map<string, BudgetTransactionListItem[]>();
    for (const row of ledgerItems) {
      const day = row.transactionDate?.slice(0, 10) || "undated";
      const arr = groups.get(day) ?? [];
      arr.push(row);
      groups.set(day, arr);
    }
    return [...groups.entries()].map(([day, rows]) => ({
      day,
      rows,
      spent: rows.filter((r) => r.type === "expense").reduce((s, r) => s + r.amount, 0),
    }));
  }, [ledgerItems, txData]);

  const isFresh = categories.length === 0 && ledgerItems.length === 0 && summary != null;

  async function confirmDelete() {
    if (!tok || !actor || !deleteTarget) return;
    setDeleteBusy(true);
    try {
      await deleteBudgetTransaction(tok, actor, deleteTarget.id);
      undoToast(
        `Deleted ${titleCase(deleteTarget.categoryName ?? deleteTarget.type)} $${formatMoney(deleteTarget.amount)}`,
        () => void load()
      );
      setDeleteTarget(null);
      await load();
    } finally {
      setDeleteBusy(false);
    }
  }

  function toggleSelect(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulkSetCategory() {
    if (!tok || !actor || !bulkCategoryId || selected.size === 0) return;
    setBulkBusy(true);
    try {
      const catId = Number(bulkCategoryId);
      for (const id of selected) {
        await patchBudgetTransaction(tok, actor, id, { categoryId: catId });
      }
      showToast({
        message: `Moved ${selected.size} transaction${selected.size === 1 ? "" : "s"} to ${categoryNameById.get(catId) ?? "category"}.`,
        kind: "success",
      });
      setSelected(new Set());
      setBulkCategoryId("");
      await load();
    } finally {
      setBulkBusy(false);
    }
  }

  async function bulkMarkCleared() {
    if (!tok || !actor || selected.size === 0) return;
    setBulkBusy(true);
    try {
      const clearedAt = new Date().toISOString();
      for (const id of selected) {
        await patchBudgetTransaction(tok, actor, id, { isPending: false, clearedAt });
      }
      showToast({ message: `Marked ${selected.size} transaction${selected.size === 1 ? "" : "s"} cleared.`, kind: "success" });
      setSelected(new Set());
      await load();
    } finally {
      setBulkBusy(false);
    }
  }

  function applyFilters() {
    setLedgerPage(0);
    setAppliedFilters({ ...filters });
  }

  function clearFilters() {
    setFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    setSpenderFilter("");
    setCategoryFilter(null);
    setLedgerPage(0);
  }

  function viewCategoryInLedger(categoryId: number) {
    setCategoryFilter(categoryId);
    setLedgerPage(0);
    setTab("ledger");
  }

  function viewUserInLedger(userId: string) {
    setScope("all");
    setSpenderFilter(userId);
    setLedgerPage(0);
    setTab("ledger");
  }

  function viewMerchantInLedger(merchant: string) {
    setFilters((f) => ({ ...f, merchant }));
    setAppliedFilters((f) => ({ ...f, merchant }));
    setLedgerPage(0);
    setTab("ledger");
  }

  async function skipBill(billId: number) {
    if (!tok || !actor) return;
    await postBudgetBillSkip(tok, actor, billId, month);
    setSkippedBillIds((prev) => [...prev, billId]);
  }

  async function unskipBill(billId: number) {
    if (!tok || !actor) return;
    await deleteBudgetBillSkip(tok, actor, billId, month);
    setSkippedBillIds((prev) => prev.filter((id) => id !== billId));
  }

  function setBudgetModePref(mode: BudgetMode) {
    setBudgetMode(mode);
    saveBudgetMode(mode);
  }

  function setBudgetDensityPref(d: BudgetDensity) {
    setBudgetDensity(d);
    saveBudgetDensity(d);
  }

  function onPieClick(index: number) {
    const slices = chartMode === "category" ? byCategory : byUser;
    const slice = slices[index];
    if (!slice) return;
    if (chartMode === "category") {
      const id = Number(slice.key);
      if (id > 0) viewCategoryInLedger(id);
    } else if (slice.key && slice.key !== "0") {
      viewUserInLedger(slice.key);
    }
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
    <div
      className={`space-y-6 pb-24 md:pb-0${budgetDensity === "compact" ? " budget-density-compact" : ""}`}
      {...swipe}
    >
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
                setLedgerPage(0);
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
          <label className="mb-1 block text-xs text-slate-400">Whose money</label>
          <div className="flex overflow-hidden rounded-lg border border-slate-700">
            {(
              [
                ["household", "Household"],
                ["all", "Include personal"],
                ["mine", "Just me"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                disabled={id === "mine" && !actor}
                title={id === "mine" && !actor ? "Set “Acting as” in Settings first" : undefined}
                onClick={() => setScopeView(id)}
                className={`px-3 py-2 text-sm ${
                  scopeView === id ? "bg-gradient-to-r from-blue-600 to-blue-700 text-white" : "bg-slate-900/60 text-slate-400 hover:text-slate-200"
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <span className="hidden text-xs text-slate-500 md:inline">Swipe left/right to change month on mobile</span>
        <div className="ml-auto flex flex-wrap gap-2">
          <div className="flex overflow-hidden rounded-lg border border-slate-700">
            {(
              [
                ["simple", "Simple"],
                ["full", "Full"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setBudgetModePref(id)}
                className={`px-3 py-1.5 text-xs ${
                  budgetMode === id ? "bg-gradient-to-r from-blue-600 to-blue-700 text-white" : "bg-slate-900/60 text-slate-400"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex overflow-hidden rounded-lg border border-slate-700">
            {(
              [
                ["comfortable", "Comfortable"],
                ["compact", "Compact"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setBudgetDensityPref(id)}
                className={`px-3 py-1.5 text-xs ${
                  budgetDensity === id ? "bg-gradient-to-r from-blue-600 to-blue-700 text-white" : "bg-slate-900/60 text-slate-400"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
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
          hasTransactions={ledgerItems.length > 0 || monthTxAll.length > 0}
          onAddCategories={() => goPlan("accounts")}
          onEditPlan={() => goPlan("plan")}
          onAddAccount={() => goPlan("accounts")}
          onAddTransaction={() => setAddOpen(true)}
        />
      ) : (
        tab === "overview" && (
          <>
            <BudgetStatStrip
              leftToBudget={incomePlan?.availableToBudget ?? null}
              net={(summary?.totalIncome ?? 0) - (summary?.totalExpenses ?? 0)}
              billsDueCount={attentionItems.filter((i) => i.key.startsWith("bill-")).length}
              alertCount={attentionItems.length}
            />
            <BudgetOverviewHero month={month} summary={summary} incomePlan={incomePlan} envelopeSpent={envelopeSpent} />
            <BudgetMonthNoteBanner token={tok} actor={actor} month={month} onSaved={load} />
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
              prefill={quickAddPrefill}
              onPrefillConsumed={() => setQuickAddPrefill(null)}
            />
          </section>

          <BudgetUpcomingBills
            token={tok}
            actor={actor}
            bills={bills}
            skippedIds={skippedBillIds}
            month={month}
            onSkip={skipBill}
            onUnskip={unskipBill}
            onSaved={load}
            onToast={(msg) => undoToast(msg, () => void load())}
            onManageBills={() => goPlan("bills")}
          />

          <BudgetInsights
            envelopes={envelopes}
            transactions={monthTxAll}
            notifications={notifications}
            onViewCategory={viewCategoryInLedger}
            onViewMerchant={viewMerchantInLedger}
          />

          <BudgetScenarioPanel forecast={forecast} envelopes={envelopes} />

          {budgetMode === "full" && (
            <>
              <BudgetWeekHeatmap month={month} transactions={monthTxAll} />

              <BudgetAccountsStrip accounts={accounts} onManage={() => goPlan("accounts")} />

              <BudgetGoalsCard
                token={tok}
                actor={actor}
                goals={goals}
                availableToBudget={incomePlan?.availableToBudget ?? null}
                onSaved={load}
                onToast={(msg) => undoToast(msg, () => void load())}
                onManageGoals={() => goPlan("goals")}
              />

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
                  {chartData.length > 0 && (
                    <button
                      type="button"
                      disabled={shareBusy}
                      onClick={() => {
                        setShareBusy(true);
                        void shareSvgAsPng(chartRef.current, `budget-${month}-${chartMode}.png`)
                          .then((how) => {
                            showToast({
                              message: how === "copied" ? "Chart copied to clipboard." : "Chart downloaded.",
                              kind: "success",
                            });
                          })
                          .catch((e) => {
                            showToast({
                              message: e instanceof Error ? e.message : String(e),
                              kind: "error",
                            });
                          })
                          .finally(() => setShareBusy(false));
                      }}
                      className="rounded-lg hb-btn-soft px-3 py-1 text-sm text-slate-300 disabled:opacity-50"
                    >
                      {shareBusy ? "…" : "Share"}
                    </button>
                  )}
                </div>
              </div>
              {chartData.length === 0 ? (
                <p className="text-sm text-slate-500">No expense data for {formatMonthLong(month)} yet.</p>
              ) : (
                <>
                  <div ref={chartRef} className="h-72 w-full">
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
                          {(chartMode === "category" ? byCategory : byUser).map((slice, i) => (
                            <Cell
                              key={slice.key}
                              fill={sliceColor(slice, i)}
                              onClick={() => onPieClick(i)}
                              cursor="pointer"
                            />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v) => `$${formatMoney(Number(v ?? 0))}`} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="text-xs text-slate-500">Tap a slice to open it in the Ledger.</p>
                </>
              )}
            </section>
          ) : null}

          {chartMode === "category" && <BudgetFairnessSnapshot byUser={byUser} onPickUser={viewUserInLedger} />}

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
            </>
          )}
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
              prefill={quickAddPrefill}
              onPrefillConsumed={() => setQuickAddPrefill(null)}
            />
          </section>

          <BudgetFiltersPanel
            token={tok}
            roster={roster}
            spenderFilter={spenderFilter}
            onSpenderFilter={(v) => {
              setLedgerPage(0);
              setSpenderFilter(v);
            }}
            filters={filters}
            onFiltersChange={setFilters}
            allTags={allTags}
            onApply={applyFilters}
            onClear={clearFilters}
          />

          <section className="hb-card p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-medium text-white">Transactions</h2>
              {categoryFilter != null && (
                <button
                  type="button"
                  onClick={() => setCategoryFilter(null)}
                  className="flex items-center gap-1 rounded-full border border-blue-700/60 bg-blue-950/40 px-3 py-1 text-xs text-blue-100 hover:bg-blue-950/70"
                >
                  Category: {categoryNameById.get(categoryFilter) ?? `#${categoryFilter}`}
                  <span aria-hidden>✕</span>
                </button>
              )}
            </div>
            {!txData && ledgerItems.length === 0 ? (
              <p className="text-slate-500">Loading…</p>
            ) : ledgerItems.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-700 p-6 text-center">
                <p className="text-sm text-slate-400">
                  {hasActiveFilters(appliedFilters, spenderFilter, categoryFilter)
                    ? "No transactions match these filters."
                    : `Nothing logged for ${formatMonthLong(month)} yet.`}
                </p>
                {!hasActiveFilters(appliedFilters, spenderFilter, categoryFilter) && actor && (
                  <button
                    type="button"
                    onClick={() => setAddOpen(true)}
                    className="mt-3 rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-2 text-sm font-medium text-white"
                  >
                    Add the first one
                  </button>
                )}
                {hasActiveFilters(appliedFilters, spenderFilter, categoryFilter) && (
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
              <>
                {txGroups.map((group) => (
                  <div key={group.day} className="mb-2">
                    <div className="flex items-baseline justify-between border-b border-slate-800 pb-1 pt-3">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {group.day === "undated" ? "No date" : dayLabel(group.day)}
                      </h3>
                      {group.spent > 0 && (
                        <span className="text-xs text-slate-500">spent ${formatMoney(group.spent)}</span>
                      )}
                    </div>
                    <ul className="divide-y divide-slate-800/60">
                      {group.rows.map((row) => {
                        const spenderLayer = layerForAssignee(row.spentByUserId);
                        const catColor = row.categoryName
                          ? categoryColorByName.get(row.categoryName.toLowerCase())
                          : undefined;
                        return (
                          <li
                            key={row.id}
                            ref={row.id === highlightId ? highlightRef : undefined}
                            className={`budget-ledger-row text-sm ${highlightRowClass(row.id, highlightId)}`}
                          >
                            <SwipeableRow
                              enabled={Boolean(actor)}
                              onEdit={() => setEditTx(row)}
                              onDelete={() => setDeleteTarget(row)}
                            >
                            <div className="flex items-start gap-2 py-3">
                              {actor && (
                                <input
                                  type="checkbox"
                                  checked={selected.has(row.id)}
                                  onChange={() => toggleSelect(row.id)}
                                  aria-label="Select transaction"
                                  className="mt-1 h-4 w-4 rounded border-slate-600 bg-slate-900"
                                />
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                  <div>
                                    <span className={row.type === "income" ? "text-emerald-400" : "text-amber-300"}>
                                      ${formatMoney(row.amount)}
                                    </span>{" "}
                                    {row.categoryName && (
                                      <span
                                        className="mr-1 inline-block h-2 w-2 rounded-full align-middle"
                                        style={categoryDotStyle(catColor)}
                                        aria-hidden
                                      />
                                    )}
                                    <span className="text-white">
                                      {titleCase(row.categoryName ?? row.type)}
                                    </span>
                                    <span className="text-slate-500">
                                      {" · "}
                                      <span
                                        className={`mr-1 inline-block h-2 w-2 rounded-full align-middle ${spenderLayer.dot}`}
                                        aria-hidden
                                      />
                                      {row.spentByMemberLabel}
                                    </span>
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
                                        onClick={() => setDeleteTarget(row)}
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
                              </div>
                            </div>
                            </SwipeableRow>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
                <div ref={ledgerSentinelRef} className="h-4" aria-hidden />
                {ledgerLoadingMore && <p className="mt-2 text-center text-xs text-slate-500">Loading more…</p>}
              </>
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
                ["year", "Year"],
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
                    onLogSpend={(categoryId) => {
                      setQuickAddPrefill({ categoryId });
                      setTab("overview");
                    }}
                    onViewSpending={viewCategoryInLedger}
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
              <BudgetRecurringPreview recurring={recurring} />
            </>
          )}

          {planSection === "goals" && (
            <BudgetGoalsPanel token={tok} actor={actor} categories={categories} goals={goals} onSaved={load} />
          )}

          {planSection === "year" && (
            <>
              <BudgetAnnualSnapshot token={tok} year={Number(month.slice(0, 4))} />
              <section className="hb-card p-4">
                <h2 className="mb-3 text-lg font-medium text-white">Tax summary — {month.slice(0, 4)}</h2>
                {taxSummary.length === 0 ? (
                  <p className="text-sm text-slate-500">No tax-tagged spending for {month.slice(0, 4)} yet.</p>
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
            </>
          )}

          {planSection === "tools" && (
            <>
              <div className="grid gap-6 lg:grid-cols-2">
                <BudgetCurrencyPanel token={tok} actor={actor} rates={exchangeRates} onSaved={load} />
                <BudgetAuditLog entries={audit} roster={roster} />
              </div>

              <section className="hb-card p-4">
                <h2 className="mb-3 text-lg font-medium text-white">Auto-categorize rules</h2>
                <BudgetCategorizeRulesPanel token={tok} />
              </section>

              {actor && (
                <BudgetOpeningBalanceWizard token={tok} actor={actor} accounts={accounts} onSaved={load} />
              )}

              <BudgetMonthClose
                token={tok}
                actor={actor}
                month={month}
                envelopes={envelopes}
                onSaved={load}
                onGoNextMonth={() => stepMonth(1)}
              />

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

      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-4 md:bottom-8">
          <div className="hb-card flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm shadow-lg">
            <span className="text-slate-200">{selected.size} selected</span>
            <select
              value={bulkCategoryId}
              onChange={(e) => setBulkCategoryId(e.target.value)}
              className="hb-input px-2 py-1 text-xs text-slate-100"
            >
              <option value="">Set category…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={bulkBusy || !bulkCategoryId}
              onClick={() => void bulkSetCategory()}
              className="rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
            >
              Apply
            </button>
            <button
              type="button"
              disabled={bulkBusy}
              onClick={() => void bulkMarkCleared()}
              className="rounded-lg hb-btn-soft px-3 py-1 text-xs text-slate-200 disabled:opacity-50"
            >
              Mark cleared
            </button>
            <button
              type="button"
              disabled={bulkBusy}
              onClick={() => setSelected(new Set())}
              className="text-xs text-slate-400 hover:text-slate-200"
            >
              Cancel
            </button>
          </div>
        </div>
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

      <ConfirmDialog
        open={deleteTarget != null}
        title="Delete this transaction?"
        danger
        busy={deleteBusy}
        confirmLabel="Delete"
        body={
          deleteTarget ? (
            <p>
              {titleCase(deleteTarget.categoryName ?? deleteTarget.type)} — ${formatMoney(deleteTarget.amount)}
              {deleteTarget.merchant ? ` at ${deleteTarget.merchant}` : ""}. You can undo right after.
            </p>
          ) : null
        }
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

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

/** Hex lookup for person-layer dot classes (pie slices need real colors, not Tailwind classes). */
const DOT_HEX: Record<string, string> = {
  "bg-blue-400": "#60a5fa",
  "bg-cyan-400": "#22d3ee",
  "bg-violet-400": "#a78bfa",
  "bg-emerald-400": "#34d399",
  "bg-amber-400": "#fbbf24",
  "bg-rose-400": "#fb7185",
  "bg-sky-400": "#38bdf8",
  "bg-fuchsia-400": "#e879f9",
  "bg-lime-400": "#a3e635",
};
