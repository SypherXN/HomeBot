import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useHorizontalSwipe } from "../hooks/useHorizontalSwipe";
import { validActorId } from "../lib/validation";
import { titleCase } from "../lib/titleCase";
import { formatMoney, formatMonthLong } from "../lib/budgetMoney";
import { layerForAssignee } from "../lib/personLayers";
import { getBudgetAccounts, getBudgetTransactions, type BudgetAccount, type BudgetTransactionListItem } from "../api";
import BudgetTransactionEditModal from "./budget/BudgetTransactionEditModal";
import { useDiscordGuildRoster } from "../hooks/useDiscordGuildRoster";
import { getBudgetCategories, type BudgetCategory } from "../api";

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Deep page for one account: balance header + that account's ledger. */
export default function BudgetAccountPage() {
  const { accountId } = useParams<{ accountId: string }>();
  const { token, actorUserId } = useAuth();
  const tok = token.trim();
  const actor = validActorId(actorUserId) ? actorUserId.trim() : "";
  const roster = useDiscordGuildRoster(token);

  const [account, setAccount] = useState<BudgetAccount | null>(null);
  const [categories, setCategories] = useState<BudgetCategory[]>([]);
  const [items, setItems] = useState<BudgetTransactionListItem[]>([]);
  const [page, setPage] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [month, setMonth] = useState(currentMonth);
  const [editTx, setEditTx] = useState<BudgetTransactionListItem | null>(null);
  const [accounts, setAccounts] = useState<BudgetAccount[]>([]);
  const [error, setError] = useState<string | null>(null);

  const swipe = useHorizontalSwipe((dir) => setMonth((m) => shiftMonth(m, dir)));

  const load = useCallback(async () => {
    if (!tok || !accountId) return;
    setError(null);
    try {
      const [accts, cats, txs] = await Promise.all([
        getBudgetAccounts(tok, true),
        getBudgetCategories(tok),
        getBudgetTransactions(tok, 0, { month, accountId }),
      ]);
      setAccounts(accts);
      setAccount(accts.find((a) => String(a.id) === accountId) ?? null);
      setCategories(cats);
      setItems(txs.items);
      setHasNext(txs.hasNext);
      setPage(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [tok, accountId, month]);

  useEffect(() => {
    void load();
  }, [load]);

  async function loadMore() {
    if (!hasNext) return;
    const next = page + 1;
    const txs = await getBudgetTransactions(tok, next, { month, accountId });
    setItems((prev) => [...prev, ...txs.items]);
    setHasNext(txs.hasNext);
    setPage(next);
  }

  const utilization = useMemo(() => {
    if (!account || account.accountType !== "credit" || !account.creditLimit || account.creditLimit <= 0)
      return null;
    return Math.min(100, (Math.abs(Math.min(0, account.currentBalance)) / account.creditLimit) * 100);
  }, [account]);

  if (!tok) return <div className="hb-card p-6 text-slate-300">Sign in via Settings to use Budget.</div>;

  return (
    <div className="space-y-6" {...swipe}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-slate-400">
            <Link to="/budget" className="text-blue-400 hover:underline">
              Budget
            </Link>
            {" / "}
            {account?.name ?? "Account"}
          </p>
          <h1 className="mt-1 text-3xl font-semibold text-white">{account?.name ?? "Account"}</h1>
        </div>
        {account && (
          <div className="text-right">
            <p className={`text-2xl font-semibold ${account.currentBalance < 0 ? "text-red-300" : "text-white"}`}>
              {account.currentBalance < 0 ? "−" : ""}${formatMoney(Math.abs(account.currentBalance))}
            </p>
            {utilization != null && (
              <p className="text-xs text-slate-500">
                {utilization.toFixed(0)}% of ${formatMoney(account.creditLimit!)} limit
              </p>
            )}
          </div>
        )}
      </header>

      {error && <div className="rounded-lg border border-red-900/50 bg-red-950/40 px-4 py-3 text-sm text-red-200">{error}</div>}

      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setMonth((m) => shiftMonth(m, -1))} className="rounded-lg hb-btn-soft px-2.5 py-2 text-slate-300">
          ‹
        </button>
        <span className="text-sm text-slate-300">{formatMonthLong(month)}</span>
        <button type="button" onClick={() => setMonth((m) => shiftMonth(m, 1))} className="rounded-lg hb-btn-soft px-2.5 py-2 text-slate-300">
          ›
        </button>
      </div>

      <section className="hb-card p-4">
        {items.length === 0 ? (
          <p className="text-sm text-slate-500">No transactions for {formatMonthLong(month)} on this account.</p>
        ) : (
          <ul className="divide-y divide-slate-800">
            {items.map((row) => (
              <li key={row.id} className="py-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <span className={row.type === "income" ? "text-emerald-400" : "text-amber-300"}>
                      ${formatMoney(row.amount)}
                    </span>{" "}
                    <span className="text-white">{titleCase(row.categoryName ?? row.type)}</span>
                    <span className="text-slate-500">
                      {" · "}
                      <span className={`mr-1 inline-block h-2 w-2 rounded-full align-middle ${layerForAssignee(row.spentByUserId).dot}`} aria-hidden />
                      {row.spentByMemberLabel}
                    </span>
                    {row.merchant && <span className="text-slate-500"> · {row.merchant}</span>}
                  </div>
                  {actor && (
                    <button type="button" onClick={() => setEditTx(row)} className="text-blue-400 hover:text-blue-300">
                      Edit
                    </button>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-slate-500">{row.transactionDate}</p>
              </li>
            ))}
          </ul>
        )}
        {hasNext && (
          <button type="button" onClick={() => void loadMore()} className="mt-3 w-full rounded-lg hb-btn-soft px-4 py-2 text-sm text-slate-200">
            Load more
          </button>
        )}
      </section>

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
