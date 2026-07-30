import { useEffect, useState } from "react";
import Sheet from "../../components/Sheet";
import { MONEY_TEXT } from "../../lib/budgetMoney";
import MoneyUserField, { type MoneyUserOption } from "./MoneyUserField";

export type SettlePrefill = { from: string; to: string; amount: string } | null;

type Props = {
  open: boolean;
  prefill: SettlePrefill;
  actor: string;
  rosterOptions: MoneyUserOption[];
  canActor: boolean;
  onClose: () => void;
  onSubmit: (input: { amountInput: string; paidBy: string; receivedBy: string }) => Promise<void>;
};

/** Settle-up sheet: money moved from one person to another. Prefilled from balance rows. */
export default function MoneySettleSheet({ open, prefill, actor, rosterOptions, canActor, onClose, onSubmit }: Props) {
  const [amount, setAmount] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFrom(prefill?.from ?? "");
    setTo(prefill?.to ?? "");
    setAmount(prefill?.amount ?? "");
  }, [open, prefill]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!amount.trim() || !from || !to) return;
    setBusy(true);
    try {
      await onSubmit({ amountInput: amount.trim(), paidBy: from.trim(), receivedBy: to.trim() });
      setAmount("");
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} title="Settle up" onClose={onClose}>
      <form onSubmit={(e) => void submit(e)} className="space-y-3">
        <label className="block text-xs text-slate-400">
          Amount
          <div className={`mt-1 flex items-center hb-input px-2 ${MONEY_TEXT}`}>
            <span className="text-slate-500">$</span>
            <input
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              className="w-full bg-transparent px-1 py-2 text-slate-100 outline-none placeholder:text-slate-500"
            />
          </div>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <MoneyUserField
            id="settle-from"
            label="From (paid)"
            value={from}
            onChange={setFrom}
            rosterOptions={rosterOptions}
            canActor={canActor}
            onPickActor={() => setFrom(actor)}
          />
          <MoneyUserField
            id="settle-to"
            label="To (received)"
            value={to}
            onChange={setTo}
            rosterOptions={rosterOptions}
            canActor={canActor}
            onPickActor={() => setTo(actor)}
          />
        </div>
        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            disabled={busy || !amount.trim() || !from || !to || from === to}
            className="rounded-lg border border-emerald-700 bg-emerald-900/50 px-4 py-2 text-sm font-medium text-emerald-100 hover:bg-emerald-900/70 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Record payment"}
          </button>
          <button type="button" onClick={onClose} className="rounded-lg hb-btn-soft px-4 py-2 text-sm text-slate-300">
            Cancel
          </button>
        </div>
        {from && to && from === to && (
          <p className="text-xs text-amber-300">From and to must be different people.</p>
        )}
      </form>
    </Sheet>
  );
}
