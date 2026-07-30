import { useState } from "react";
import { postBudgetOpeningBalance, type BudgetAccount } from "../../api";
import { formatMoney } from "../../lib/budgetMoney";

type Props = {
  token: string;
  actor: string;
  accounts: BudgetAccount[];
  onSaved: () => Promise<void>;
};

/** Sets starting balance on an account without counting as income. */
export default function BudgetOpeningBalanceWizard({ token, actor, accounts, onSaved }: Props) {
  const active = accounts.filter((a) => a.isActive !== false);
  const [accountId, setAccountId] = useState(active[0] ? String(active[0].id) : "");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!actor || active.length === 0) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!accountId || !amount.trim()) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await postBudgetOpeningBalance(token, actor, Number(accountId), {
        amountInput: amount.trim(),
        transactionDate: date || undefined,
      });
      const name = active.find((a) => String(a.id) === accountId)?.name ?? "account";
      setSuccess(`Opening balance set on ${name}.`);
      setAmount("");
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-700/80 bg-slate-950/40 p-3">
      <h3 className="text-sm font-medium text-slate-200">Opening balance</h3>
      <p className="mt-1 text-xs text-slate-500">
        Sets the starting balance without counting as income (won&apos;t pollute YTD).
      </p>
      <form onSubmit={(e) => void handleSubmit(e)} className="mt-3 space-y-2">
        <select
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          required
          className="w-full hb-input px-2 py-1.5 text-sm text-slate-100"
        >
          <option value="">Account…</option>
          {active.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} (${formatMoney(a.currentBalance)})
            </option>
          ))}
        </select>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount"
          inputMode="decimal"
          required
          className="w-full hb-input px-2 py-1.5 text-sm text-slate-100"
        />
        <label className="block text-xs text-slate-400">
          As of (optional)
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 w-full hb-input px-2 py-1.5 text-sm text-slate-100"
          />
        </label>
        <button
          type="submit"
          disabled={busy || !amount.trim()}
          className="rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {busy ? "Saving…" : "Set opening balance"}
        </button>
      </form>
      {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
      {success && <p className="mt-2 text-xs text-emerald-300">{success}</p>}
    </div>
  );
}
