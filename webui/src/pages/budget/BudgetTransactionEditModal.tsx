import { useEffect, useState } from "react";
import MemberIdField from "../../components/MemberIdField";
import type { DiscordGuildRosterState } from "../../hooks/useDiscordGuildRoster";
import {
  patchBudgetTransaction,
  type BudgetAccount,
  type BudgetCategory,
  type BudgetSplitInput,
  type BudgetTransactionListItem,
} from "../../api";

type SplitRow = { categoryId: string; spentByUserId: string; amount: string };

type Props = {
  open: boolean;
  row: BudgetTransactionListItem | null;
  token: string;
  actor: string;
  categories: BudgetCategory[];
  accounts: BudgetAccount[];
  roster: DiscordGuildRosterState;
  onClose: () => void;
  onSaved: () => Promise<void>;
};

export default function BudgetTransactionEditModal({
  open,
  row,
  token,
  actor,
  categories,
  accounts,
  roster,
  onClose,
  onSaved,
}: Props) {
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [spender, setSpender] = useState("");
  const [txDate, setTxDate] = useState("");
  const [merchant, setMerchant] = useState("");
  const [receiptUrl, setReceiptUrl] = useState("");
  const [note, setNote] = useState("");
  const [tags, setTags] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [useSplits, setUseSplits] = useState(false);
  const [splits, setSplits] = useState<SplitRow[]>([]);
  const [accountId, setAccountId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !row) return;
    setAmount(String(row.amount));
    setCategoryId(row.categoryId != null ? String(row.categoryId) : "");
    setSpender(row.spentByUserId);
    setTxDate(row.transactionDate?.slice(0, 10) ?? "");
    setMerchant(row.merchant ?? "");
    setReceiptUrl(row.receiptUrl ?? "");
    setNote(row.note ?? "");
    setTags(row.tags.join(", "));
    setIsPending(row.isPending);
    const hasSplits = row.splits.length > 0;
    setUseSplits(hasSplits);
    setSplits(
      hasSplits
        ? row.splits.map((s) => ({
            categoryId: s.categoryId != null ? String(s.categoryId) : "",
            spentByUserId: s.spentByUserId ?? row.spentByUserId,
            amount: String(s.amount),
          }))
        : [{ categoryId: "", spentByUserId: row.spentByUserId, amount: "" }]
    );
    setAccountId(row.accountId != null ? String(row.accountId) : "");
    setError(null);
  }, [open, row]);

  if (!open || !row) return null;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!actor) return;
    setBusy(true);
    setError(null);
    try {
      let splitPayload: BudgetSplitInput[] | undefined;
      if (useSplits && row!.type === "expense") {
        splitPayload = splits
          .filter((s) => s.amount.trim())
          .map((s) => ({
            categoryId: s.categoryId ? Number(s.categoryId) : null,
            spentByUserId: s.spentByUserId || spender,
            amount: Number(s.amount) || 0,
          }));
        if (splitPayload.length === 0) splitPayload = undefined;
      }

      await patchBudgetTransaction(token, actor, row!.id, {
        amountInput: amount.trim(),
        categoryId: categoryId ? Number(categoryId) : undefined,
        spentByUserId: spender || undefined,
        transactionDate: txDate || undefined,
        merchant: merchant || undefined,
        receiptUrl: receiptUrl.trim() || null,
        note: note || undefined,
        isPending,
        clearedAt: isPending ? null : new Date().toISOString(),
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        splits: splitPayload,
        accountId:
          row!.type !== "transfer" && accountId ? Number(accountId) : undefined,
      });
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-4 shadow-xl">
        <h3 className="mb-3 text-lg font-medium text-white">Edit transaction</h3>
        <form onSubmit={(e) => void handleSave(e)} className="space-y-3">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount"
            required
            className="w-full rounded border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100"
          />
          <input
            type="date"
            value={txDate}
            onChange={(e) => setTxDate(e.target.value)}
            className="w-full rounded border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100"
          />
          <MemberIdField
            token={token}
            value={spender}
            onChange={setSpender}
            label="Spender"
            sharedRoster={roster}
            actorId={actor}
          />
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full rounded border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100"
          >
            <option value="">Category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {row.type !== "transfer" && accounts.length > 0 && (
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full rounded border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100"
            >
              <option value="">Account (default)</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          )}
          <input
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
            placeholder="Merchant"
            className="w-full rounded border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100"
          />
          <input
            type="url"
            value={receiptUrl}
            onChange={(e) => setReceiptUrl(e.target.value)}
            placeholder="Receipt URL"
            className="w-full rounded border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100"
          />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note"
            className="w-full rounded border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100"
          />
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="Tags (comma-separated)"
            className="w-full rounded border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100"
          />
          {row.type === "expense" && (
            <label className="flex items-center gap-2 text-sm text-slate-400">
              <input type="checkbox" checked={useSplits} onChange={(e) => setUseSplits(e.target.checked)} />
              Edit splits
            </label>
          )}
          {useSplits && row.type === "expense" && (
            <div className="space-y-2 rounded border border-slate-700 p-2">
              {splits.map((s, i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-3">
                  <select
                    value={s.categoryId}
                    onChange={(e) =>
                      setSplits((prev) => prev.map((x, j) => (j === i ? { ...x, categoryId: e.target.value } : x)))
                    }
                    className="rounded border border-slate-600 bg-slate-950 px-2 py-1 text-xs text-slate-100"
                  >
                    <option value="">Cat</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <input
                    value={s.amount}
                    onChange={(e) =>
                      setSplits((prev) => prev.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))
                    }
                    placeholder="Amt"
                    className="rounded border border-slate-600 bg-slate-950 px-2 py-1 text-xs text-slate-100"
                  />
                  <input
                    value={s.spentByUserId}
                    onChange={(e) =>
                      setSplits((prev) =>
                        prev.map((x, j) => (j === i ? { ...x, spentByUserId: e.target.value } : x))
                      )
                    }
                    placeholder="Spender"
                    list={roster.data?.available ? `split-spenders-${i}` : undefined}
                    className="rounded border border-slate-600 bg-slate-950 px-2 py-1 text-xs text-slate-100"
                  />
                  {roster.data?.available && (
                    <datalist id={`split-spenders-${i}`}>
                      {roster.data.members.map((m) => (
                        <option key={m.userId} value={m.userId}>
                          {m.displayName || m.username}
                        </option>
                      ))}
                    </datalist>
                  )}
                </div>
              ))}
              <button
                type="button"
                className="text-xs text-blue-400"
                onClick={() => setSplits((prev) => [...prev, { categoryId: "", spentByUserId: spender, amount: "" }])}
              >
                + split line
              </button>
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-slate-400">
            <input type="checkbox" checked={isPending} onChange={(e) => setIsPending(e.target.checked)} />
            Pending (not cleared)
          </label>
          {error && <p className="text-sm text-red-300">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded px-3 py-1 text-sm text-slate-400">
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !actor}
              className="rounded bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
