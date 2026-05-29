import { useState } from "react";
import { getBudgetEnvelopes, putBudgetEnvelope, type BudgetCategory, type BudgetEnvelope } from "../../api";

function priorMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatMoney(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Props = {
  token: string;
  actor: string;
  month: string;
  categories: BudgetCategory[];
  envelopes: BudgetEnvelope[];
  onSaved: () => Promise<void>;
};

export default function BudgetEnvelopeEditor({ token, actor, month, categories, envelopes, onSaved }: Props) {
  const envByCat = new Map(envelopes.map((e) => [e.categoryId, e]));
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const [copyBusy, setCopyBusy] = useState(false);

  const householdCats = categories.filter((c) => c.visibility !== "personal");

  async function saveAll(e: React.FormEvent) {
    e.preventDefault();
    if (!actor) return;
    setSaving(true);
    try {
      for (const cat of householdCats) {
        const raw = drafts[cat.id] ?? String(envByCat.get(cat.id)?.targetAmount ?? "");
        if (raw.trim() === "") continue;
        await putBudgetEnvelope(token, actor, {
          month,
          categoryId: cat.id,
          targetAmount: Number(raw) || 0,
        });
      }
      await onSaved();
    } finally {
      setSaving(false);
    }
  }

  if (householdCats.length === 0) {
    return <p className="text-sm text-slate-500">Add household categories first.</p>;
  }

  async function copyFromPreviousMonth() {
    if (!actor) return;
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

  return (
    <form onSubmit={(e) => void saveAll(e)} className="space-y-3">
      {actor && (
        <button
          type="button"
          disabled={copyBusy}
          onClick={() => void copyFromPreviousMonth()}
          className="rounded border border-slate-600 bg-slate-800 px-3 py-1 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-50"
        >
          {copyBusy ? "Loading…" : `Copy targets from ${priorMonth(month)}`}
        </button>
      )}
      {householdCats.map((cat) => {
        const env = envByCat.get(cat.id);
        const pct = env?.percentUsed ?? 0;
        const bar = Math.min(100, pct);
        const targetVal = drafts[cat.id] ?? (env ? String(env.targetAmount) : "");
        return (
          <div key={cat.id} className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-slate-200">{cat.name}</span>
              <span className="text-xs text-slate-500">
                Spent ${formatMoney(env?.actualAmount ?? 0)}
                {env ? ` / $${formatMoney(env.targetAmount)}` : ""}
              </span>
            </div>
            <div className="mb-2 h-2 overflow-hidden rounded-full bg-slate-800">
              <div
                className={`h-full ${pct >= 100 ? "bg-red-500" : pct >= 85 ? "bg-amber-500" : "bg-emerald-600"}`}
                style={{ width: `${bar}%` }}
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-400">
              Monthly target $
              <input
                value={targetVal}
                onChange={(e) => setDrafts((d) => ({ ...d, [cat.id]: e.target.value }))}
                className="w-24 rounded border border-slate-600 bg-slate-900 px-2 py-1 text-sm text-slate-100"
              />
            </label>
          </div>
        );
      })}
      <button
        type="submit"
        disabled={saving || !actor}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save envelope targets"}
      </button>
    </form>
  );
}
