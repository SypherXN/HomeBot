import { useEffect, useMemo, useRef, useState } from "react";
import type { DiscordGuildRosterState } from "../../hooks/useDiscordGuildRoster";
import { formatMoney } from "../../lib/budgetMoney";
import { guestNamesFromCharges, uniqueGuestNames } from "../../lib/sharePerson";
import {
  chargedTotal,
  emptyShareChargeDraft,
  looksEvenSplit,
  SHARE_EPS,
  splitRemainingEqually,
  yourShare,
  type ShareChargeDraft,
  type SharePaymentDraft,
} from "../../lib/budgetShares";
import { getBudgetShares, type BudgetShareChargeLine, type BudgetSharePaymentLine } from "../../api";
import SharePersonSelect from "./SharePersonSelect";

type ExpenseProps = {
  total: number;
  token: string;
  roster: DiscordGuildRosterState;
  drafts: ShareChargeDraft[];
  onChange: (next: ShareChargeDraft[]) => void;
};

/** Charge portions of an expense to other people (friends or household members). */
export function BudgetExpenseShareEditor({ total, token, roster, drafts, onChange }: ExpenseProps) {
  const charged = chargedTotal(drafts);
  const mine = yourShare(total, charged);
  const over = charged > total + SHARE_EPS;
  const [savedGuests, setSavedGuests] = useState<string[]>([]);
  const [mode, setMode] = useState<"even" | "assign">(() => (looksEvenSplit(total, drafts) ? "even" : "assign"));

  useEffect(() => {
    if (!token.trim()) return;
    const ac = new AbortController();
    getBudgetShares(token)
      .then((ov) => {
        if (ac.signal.aborted) return;
        setSavedGuests(guestNamesFromCharges([...ov.open, ...ov.ignored, ...(ov.reimbursed ?? [])]));
      })
      .catch(() => {
        if (ac.signal.aborted) return;
        setSavedGuests([]);
      });
    return () => ac.abort();
  }, [token]);

  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    if (mode !== "even") return;
    const current = draftsRef.current;
    const next = splitRemainingEqually(total, current);
    const same = current.length === next.length && current.every((d, i) => d.amount === next[i]?.amount);
    if (!same) onChangeRef.current(next);
  }, [mode, total]);

  const guests = useMemo(() => {
    const fromDrafts = drafts.filter((d) => !d.owedByUserId.trim()).map((d) => d.owedByLabel);
    return uniqueGuestNames([...savedGuests, ...fromDrafts]);
  }, [savedGuests, drafts]);

  function update(i: number, patch: Partial<ShareChargeDraft>) {
    const next = drafts.map((d, j) => (j === i ? { ...d, ...patch } : d));
    onChange(mode === "even" ? splitRemainingEqually(total, next) : next);
  }

  function setSplitMode(next: "even" | "assign") {
    setMode(next);
    if (next === "even") onChange(splitRemainingEqually(total, drafts));
  }

  return (
    <div className="space-y-2 rounded-lg border border-slate-700 p-3">
      <p className="text-xs text-slate-400">
        Type any name — they do not have to be in the household. Household members still show as suggestions.
      </p>
      <div className="flex overflow-hidden rounded-lg border border-slate-700">
        {(
          [
            ["even", "Split evenly"],
            ["assign", "Assign amounts"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setSplitMode(id)}
            className={`flex-1 px-3 py-1.5 text-xs ${
              mode === id ? "bg-slate-700 text-white" : "bg-slate-900/60 text-slate-400"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <p className={`text-xs ${over ? "text-rose-300" : mine < -SHARE_EPS ? "text-rose-300" : "text-slate-400"}`}>
        {total > 0
          ? over
            ? `Charges ($${formatMoney(charged)}) are more than the $${formatMoney(total)} expense.`
            : mode === "even"
              ? `Split ${drafts.filter((d) => d.owedByLabel.trim()).length + 1} ways including you · your share $${formatMoney(Math.max(0, mine))}`
              : `Others $${formatMoney(charged)} · your share $${formatMoney(Math.max(0, mine))}`
          : "Enter the full amount you paid, then who owes you."}
      </p>
      {drafts.map((row, i) => (
        <div key={row.key} className="grid gap-2 sm:grid-cols-[1fr_7rem_auto]">
          <SharePersonSelect
            roster={roster}
            guests={guests}
            label={row.owedByLabel}
            onChange={(userId, owedByLabel) => update(i, { owedByUserId: userId, owedByLabel })}
          />
          {mode === "assign" ? (
            <input
              inputMode="decimal"
              placeholder="Amount"
              value={row.amount}
              onChange={(e) => update(i, { amount: e.target.value })}
              className="hb-input px-2 py-1.5 text-sm text-slate-100"
            />
          ) : (
            <p className="self-center text-sm tabular-nums text-slate-300">
              {row.owedByLabel.trim() && row.amount ? `$${formatMoney(Number(row.amount) || 0)}` : "—"}
            </p>
          )}
          <button
            type="button"
            onClick={() => {
              let next = drafts.filter((_, j) => j !== i);
              if (next.length === 0) next = [emptyShareChargeDraft()];
              onChange(mode === "even" ? splitRemainingEqually(total, next) : next);
            }}
            className="text-xs text-slate-500 hover:text-rose-300"
          >
            Remove
          </button>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            const next = [...drafts, emptyShareChargeDraft()];
            onChange(mode === "even" ? splitRemainingEqually(total, next) : next);
          }}
          className="text-xs text-blue-300 hover:text-blue-100"
        >
          + Person
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
