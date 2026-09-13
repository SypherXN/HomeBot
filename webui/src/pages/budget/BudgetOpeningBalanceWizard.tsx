import { useEffect, useState } from "react";
import { postBudgetOpeningBalance, type BudgetAccount } from "../../api";
import { formatMoney } from "../../lib/budgetMoney";

type Props = {
  token: string;
  actor: string;
  accounts: BudgetAccount[];
  onSaved: () => Promise<void>;
};

/** Sets or updates starting balances. Stays on screen so every account can be filled. */
export default function BudgetOpeningBalanceWizard({ token, actor, accounts, onSaved }: Props) {
  const active = accounts.filter((a) => a.isActive !== false);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setAmounts((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const a of accounts) {
        if (a.isActive === false) continue;
        const key = String(a.id);
        if (key in next) continue;
        next[key] = a.openingBalanceAmount != null ? String(a.openingBalanceAmount) : "";
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [accounts]);

  if (!actor || active.length === 0) return null;

  async function handleSave(account: BudgetAccount) {
    const key = String(account.id);
    const amount = (amounts[key] ?? "").trim();
    if (!amount) return;
    setBusyId(account.id);
    setError(null);
    setSuccess(null);
    try {
      await postBudgetOpeningBalance(token, actor, account.id, {
        amountInput: amount,
        transactionDate: date || undefined,
      });
      const had = account.openingBalanceTransactionId != null;
      setSuccess(
        had ? `Updated opening balance on ${account.name}.` : `Set opening balance on ${account.name}.`
      );
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  const missing = active.filter((a) => a.openingBalanceTransactionId == null).length;

  return (
    <div className="rounded-lg border border-slate-700/80 bg-slate-950/40 p-3">
      <h3 className="text-sm font-medium text-slate-200">Opening balances</h3>
      <p className="mt-1 text-xs text-slate-500">
        This stays on the page so you can set every account. Starting amounts do not count as income. Saving again
        updates that account&apos;s opening entry instead of adding another one.
        {missing > 0 ? ` ${missing} account${missing === 1 ? "" : "s"} still need${missing === 1 ? "s" : ""} one.` : ""}
      </p>
      <label className="mt-3 block text-xs text-slate-400">
        As of
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="mt-1 w-full hb-input px-2 py-1.5 text-sm text-slate-100"
        />
      </label>
      <ul className="mt-3 space-y-2">
        {active.map((a) => {
          const key = String(a.id);
          const hasExisting = a.openingBalanceTransactionId != null;
          const value = amounts[key] ?? "";
          return (
            <li key={a.id} className="flex flex-wrap items-center gap-2 rounded border border-slate-800 px-2 py-2">
              <span className="min-w-[7rem] flex-1 text-sm text-slate-200">
                {a.name}
                {hasExisting ? (
                  <span className="ml-1 text-xs text-slate-500">
                    (open ${formatMoney(a.openingBalanceAmount ?? 0)})
                  </span>
                ) : (
                  <span className="ml-1 text-xs text-amber-400/90">needs opening</span>
                )}
              </span>
              <input
                value={value}
                onChange={(e) => setAmounts((prev) => ({ ...prev, [key]: e.target.value }))}
                placeholder="Amount"
                inputMode="decimal"
                className="w-28 hb-input px-2 py-1.5 text-sm text-slate-100"
              />
              <button
                type="button"
                disabled={busyId != null || !value.trim()}
                onClick={() => void handleSave(a)}
                className="rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              >
                {busyId === a.id ? "Saving…" : hasExisting ? "Update" : "Set"}
              </button>
            </li>
          );
        })}
      </ul>
      {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
      {success && <p className="mt-2 text-xs text-emerald-300">{success}</p>}
    </div>
  );
}
