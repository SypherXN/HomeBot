import { useState } from "react";
import { postBudgetAccount, postBudgetTransfer, type BudgetAccount } from "../../api";

function formatMoney(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Props = {
  token: string;
  actor: string;
  accounts: BudgetAccount[];
  onSaved: () => Promise<void>;
};

export default function BudgetAccountsPanel({ token, actor, accounts, onSaved }: Props) {
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("checking");
  const [xferFrom, setXferFrom] = useState("");
  const [xferTo, setXferTo] = useState("");
  const [xferAmount, setXferAmount] = useState("");
  const [xferNote, setXferNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAddAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!actor || !newName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await postBudgetAccount(token, actor, { name: newName.trim(), accountType: newType });
      setNewName("");
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleTransfer(e: React.FormEvent) {
    e.preventDefault();
    if (!actor || !xferFrom || !xferTo || !xferAmount.trim()) return;
    if (xferFrom === xferTo) {
      setError("Choose two different accounts.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await postBudgetTransfer(token, actor, {
        amountInput: xferAmount.trim(),
        fromAccountId: Number(xferFrom),
        toAccountId: Number(xferTo),
        note: xferNote.trim() || undefined,
      });
      setXferAmount("");
      setXferNote("");
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <h2 className="mb-3 text-lg font-medium text-white">Accounts & transfers</h2>
      <p className="mb-3 text-xs text-slate-500">
        Track balances across checking, savings, or credit accounts. Transfers move money between accounts without
        affecting category totals.
      </p>

      {accounts.length === 0 ? (
        <p className="mb-3 text-sm text-slate-500">No accounts yet.</p>
      ) : (
        <ul className="mb-4 space-y-2 text-sm">
          {accounts.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-800 px-3 py-2 text-slate-300"
            >
              <span>
                {a.name}{" "}
                <span className="text-xs text-slate-500">
                  ({a.accountType}
                  {a.currency !== "USD" ? ` · ${a.currency}` : ""})
                </span>
              </span>
              <span className="font-medium text-white">${formatMoney(a.currentBalance)}</span>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="mb-3 text-sm text-red-300">{error}</p>}

      {actor && (
        <div className="grid gap-6 lg:grid-cols-2">
          <form onSubmit={(e) => void handleAddAccount(e)} className="space-y-2 border-t border-slate-800 pt-3">
            <p className="text-xs font-medium text-slate-400">Add account</p>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Name"
              required
              className="w-full rounded border border-slate-600 bg-slate-950 px-2 py-1 text-sm text-slate-100"
            />
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              className="w-full rounded border border-slate-600 bg-slate-950 px-2 py-1 text-sm text-slate-100"
            >
              <option value="checking">Checking</option>
              <option value="savings">Savings</option>
              <option value="credit">Credit</option>
              <option value="cash">Cash</option>
            </select>
            <button
              type="submit"
              disabled={busy}
              className="rounded bg-slate-700 px-3 py-1 text-xs text-white disabled:opacity-50"
            >
              Add account
            </button>
          </form>

          <form onSubmit={(e) => void handleTransfer(e)} className="space-y-2 border-t border-slate-800 pt-3">
            <p className="text-xs font-medium text-slate-400">Transfer between accounts</p>
            <select
              value={xferFrom}
              onChange={(e) => setXferFrom(e.target.value)}
              required
              className="w-full rounded border border-slate-600 bg-slate-950 px-2 py-1 text-sm text-slate-100"
            >
              <option value="">From</option>
              {accounts.map((a) => (
                <option key={`f-${a.id}`} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <select
              value={xferTo}
              onChange={(e) => setXferTo(e.target.value)}
              required
              className="w-full rounded border border-slate-600 bg-slate-950 px-2 py-1 text-sm text-slate-100"
            >
              <option value="">To</option>
              {accounts.map((a) => (
                <option key={`t-${a.id}`} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <input
              value={xferAmount}
              onChange={(e) => setXferAmount(e.target.value)}
              placeholder="Amount"
              required
              className="w-full rounded border border-slate-600 bg-slate-950 px-2 py-1 text-sm text-slate-100"
            />
            <input
              value={xferNote}
              onChange={(e) => setXferNote(e.target.value)}
              placeholder="Note (optional)"
              className="w-full rounded border border-slate-600 bg-slate-950 px-2 py-1 text-sm text-slate-100"
            />
            <button
              type="submit"
              disabled={busy || accounts.length < 2}
              className="rounded bg-blue-600 px-3 py-1 text-xs text-white disabled:opacity-50"
            >
              Record transfer
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
