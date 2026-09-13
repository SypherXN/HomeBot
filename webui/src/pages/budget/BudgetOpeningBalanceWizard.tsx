import { useEffect, useState } from "react";
import { postBudgetOpeningBalance, type BudgetAccount } from "../../api";
import { formatMoney } from "../../lib/budgetMoney";

type Props = {
  token: string;
  actor: string;
  accounts: BudgetAccount[];
  onSaved: () => Promise<void>;
};

function isCredit(a: BudgetAccount): boolean {
  return a.accountType === "credit";
}

function displayOpeningAmount(a: BudgetAccount): string {
  if (a.openingBalanceAmount == null) return "";
  const n = isCredit(a) ? Math.abs(a.openingBalanceAmount) : a.openingBalanceAmount;
  return String(n);
}

/** Credit cards store debt as a negative balance; the form asks for the amount owed. */
function payloadAmount(account: BudgetAccount, input: string): string {
  const raw = input.trim().replace(/,/g, "");
  const n = Number(raw);
  if (!Number.isFinite(n) || n === 0) return raw;
  if (isCredit(account) && n > 0) return String(-n);
  return raw;
}

/** Sets or updates starting balances. Collapsed once every account has one. */
export default function BudgetOpeningBalanceWizard({ token, actor, accounts, onSaved }: Props) {
  const active = accounts.filter((a) => a.isActive !== false);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const missing = active.filter((a) => a.openingBalanceTransactionId == null).length;
  const [open, setOpen] = useState(missing > 0);

  useEffect(() => {
    setAmounts((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const a of accounts) {
        if (a.isActive === false) continue;
        const key = String(a.id);
        if (key in next) continue;
        next[key] = displayOpeningAmount(a);
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
        amountInput: payloadAmount(account, amount),
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

  return (
    <details
      className="group rounded-lg border border-slate-700/80 bg-slate-950/40 p-3"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="cursor-pointer list-none text-sm font-medium text-slate-200 marker:hidden">
        <span className="inline-block transition-transform group-open:rotate-90">▸</span> Opening balances{" "}
        {missing > 0 ? (
          <span className="text-xs font-normal text-amber-400/90">
            {missing} account{missing === 1 ? "" : "s"} still need{missing === 1 ? "s" : ""} one
          </span>
        ) : (
          <span className="text-xs font-normal text-slate-500">all set</span>
        )}
      </summary>
      <p className="mt-2 text-xs text-slate-500">
        Checking and savings use cash on hand. Credit cards use the amount you currently owe (stored as a negative
        balance). Starting amounts do not count as income.
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
          const credit = isCredit(a);
          const hasExisting = a.openingBalanceTransactionId != null;
          const value = amounts[key] ?? "";
          const owed = hasExisting && credit ? Math.abs(a.openingBalanceAmount ?? 0) : null;
          return (
            <li key={a.id} className="flex flex-wrap items-center gap-2 rounded border border-slate-800 px-2 py-2">
              <span className="min-w-[7rem] flex-1 text-sm text-slate-200">
                {a.name}
                {credit && <span className="ml-1 text-xs text-slate-500">· credit</span>}
                {hasExisting ? (
                  <span className="ml-1 text-xs text-slate-500">
                    {credit
                      ? `(owe $${formatMoney(owed ?? 0)})`
                      : `(open $${formatMoney(a.openingBalanceAmount ?? 0)})`}
                  </span>
                ) : (
                  <span className="ml-1 text-xs text-amber-400/90">needs opening</span>
                )}
              </span>
              <input
                value={value}
                onChange={(e) => setAmounts((prev) => ({ ...prev, [key]: e.target.value }))}
                placeholder={credit ? "Amount owed" : "Amount"}
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
    </details>
  );
}
