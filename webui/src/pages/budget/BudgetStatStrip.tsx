import { MONEY_TEXT, formatMoney } from "../../lib/budgetMoney";

type Stat = {
  label: string;
  value: string;
  tone?: "default" | "good" | "warn" | "bad";
};

type Props = {
  leftToBudget: number | null;
  billsDueCount: number;
  alertCount: number;
  daysLeft: number;
  spentPct: number;
};

/** YNAB/Monarch-style summary bar: budgeted, spent, left, and days remaining. */
export default function BudgetStatStrip({ leftToBudget, billsDueCount, alertCount, daysLeft, spentPct }: Props) {
  const stats: Stat[] = [
    {
      label: "Left to budget",
      value: leftToBudget == null ? "—" : `${leftToBudget < 0 ? "−" : ""}$${formatMoney(Math.abs(leftToBudget))}`,
      tone: leftToBudget == null ? "default" : leftToBudget < 0 ? "bad" : "good",
    },
    {
      label: "Spent (this month)",
      value: `${spentPct.toFixed(0)}%`,
      tone: spentPct > 100 ? "bad" : spentPct > 80 ? "warn" : "default",
    },
    {
      label: "Bills due (7d)",
      value: String(billsDueCount),
      tone: billsDueCount > 0 ? "warn" : "default",
    },
    {
      label: "Days left",
      value: String(daysLeft),
      tone: daysLeft <= 5 && alertCount > 0 ? "warn" : "default",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {stats.map((s) => (
        <div key={s.label} className="hb-stat px-4 py-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">{s.label}</p>
          <p
            className={`mt-1 text-lg font-semibold ${MONEY_TEXT} ${
              s.tone === "good"
                ? "text-emerald-400"
                : s.tone === "warn"
                  ? "text-amber-400"
                  : s.tone === "bad"
                      ? "text-rose-400"
                      : "text-white"
            }`}
          >
            {s.value}
          </p>
        </div>
      ))}
    </div>
  );
}
