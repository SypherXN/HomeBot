import { useEffect, useState } from "react";
import Sheet from "../../components/Sheet";
import { formatMoney, MONEY_TEXT } from "../../lib/budgetMoney";
import MoneyUserField, { type MoneyUserOption } from "./MoneyUserField";

type Props = {
  open: boolean;
  actor: string;
  rosterOptions: MoneyUserOption[];
  canActor: boolean;
  onClose: () => void;
  onSubmit: (input: {
    name: string;
    amountInput: string;
    paidBy: string;
    owedBy: string;
    percent: number;
    description?: string;
    notes?: string;
  }) => Promise<void>;
};

const PRESETS = [100, 50, 60, 40] as const;

/**
 * Splitwise-style add-expense sheet: what, how much, who paid, who owes,
 * and their share (100% = owes the full amount; otherwise bill × percent).
 */
export default function MoneyExpenseSheet({ open, actor, rosterOptions, canActor, onClose, onSubmit }: Props) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [paidBy, setPaidBy] = useState("");
  const [owedBy, setOwedBy] = useState("");
  const [percent, setPercent] = useState(100);
  const [customPct, setCustomPct] = useState("");
  const [desc, setDesc] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setPaidBy((p) => p || actor);
  }, [open, actor]);

  const amountNum = Number.parseFloat(amount.replace(/[^0-9.]/g, ""));
  const sharePreview =
    Number.isFinite(amountNum) && amountNum > 0 ? (amountNum * percent) / 100 : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !amount.trim() || !paidBy || !owedBy) return;
    setBusy(true);
    try {
      await onSubmit({
        name: name.trim(),
        amountInput: amount.trim(),
        paidBy: paidBy.trim(),
        owedBy: owedBy.trim(),
        percent,
        description: desc.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      setName("");
      setAmount("");
      setOwedBy("");
      setPercent(100);
      setCustomPct("");
      setDesc("");
      setNotes("");
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} title="Add expense" onClose={onClose}>
      <form onSubmit={(e) => void submit(e)} className="space-y-3">
        <div className="grid grid-cols-[1fr_7rem] gap-3">
          <label className="block text-xs text-slate-400">
            What was it?
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Groceries"
              className="mt-1 w-full hb-input px-3 py-2 text-slate-100 placeholder:text-slate-500"
            />
          </label>
          <label className="block text-xs text-slate-400">
            Total
            <div className={`mt-1 flex items-center hb-input px-2 ${MONEY_TEXT}`}>
              <span className="text-slate-500">$</span>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                placeholder="0.00"
                className="w-full bg-transparent px-1 py-2 text-slate-100 outline-none placeholder:text-slate-500"
              />
            </div>
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <MoneyUserField
            id="mx-paid"
            label="Paid by"
            value={paidBy}
            onChange={setPaidBy}
            rosterOptions={rosterOptions}
            canActor={canActor}
            onPickActor={() => setPaidBy(actor)}
          />
          <MoneyUserField
            id="mx-owed"
            label="Who owes"
            value={owedBy}
            onChange={setOwedBy}
            rosterOptions={rosterOptions}
            canActor={canActor}
            onPickActor={() => setOwedBy(actor)}
          />
        </div>

        <div>
          <span className="mb-1 block text-xs text-slate-400">Their share</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  setPercent(p);
                  setCustomPct("");
                }}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                  percent === p && !customPct
                    ? "border-blue-500 bg-blue-950/50 text-blue-100"
                    : "border-slate-700 bg-slate-950 text-slate-400 hover:text-slate-200"
                }`}
              >
                {p === 100 ? "Full amount" : `${p}%`}
              </button>
            ))}
            <div className="flex items-center gap-1 rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1">
              <input
                value={customPct}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "").slice(0, 3);
                  setCustomPct(v);
                  const n = Number.parseInt(v, 10);
                  if (n >= 1 && n <= 100) setPercent(n);
                }}
                inputMode="numeric"
                placeholder="custom"
                aria-label="Custom percent"
                className="w-14 bg-transparent text-center text-xs text-slate-100 outline-none placeholder:text-slate-600"
              />
              <span className="text-xs text-slate-500">%</span>
            </div>
          </div>
          {sharePreview != null && (
            <p className={`mt-1.5 text-xs text-slate-400 ${MONEY_TEXT}`}>
              They owe <span className="font-semibold text-amber-300">${formatMoney(sharePreview)}</span>
              {percent < 100 ? ` of $${formatMoney(amountNum)}` : ""}
            </p>
          )}
        </div>

        <input
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="Description (optional)"
          className="w-full hb-input px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
        />
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          className="w-full hb-input px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
        />

        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            disabled={busy || !name.trim() || !amount.trim() || !paidBy || !owedBy || paidBy === owedBy}
            className="rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-2 text-sm font-medium text-white hover:from-blue-500 hover:to-blue-600 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Add expense"}
          </button>
          <button type="button" onClick={onClose} className="rounded-lg hb-btn-soft px-4 py-2 text-sm text-slate-300">
            Cancel
          </button>
        </div>
        {paidBy && owedBy && paidBy === owedBy && (
          <p className="text-xs text-amber-300">Paid by and who owes must be different people.</p>
        )}
      </form>
    </Sheet>
  );
}
