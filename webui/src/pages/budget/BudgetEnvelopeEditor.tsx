import { useState } from "react";
import { getBudgetEnvelopes, putBudgetEnvelope, type BudgetCategory, type BudgetEnvelope } from "../../api";
import { categoryDotStyle, formatMoney } from "../../lib/budgetMoney";

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
 * Envelope board: one card per category with progress, remaining, target editing,
 * and quick actions (log spend / view spending).
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
  const [saving, setSaving] = useState(false);
  const [copyBusy, setCopyBusy] = useState(false);
  const [applyBusy, setApplyBusy] = useState(false);

  const householdCats = categories.filter((c) => c.visibility !== "personal");
  const dirtyCount = Object.keys(drafts).length;

  async function saveAll(e: React.FormEvent) {
    e.preventDefault();
    if (!actor) return;
    setSaving(true);
    try {
      for (const cat of householdCats) {
        const raw = drafts[cat.id];
        if (raw === undefined || raw.trim() === "") continue;
        await putBudgetEnvelope(token, actor, {
          month,
          categoryId: cat.id,
          targetAmount: Number(raw) || 0,
        });
      }
      setDrafts({});
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
      <ul className="grid gap-3 md:grid-cols-2">
        {householdCats.map((cat) => {
          const env = envByCat.get(cat.id);
          const pct = env?.percentUsed ?? 0;
          const bar = Math.min(100, pct);
          const targetVal = drafts[cat.id] ?? (env ? String(env.targetAmount) : "");
          const remaining = env ? env.remaining : null;
          return (
            <li key={cat.id} className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={categoryDotStyle(cat.color)} aria-hidden />
                  <span className="truncate font-medium text-slate-200">{cat.name}</span>
                </span>
                <span className={`text-xs ${remaining != null && remaining < 0 ? "text-red-300" : "text-slate-500"}`}>
                  {env
                    ? remaining != null && remaining < 0
                      ? `$${formatMoney(Math.abs(remaining))} over`
                      : `$${formatMoney(remaining ?? 0)} left`
                    : "no target"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => onViewSpending?.(cat.id)}
                className="mb-2 block w-full text-left"
                title={onViewSpending ? `View ${cat.name} spending in Ledger` : cat.name}
              >
                <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className={`h-full ${pct >= 100 ? "bg-red-500" : pct >= 85 ? "bg-amber-500" : "bg-emerald-600"}`}
                    style={{ width: `${bar}%` }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  Spent ${formatMoney(env?.actualAmount ?? 0)}
                  {env ? ` of $${formatMoney(env.targetAmount)} (${pct.toFixed(0)}%)` : ""}
                </p>
              </button>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-xs text-slate-400">
                  Target $
                  <input
                    value={targetVal}
                    onChange={(e) => setDrafts((d) => ({ ...d, [cat.id]: e.target.value }))}
                    className="w-24 hb-input px-2 py-1 text-sm text-slate-100"
                  />
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
