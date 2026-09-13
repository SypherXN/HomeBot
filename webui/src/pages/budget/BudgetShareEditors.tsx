import { useEffect, useId, useMemo, useState } from "react";
import type { DiscordGuildRosterState } from "../../hooks/useDiscordGuildRoster";
import { memberPickerLabel } from "../../lib/memberDisplay";
import { formatMoney } from "../../lib/budgetMoney";
import {
  chargedTotal,
  emptyShareChargeDraft,
  SHARE_EPS,
  splitRemainingEqually,
  yourShare,
  type ShareChargeDraft,
  type SharePaymentDraft,
} from "../../lib/budgetShares";
import { getBudgetShares, type BudgetShareChargeLine, type BudgetSharePaymentLine } from "../../api";

function SharePersonField({
  roster,
  label,
  onChange,
}: {
  roster: DiscordGuildRosterState;
  label: string;
  onChange: (userId: string, label: string) => void;
}) {
  const listId = useId();
  const members = roster.data?.available ? roster.data.members : [];
  return (
    <>
      <input
        list={listId}
        value={label}
        placeholder="Name or household member"
        onChange={(e) => {
          const raw = e.target.value;
          const mem = members.find(
            (m) => memberPickerLabel(m) === raw || m.username === raw || m.displayName === raw
          );
          if (mem) onChange(mem.userId, memberPickerLabel(mem));
          else onChange("", raw);
        }}
        className="hb-input px-2 py-1.5 text-sm text-slate-100"
      />
      <datalist id={listId}>
        {members.map((m) => (
          <option key={m.userId} value={memberPickerLabel(m)} />
        ))}
      </datalist>
    </>
  );
}

type ExpenseProps = {
  total: number;
  roster: DiscordGuildRosterState;
  drafts: ShareChargeDraft[];
  onChange: (next: ShareChargeDraft[]) => void;
};

/** Charge portions of an expense to other people (friends or household members). */
export function BudgetExpenseShareEditor({ total, roster, drafts, onChange }: ExpenseProps) {
  const charged = chargedTotal(drafts);
  const mine = yourShare(total, charged);
  const over = charged > total + SHARE_EPS;

  function update(i: number, patch: Partial<ShareChargeDraft>) {
    onChange(drafts.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  }

  return (
    <div className="space-y-2 rounded-lg border border-slate-700 p-3">
      <p className={`text-xs ${over ? "text-rose-300" : mine < -SHARE_EPS ? "text-rose-300" : "text-slate-400"}`}>
        {total > 0
          ? over
            ? `Charges ($${formatMoney(charged)}) are more than the $${formatMoney(total)} expense.`
            : `Others $${formatMoney(charged)} · your share $${formatMoney(Math.max(0, mine))}`
          : "Enter the full amount you paid, then how much each person owes you."}
      </p>
      {drafts.map((row, i) => (
        <div key={row.key} className="grid gap-2 sm:grid-cols-[1fr_7rem_auto]">
          <SharePersonField
            roster={roster}
            label={row.owedByLabel}
            onChange={(userId, owedByLabel) => update(i, { owedByUserId: userId, owedByLabel })}
          />
          <input
            inputMode="decimal"
            placeholder="Amount"
            value={row.amount}
            onChange={(e) => update(i, { amount: e.target.value })}
            className="hb-input px-2 py-1.5 text-sm text-slate-100"
          />
          <button
            type="button"
            onClick={() => onChange(drafts.filter((_, j) => j !== i).concat(drafts.length === 1 ? [emptyShareChargeDraft()] : []))}
            className="text-xs text-slate-500 hover:text-rose-300"
          >
            Remove
          </button>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onChange([...drafts, emptyShareChargeDraft()])}
          className="text-xs text-blue-300 hover:text-blue-100"
        >
          + Person
        </button>
        <button
          type="button"
          onClick={() => onChange(splitRemainingEqually(total, drafts))}
          className="text-xs text-slate-400 hover:text-slate-200"
        >
          Split equally (including you)
        </button>
      </div>
    </div>
  );
}

type ReimburseProps = {
  token: string;
  incomeAmount: number;
  existingPayments?: BudgetSharePaymentLine[];
  drafts: SharePaymentDraft[];
  onChange: (next: SharePaymentDraft[]) => void;
};

/** Apply incoming money against open share charges. */
export function BudgetReimbursementEditor({
  token,
  incomeAmount,
  existingPayments = [],
  drafts,
  onChange,
}: ReimburseProps) {
  const [charges, setCharges] = useState<BudgetShareChargeLine[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    getBudgetShares(token)
      .then((ov) => {
        if (ac.signal.aborted) return;
        setCharges(ov.open);
        setError(null);
      })
      .catch((e: unknown) => {
        if (ac.signal.aborted) return;
        setError(e instanceof Error ? e.message : String(e));
      });
    return () => ac.abort();
  }, [token]);

  const rows = useMemo(() => {
    const byId = new Map<number, { label: string; merchant: string | null; date: string | null; max: number }>();
    for (const c of charges) {
      const existing = existingPayments.find((p) => p.chargeId === c.id)?.amount ?? 0;
      byId.set(c.id, {
        label: c.owedByLabel,
        merchant: c.merchant,
        date: c.expenseDate,
        max: c.remaining + existing,
      });
    }
    for (const p of existingPayments) {
      if (byId.has(p.chargeId)) continue;
      byId.set(p.chargeId, {
        label: p.owedByLabel,
        merchant: p.merchant,
        date: p.expenseDate,
        max: p.amount,
      });
    }
    return [...byId.entries()].map(([chargeId, meta]) => ({ chargeId, ...meta }));
  }, [charges, existingPayments]);

  const applied = drafts.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);

  function amountFor(chargeId: number): string {
    return drafts.find((d) => d.chargeId === chargeId)?.amount ?? "";
  }

  function setAmount(chargeId: number, amount: string) {
    const rest = drafts.filter((d) => d.chargeId !== chargeId);
    onChange(amount.trim() ? [...rest, { chargeId, amount }] : rest);
  }

  if (error) return <p className="text-xs text-rose-300">{error}</p>;
  if (rows.length === 0) {
    return (
      <p className="text-xs text-slate-500">
        Nothing is waiting to be paid back. Charge others on an expense first.
      </p>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-slate-700 p-3">
      <p className={`text-xs ${applied > incomeAmount + SHARE_EPS ? "text-rose-300" : "text-slate-400"}`}>
        Applying ${formatMoney(applied)} of ${formatMoney(incomeAmount || 0)}
      </p>
      {rows.map((row) => (
        <label key={row.chargeId} className="flex items-start gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            className="mt-1"
            checked={(Number(amountFor(row.chargeId)) || 0) > SHARE_EPS}
            onChange={(e) => {
              if (!e.target.checked) {
                setAmount(row.chargeId, "");
                return;
              }
              const leftover = Math.max(0, (incomeAmount || 0) - applied);
              const fill = Math.min(row.max, leftover || row.max);
              setAmount(row.chargeId, fill > SHARE_EPS ? fill.toFixed(2) : row.max.toFixed(2));
            }}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-slate-200">{row.label}</span>
            <span className="block text-[11px] text-slate-500">
              {[row.merchant, row.date?.slice(0, 10), `up to $${formatMoney(row.max)}`].filter(Boolean).join(" · ")}
            </span>
          </span>
          <input
            inputMode="decimal"
            value={amountFor(row.chargeId)}
            onChange={(e) => setAmount(row.chargeId, e.target.value)}
            placeholder="0.00"
            className="hb-input w-20 px-2 py-1 text-sm text-slate-100"
          />
        </label>
      ))}
    </div>
  );
}
