import { useEffect, useState } from "react";
import Sheet from "../../components/Sheet";
import type { DiscordGuildRosterState } from "../../hooks/useDiscordGuildRoster";
import { formatMoney } from "../../lib/budgetMoney";
import {
  draftsFromShareSummary,
  shareChargeError,
  toShareChargeInputs,
  type ShareChargeDraft,
} from "../../lib/budgetShares";
import { patchBudgetTransaction, type BudgetTransactionListItem } from "../../api";
import { BudgetExpenseShareEditor } from "./BudgetShareEditors";

type Props = {
  open: boolean;
  row: BudgetTransactionListItem | null;
  token: string;
  actor: string;
  roster: DiscordGuildRosterState;
  onClose: () => void;
  onSaved: () => Promise<void>;
};

/** Quick split editor for a ledger expense — no full transaction form. */
export default function BudgetLedgerShareSheet({ open, row, token, actor, roster, onClose, onSaved }: Props) {
  const [shareDrafts, setShareDrafts] = useState<ShareChargeDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !row) return;
    setShareDrafts(draftsFromShareSummary(row.shareSummary));
    setError(null);
  }, [open, row]);

  if (!open || !row) return null;

  const title = row.merchant?.trim() || "Expense";

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!actor) return;
    const err = shareChargeError(row!.amount, shareDrafts);
    if (err) {
      setError(err);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await patchBudgetTransaction(token, actor, row!.id, {
        shareCharges: toShareChargeInputs(shareDrafts),
      });
      await onSaved();
      onClose();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : String(ex));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} title="Charge others" onClose={onClose}>
      <form onSubmit={(e) => void save(e)} className="space-y-3">
        <p className="text-sm text-slate-300">
          {title} · ${formatMoney(row.amount)}
          {row.transactionDate ? ` · ${row.transactionDate.slice(0, 10)}` : ""}
        </p>
        <BudgetExpenseShareEditor
          key={row.id}
          total={row.amount}
          token={token}
          roster={roster}
          drafts={shareDrafts}
          onChange={setShareDrafts}
        />
        {error && <p className="text-sm text-rose-300">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg hb-btn-soft px-4 py-2 text-sm text-slate-300">
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save split"}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
