import { useEffect, useRef, useState } from "react";
import { defaultTransactionDateForMonth } from "../../lib/budgetTransactionDate";
import { postBudgetTransaction, type BudgetAccount, type BudgetCategory } from "../../api";
import DiscordMemberSelect from "../../components/DiscordMemberSelect";
import type { DiscordGuildRosterState } from "../../hooks/useDiscordGuildRoster";
import { useMerchantSuggestions } from "../../hooks/useMerchantSuggestions";

export type QuickAddPrefill = { categoryId?: number; merchant?: string } | null;

type Props = {
  token: string;
  actor: string;
  month: string;
  categories: BudgetCategory[];
  accounts: BudgetAccount[];
  roster: DiscordGuildRosterState;
  onSaved: () => Promise<void>;
  /** Optional prefill (e.g. "Log spend" from an envelope card). */
  prefill?: QuickAddPrefill;
  /** Called after a prefill has been consumed. */
  onPrefillConsumed?: () => void;
};

const MERCHANT_DATALIST_ID = "budget-merchant-suggestions";

/**
 * One-line add for the common case: amount, merchant, category.
 * Expands for the full set of fields. Requires "Acting as" to be set.
 * Suggests the category from categorize rules / last purchase at that merchant.
 */
export default function BudgetQuickAdd({
  token,
  actor,
  month,
  categories,
  accounts,
  roster,
  onSaved,
  prefill,
  onPrefillConsumed,
}: Props) {
  const [type, setType] = useState<"expense" | "income">("expense");
  const [amount, setAmount] = useState("");
  const [merchant, setMerchant] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [spender, setSpender] = useState(actor);
  const [accountId, setAccountId] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(() => defaultTransactionDateForMonth(month));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  const { merchants, suggestion } = useMerchantSuggestions(token, merchant);

  useEffect(() => {
    if (!prefill) return;
    if (prefill.categoryId != null) setCategoryId(String(prefill.categoryId));
    if (prefill.merchant) setMerchant(prefill.merchant);
    amountRef.current?.focus();
    onPrefillConsumed?.();
  }, [prefill, onPrefillConsumed]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!actor || !spender || !amount.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await postBudgetTransaction(token, actor, {
        type,
        amountInput: amount.trim(),
        categoryId: categoryId ? Number(categoryId) : undefined,
        spentByUserId: spender,
        merchant: merchant.trim() || undefined,
        note: note.trim() || undefined,
        accountId: accountId ? Number(accountId) : undefined,
        transactionDate: date || undefined,
      });
      setAmount("");
      setMerchant("");
      setCategoryId("");
      setNote("");
      setExpanded(false);
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!actor) {
    return (
      <div className="rounded-lg border border-amber-700/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">
        To add transactions, set <strong>Acting as</strong> (your Discord user) in Settings → Budget.
      </div>
    );
  }

  const showSuggestion = suggestion && String(suggestion.categoryId) !== categoryId;

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex shrink-0 overflow-hidden rounded-lg border border-slate-700">
          <button
            type="button"
            onClick={() => setType("expense")}
            className={`px-3 py-2 text-sm ${type === "expense" ? "bg-amber-700 text-white" : "bg-slate-900/60 text-slate-400"}`}
          >
            Expense
          </button>
          <button
            type="button"
            onClick={() => setType("income")}
            className={`px-3 py-2 text-sm ${type === "income" ? "bg-emerald-700 text-white" : "bg-slate-900/60 text-slate-400"}`}
          >
            Income
          </button>
        </div>
        <input
          ref={amountRef}
          required
          inputMode="decimal"
          placeholder="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-24 hb-input px-3 py-2 text-slate-100"
        />
        <input
          placeholder="Merchant"
          value={merchant}
          onChange={(e) => setMerchant(e.target.value)}
          list={MERCHANT_DATALIST_ID}
          className="min-w-0 flex-1 hb-input px-3 py-2 text-slate-100"
        />
        <datalist id={MERCHANT_DATALIST_ID}>
          {merchants.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="hb-input max-w-40 px-3 py-2 text-slate-100"
        >
          <option value="">Category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.visibility === "personal" ? " (personal)" : ""}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={busy || !spender || !amount.trim()}
          className="shrink-0 rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-2 text-sm font-medium text-white hover:from-blue-500 hover:to-blue-600 disabled:opacity-50"
        >
          {busy ? "Adding…" : "Add"}
        </button>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 text-xs text-slate-400 hover:text-slate-200"
        >
          {expanded ? "Less" : "More"}
        </button>
      </div>
      {showSuggestion && (
        <button
          type="button"
          onClick={() => setCategoryId(String(suggestion.categoryId))}
          className="rounded-full border border-blue-700/50 bg-blue-950/40 px-3 py-1 text-xs text-blue-100 hover:bg-blue-950/70"
        >
          {suggestion.source === "rule" ? "Rule:" : "Last time:"} {suggestion.categoryName} — tap to apply
        </button>
      )}
      {expanded && (
        <div className="grid gap-2 rounded-lg border border-slate-800 bg-slate-950/40 p-3 sm:grid-cols-2">
          <DiscordMemberSelect
            token={token}
            label="Who spent / received"
            value={spender}
            sharedRoster={roster}
            onPickUserId={setSpender}
          />
          {accounts.length > 0 && (
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="hb-input px-3 py-2 text-sm text-slate-100"
            >
              <option value="">Account (default)</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} (${a.currentBalance.toFixed(2)})
                </option>
              ))}
            </select>
          )}
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="hb-input px-3 py-2 text-sm text-slate-100"
          />
          <input
            placeholder="Note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="hb-input px-3 py-2 text-sm text-slate-100"
          />
        </div>
      )}
      {error && <p className="text-sm text-red-300">{error}</p>}
    </form>
  );
}
