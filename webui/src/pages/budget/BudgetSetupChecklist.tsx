import type { BudgetAccount, BudgetCategory, BudgetIncomePlan } from "../../api";

export type SetupStep = {
  key: string;
  label: string;
  hint: string;
  done: boolean;
  actionLabel: string;
  onAction: () => void;
};

type Props = {
  categories: BudgetCategory[];
  accounts: BudgetAccount[];
  incomePlan: BudgetIncomePlan | null;
  hasTransactions: boolean;
  onAddCategories: () => void;
  onEditPlan: () => void;
  onAddAccount: () => void;
  onAddTransaction: () => void;
};

/**
 * First-run checklist shown when the budget is (nearly) empty.
 * Disappears once the household has at least a category and one transaction.
 */
export default function BudgetSetupChecklist({
  categories,
  accounts,
  incomePlan,
  hasTransactions,
  onAddCategories,
  onEditPlan,
  onAddAccount,
  onAddTransaction,
}: Props) {
  const steps: SetupStep[] = [
    {
      key: "categories",
      label: "Create starter categories",
      hint: "Groceries, Rent, Utilities… — where money goes.",
      done: categories.length > 0,
      actionLabel: "Add categories",
      onAction: onAddCategories,
    },
    {
      key: "income",
      label: "Set this month's income plan",
      hint: "How much money you expect to work with this month.",
      done: incomePlan != null && incomePlan.plannedAmount > 0,
      actionLabel: "Set income",
      onAction: onEditPlan,
    },
    {
      key: "account",
      label: "Add an account",
      hint: "Your checking or savings, so balances stay in sync.",
      done: accounts.length > 0,
      actionLabel: "Add account",
      onAction: onAddAccount,
    },
    {
      key: "transaction",
      label: "Log your first expense",
      hint: "Anything counts — coffee is a classic.",
      done: hasTransactions,
      actionLabel: "Add expense",
      onAction: onAddTransaction,
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null;

  return (
    <section className="hb-card border-blue-800/40 p-5">
      <h2 className="text-lg font-medium text-white">Let's set up your budget</h2>
      <p className="mt-1 text-sm text-slate-400">
        Four quick steps — {doneCount} of {steps.length} done.
      </p>
      <ol className="mt-4 space-y-3">
        {steps.map((s, i) => (
          <li key={s.key} className="flex items-start gap-3">
            <span
              className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                s.done ? "bg-emerald-950/70 text-emerald-300" : "border border-slate-600 text-slate-400"
              }`}
            >
              {s.done ? "✓" : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className={`text-sm ${s.done ? "text-slate-500 line-through" : "text-slate-200"}`}>{s.label}</p>
              {!s.done && <p className="text-xs text-slate-500">{s.hint}</p>}
            </div>
            {!s.done && (
              <button
                type="button"
                onClick={s.onAction}
                className="shrink-0 rounded-lg border border-blue-700/60 bg-blue-950/40 px-2.5 py-1 text-xs text-blue-100 hover:bg-blue-950/70"
              >
                {s.actionLabel}
              </button>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
