import { formatMoney } from "../../lib/budgetMoney";
import { transferBonusLabel } from "../../lib/budgetTransfer";

type Props = {
  paid: string;
  received: string;
  onPaidChange: (value: string) => void;
  onReceivedChange: (value: string) => void;
};

/** Paid vs received amounts — gift cards can credit more than you spent. */
export default function TransferAmountFields({ paid, received, onPaidChange, onReceivedChange }: Props) {
  const from = Number(paid) || 0;
  const to = received.trim() ? Number(received) || 0 : from;
  const hint = from > 0 ? transferBonusLabel(from, to, formatMoney) : null;

  return (
    <div className="space-y-2">
      <label className="block text-xs text-slate-400">
        Amount paid
        <input
          required
          inputMode="decimal"
          value={paid}
          onChange={(e) => onPaidChange(e.target.value)}
          placeholder="80.00"
          className="mt-1 w-full hb-input px-3 py-2 text-sm text-slate-100"
        />
      </label>
      <label className="block text-xs text-slate-400">
        Amount received
        <span className="ml-1 font-normal text-slate-500">(if different)</span>
        <input
          inputMode="decimal"
          value={received}
          onChange={(e) => onReceivedChange(e.target.value)}
          placeholder="Same as paid, or 100.00 for a gift-card bonus"
          className="mt-1 w-full hb-input px-3 py-2 text-sm text-slate-100"
        />
      </label>
      {hint && <p className={`text-xs ${hint.startsWith("Fee") ? "text-rose-300" : "text-emerald-300"}`}>{hint}</p>}
    </div>
  );
}
