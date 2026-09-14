import { useState, type ReactNode } from "react";
import { patchBudgetShareStatus, type BudgetShareChargeLine, type BudgetSharesOverview } from "../../api";
import { formatMoney } from "../../lib/budgetMoney";

type Props = {
  overview: BudgetSharesOverview | null;
  token: string;
  actor: string;
  onChanged: () => Promise<void> | void;
};

function chargeTitle(merchant: string | null, date: string | null): string {
  const day = date?.slice(0, 10);
  return [merchant?.trim() || "Expense", day].filter(Boolean).join(" · ");
}

function unpaid(c: BudgetShareChargeLine): number {
  return Math.max(0, c.amount - c.paidAmount);
}

/** Full split history: waiting, paid back / marked reimbursed, and not collecting. */
export default function BudgetSharesPanel({ overview, token, actor, onChanged }: Props) {
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const open = overview?.open ?? [];
  const reimbursed = overview?.reimbursed ?? [];
  const ignored = overview?.ignored ?? [];
  const empty = open.length === 0 && reimbursed.length === 0 && ignored.length === 0;

  async function setStatus(id: number, status: "open" | "ignored" | "reimbursed") {
    if (!actor) return;
    setBusyId(id);
    setError(null);
    try {
      await patchBudgetShareStatus(token, actor, id, status);
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section id="budget-shares-panel" className="hb-card p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-lg font-medium text-white">Split history</h2>
          <p className="mt-0.5 text-xs text-slate-500">Everyone you charged — waiting, paid back, or not collecting.</p>
        </div>
        {open.length > 0 && overview && (
          <p className="text-sm text-amber-200">
            ${formatMoney(overview.outstandingTotal)}
            {overview.outstandingPeopleCount > 0
              ? ` from ${overview.outstandingPeopleCount} ${overview.outstandingPeopleCount === 1 ? "person" : "people"}`
              : ""}
          </p>
        )}
      </div>
      {error && <p className="mb-2 text-sm text-rose-300">{error}</p>}
      {!overview ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : empty ? (
        <p className="text-sm text-slate-400">
          No splits yet. On an expense, check “Others owe me part of this” to charge someone.
        </p>
      ) : (
        <>
          <ChargeSection title="Waiting to be paid back" emptyLabel="You're not waiting on anyone right now." items={open}>
            {(c) => (
              <ChargeRow
                charge={c}
                amountLabel={`$${formatMoney(c.remaining)}`}
                hint={
                  c.paidAmount > 0.005
                    ? `$${formatMoney(c.paidAmount)} of $${formatMoney(c.amount)} received`
                    : undefined
                }
                busy={busyId === c.id}
                actor={actor}
                actions={[
                  { label: "Mark reimbursed", onClick: () => void setStatus(c.id, "reimbursed") },
                  { label: "Ignore", onClick: () => void setStatus(c.id, "ignored") },
                ]}
              />
            )}
          </ChargeSection>
          {open.length > 0 && actor ? (
            <p className="mb-4 text-[11px] leading-snug text-slate-500">
              Mark reimbursed does not add money to an account. Use it when you already got paid back (or you are not
              chasing it) without logging a deposit. If the money just arrived, add income and check “This is a
              reimbursement.”
            </p>
          ) : null}
          <ChargeSection title="Paid back" emptyLabel={null} items={reimbursed}>
            {(c) => (
              <ChargeRow
                charge={c}
                amountLabel={`$${formatMoney(c.amount)}`}
                hint={
                  c.paidAmount > 0.005
                    ? `$${formatMoney(c.paidAmount)} received`
                    : `Marked reimbursed · $${formatMoney(unpaid(c))} not deposited`
                }
                busy={busyId === c.id}
                actor={actor}
                actions={
                  unpaid(c) > 0.005
                    ? [{ label: "Restore", onClick: () => void setStatus(c.id, "open") }]
                    : []
                }
              />
            )}
          </ChargeSection>
          <ChargeSection title="Not collecting" emptyLabel={null} items={ignored}>
            {(c) => (
              <ChargeRow
                charge={c}
                amountLabel={`$${formatMoney(unpaid(c))}`}
                busy={busyId === c.id}
                actor={actor}
                actions={[{ label: "Restore", onClick: () => void setStatus(c.id, "open") }]}
              />
            )}
          </ChargeSection>
        </>
      )}
    </section>
  );
}

function ChargeSection({
  title,
  emptyLabel,
  items,
  children,
}: {
  title: string;
  emptyLabel: string | null;
  items: BudgetShareChargeLine[];
  children: (c: BudgetShareChargeLine) => ReactNode;
}) {
  if (items.length === 0 && !emptyLabel) return null;
  return (
    <div className="mb-4 last:mb-0">
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-slate-400">{emptyLabel}</p>
      ) : (
        <ul className="space-y-2">{items.map((c) => children(c))}</ul>
      )}
    </div>
  );
}

function ChargeRow({
  charge,
  amountLabel,
  hint,
  busy,
  actor,
  actions,
}: {
  charge: BudgetShareChargeLine;
  amountLabel: string;
  hint?: string;
  busy: boolean;
  actor: string;
  actions: { label: string; onClick: () => void }[];
}) {
  return (
    <li className="flex items-start justify-between gap-3 rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm text-slate-200">
          {charge.owedByLabel} · {amountLabel}
        </p>
        <p className="truncate text-[11px] text-slate-500">{chargeTitle(charge.merchant, charge.expenseDate)}</p>
        {hint ? <p className="text-[11px] text-slate-600">{hint}</p> : null}
      </div>
      {actor && actions.length > 0 ? (
        <div className="flex shrink-0 flex-col items-end gap-1">
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              disabled={busy}
              onClick={a.onClick}
              className="text-xs text-slate-400 hover:text-white disabled:opacity-50"
            >
              {busy ? "…" : a.label}
            </button>
          ))}
        </div>
      ) : null}
    </li>
  );
}
