import { useState } from "react";
import { getBudgetEnvelopes, putBudgetEnvelope, type BudgetCategory, type BudgetEnvelope } from "../../api";
import { MONEY_TEXT, categoryDotStyle, formatMoney } from "../../lib/budgetMoney";
import PaceBar from "./PaceBar";
import { monthTimePct, paceState } from "./budgetPace";

function priorMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

type Props = {
  token: string;
  actor: string;
  month: string;
  categories: BudgetCategory[];
  envelopes: BudgetEnvelope[];
  onSaved: () => Promise<void>;
  /** Opens quick-add prefilled with this category (Plan home board action). */
  onLogSpend?: (categoryId: number, categoryName: string) => void;
  /** Jump to the Ledger filtered to this category. */
  onViewSpending?: (categoryId: number) => void;
};

/**
 * Envelope board: one card per category with pacing progress, remaining, target editing,
 * and quick actions (log spend / view spending). Sorts by pacing risk (over → warn → rest).
 */
export default function BudgetEnvelopeEditor({
  token,
  actor,
  month,
  categories,
  envelopes,
  onSaved,
  onLogSpend,
  onViewSpending,
}: Props) {
  const envByCat = new Map(envelopes.map((e) => [e.categoryId, e]));
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [leaveDrafts, setLeaveDrafts] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const [copyBusy, setCopyBusy] = useState(false);
  const [applyBusy, setApplyBusy] = useState(false);

  const householdCats = categories.filter((c) => c.visibility !== "personal");
  const dirtyCount = Object.keys(drafts).length + Object.keys(leaveDrafts).length;
  const timePct = monthTimePct(month);

  const rank: Record<string, number> = { over: 0, warn: 1, pace: 2, under: 3, none: 4 };
  const sortedCats = [...householdCats].sort((a, b) => {
    const ea = envByCat.get(a.id);
    const eb = envByCat.get(b.id);
    const sa = paceState(ea?.percentUsed ?? 0, timePct, ea != null && ea.targetAmount > 0);
    const sb = paceState(eb?.percentUsed ?? 0, timePct, eb != null && eb.targetAmount > 0);
    if (rank[sa] !== rank[sb]) return rank[sa] - rank[sb];
    return (eb?.actualAmount ?? 0) - (ea?.actualAmount ?? 0);
  });

  async function saveAll(e: React.FormEvent) {
    e.preventDefault();
    if (!actor) return;
    setSaving(true);
    try {
      const touched = new Set([...Object.keys(drafts), ...Object.keys(leaveDrafts)].map(Number));
      for (const catId of touched) {
        const cat = householdCats.find((c) => c.id === catId);
        if (!cat) continue;
        const env = envByCat.get(catId);
        const rawTarget = drafts[catId];
        const rawLeave = leaveDrafts[catId];
        const targetAmount =
          rawTarget !== undefined && rawTarget.trim() !== ""
            ? Number(rawTarget) || 0
            : (env?.targetAmount ?? 0);
        const leaveAmount =
          rawLeave !== undefined && rawLeave.trim() !== ""
            ? Number(rawLeave) || 0
            : env?.leaveAmount;
        await putBudgetEnvelope(token, actor, {
          month,
          categoryId: catId,
          targetAmount,
          leaveAmount: leaveAmount && leaveAmount > 0 ? leaveAmount : undefined,
        });
      }
      setDrafts({});
      setLeaveDrafts({});
      await onSaved();
    } finally {
      setSaving(false);
    }
  }

  async function copyFromPreviousMonth() {
    const prev = priorMonth(month);
    setCopyBusy(true);
    try {
      const prevEnvs = await getBudgetEnvelopes(token, prev);
      const nextDrafts: Record<number, string> = { ...drafts };
      for (const e of prevEnvs) {
        if (e.targetAmount > 0) nextDrafts[e.categoryId] = String(e.targetAmount);
      }
      setDrafts(nextDrafts);
    } finally {
      setCopyBusy(false);
    }
  }

  async function applyPreviousMonthToThisMonth() {
    if (!actor) return;
    const prev = priorMonth(month);
    setApplyBusy(true);
    try {
      const prevEnvs = await getBudgetEnvelopes(token, prev);
      for (const e of prevEnvs) {
        if (e.targetAmount > 0) {
          await putBudgetEnvelope(token, actor, {
            month,
            categoryId: e.categoryId,
            targetAmount: e.targetAmount,
          });
        }
      }
      await onSaved();
    } finally {
      setApplyBusy(false);
    }
  }

  if (householdCats.length === 0) {
    return <p className="text-sm text-slate-500">Add household categories first (Accounts & categories tab).</p>;
  }

  return (
    <form onSubmit={(e) => void saveAll(e)} className="space-y-3">
      {actor && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={copyBusy}
            onClick={() => void copyFromPreviousMonth()}
            className="rounded hb-btn-soft px-3 py-1 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-50"
          >
            {copyBusy ? "Loading…" : `Copy ${priorMonth(month)} into form`}
          </button>
          <button
            type="button"
            disabled={applyBusy}
            onClick={() => void applyPreviousMonthToThisMonth()}
            className="rounded border border-blue-700/60 bg-blue-950/40 px-3 py-1 text-xs text-blue-100 hover:bg-blue-950/70 disabled:opacity-50"
          >
            {applyBusy ? "Applying…" : `Reuse ${priorMonth(month)} targets`}
          </button>
          {dirtyCount > 0 && (
            <span className="text-xs text-amber-300">{dirtyCount} unsaved change{dirtyCount === 1 ? "" : "s"}</span>
          )}
        </div>
      )}
      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {sortedCats.map((cat) => {
          const env = envByCat.get(cat.id);
          const hasTarget = env != null && env.targetAmount > 0;
          const pct = env?.percentUsed ?? 0;
          const targetVal = drafts[cat.id] ?? (env ? String(env.targetAmount) : "");
          const leaveVal = leaveDrafts[cat.id] ?? (env?.leaveAmount ? String(env.leaveAmount) : "");
          const remaining = env ? env.remaining : null;
          return (
            <li
              key={cat.id}
              className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 transition-colors hover:border-slate-700"
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={categoryDotStyle(cat.color)} aria-hidden />
                  <span className="truncate font-medium text-slate-200">{cat.name}</span>
                </span>
                <span
                  className={`${MONEY_TEXT} text-xs ${
                    remaining != null && remaining < 0 ? "text-rose-400" : "text-slate-500"
                  }`}
                >
                  {hasTarget
                    ? remaining != null && remaining < 0
                      ? `$${formatMoney(Math.abs(remaining))} over`
                      : `$${formatMoney(remaining ?? 0)} left`
                    : "no target"}
                </span>
              </div>

              <button
                type="button"
                onClick={() => onViewSpending?.(cat.id)}
                className="mb-1 block w-full text-left"
                title={onViewSpending ? `View ${cat.name} spending in Ledger` : cat.name}
              >
                <PaceBar spentPct={pct} timePct={timePct} hasTarget={hasTarget} />
                <p className={`mt-1 text-[11px] ${MONEY_TEXT} text-slate-500`}>
                  ${formatMoney(env?.actualAmount ?? 0)}
                  {hasTarget ? ` of $${formatMoney(env.targetAmount)}` : " spent"}
                  {hasTarget && env?.leaveAmount != null && env.leaveAmount > 0 && remaining != null && (
                    <span className="ml-1 text-cyan-400/80">
                      · aim leave ${formatMoney(env.leaveAmount)}
                      {remaining < env.leaveAmount ? " (below)" : ""}
                    </span>
                  )}
                </p>
              </button>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-slate-400">
                  Target
                  <span className={`inline-flex items-center gap-0.5 rounded hb-input px-1.5 py-0.5 ${MONEY_TEXT}`}>
                    <span className="text-slate-500">$</span>
                    <input
                      value={targetVal}
                      onChange={(e) => setDrafts((d) => ({ ...d, [cat.id]: e.target.value }))}
                      inputMode="decimal"
                      className="w-20 bg-transparent text-sm text-slate-100 outline-none"
                    />
                  </span>
                </label>
                <label
                  className="flex items-center gap-1.5 text-xs text-slate-400"
                  title="Soft aim — try to leave at least this much unspent"
                >
                  Leave
                  <span className={`inline-flex items-center gap-0.5 rounded hb-input px-1.5 py-0.5 ${MONEY_TEXT}`}>
                    <span className="text-slate-500">$</span>
                    <input
                      value={leaveVal}
                      onChange={(e) => setLeaveDrafts((d) => ({ ...d, [cat.id]: e.target.value }))}
                      placeholder="0"
                      inputMode="decimal"
                      className="w-16 bg-transparent text-sm text-slate-100 outline-none"
                    />
                  </span>
                </label>
                {onLogSpend && (
                  <button
                    type="button"
                    onClick={() => onLogSpend(cat.id, cat.name)}
                    className="ml-auto rounded border border-blue-700/60 bg-blue-950/40 px-2.5 py-1 text-xs text-blue-100 hover:bg-blue-950/70"
                  >
                    Log spend
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {dirtyCount > 0 && actor && (
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-2 text-sm font-medium text-white hover:from-blue-500 hover:to-blue-600 disabled:opacity-50"
        >
          {saving ? "Saving…" : `Save ${dirtyCount} target${dirtyCount === 1 ? "" : "s"}`}
        </button>
      )}
    </form>
  );
}
