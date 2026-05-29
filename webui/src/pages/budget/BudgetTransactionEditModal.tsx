import { useEffect, useState } from "react";
import { patchBudgetTransaction, type BudgetCategory, type BudgetTransactionListItem } from "../../api";

type Props = {
  open: boolean;
  row: BudgetTransactionListItem | null;
  token: string;
  actor: string;
  categories: BudgetCategory[];
  onClose: () => void;
  onSaved: () => Promise<void>;
};

export default function BudgetTransactionEditModal({
  open,
  row,
  token,
  actor,
  categories,
  onClose,
  onSaved,
}: Props) {
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [merchant, setMerchant] = useState("");
  const [note, setNote] = useState("");
  const [tags, setTags] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !row) return;
    setAmount(String(row.amount));
    setCategoryId(row.categoryId != null ? String(row.categoryId) : "");
    setMerchant(row.merchant ?? "");
    setNote(row.note ?? "");
    setTags(row.tags.join(", "));
    setIsPending(row.isPending);
    setError(null);
  }, [open, row]);

  if (!open || !row) return null;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!actor) return;
    setBusy(true);
    setError(null);
    try {
      await patchBudgetTransaction(token, actor, row!.id, {
        amountInput: amount.trim(),
        categoryId: categoryId ? Number(categoryId) : undefined,
        merchant: merchant || undefined,
        note: note || undefined,
        isPending,
        clearedAt: isPending ? null : new Date().toISOString(),
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
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
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-4 shadow-xl">
        <h3 className="mb-3 text-lg font-medium text-white">Edit transaction</h3>
        <form onSubmit={(e) => void handleSave(e)} className="space-y-3">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount"
            required
            className="w-full rounded border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100"
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
          <input
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
            placeholder="Merchant"
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
