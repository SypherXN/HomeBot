import { formatMoney } from "../../lib/budgetMoney";

type Stat = {
  label: string;
  value: string;
  tone?: "default" | "good" | "warn" | "bad";
};

type Props = {
  leftToBudget: number | null;
  net: number;
  billsDueCount: number;
  alertCount: number;
};

/** Dashboard-style stat strip for the top of Budget Overview. */
export default function BudgetStatStrip({ leftToBudget, net, billsDueCount, alertCount }: Props) {
  const stats: Stat[] = [
    {
      label: "Left to budget",
      value: leftToBudget == null ? "—" : `${leftToBudget < 0 ? "−" : ""}$${formatMoney(Math.abs(leftToBudget))}`,
      tone: leftToBudget == null ? "default" : leftToBudget < 0 ? "bad" : "good",
    },
    {
      label: "Net this month",
      value: `${net < 0 ? "−" : ""}$${formatMoney(Math.abs(net))}`,
      tone: net < 0 ? "bad" : "default",
    },
    {
      label: "Bills due (7d)",
      value: String(billsDueCount),
      tone: billsDueCount > 0 ? "warn" : "default",
    },
    {
      label: "Needs attention",
      value: String(alertCount),
      tone: alertCount > 0 ? "warn" : "good",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {stats.map((s) => (
        <div key={s.label} className="hb-stat px-4 py-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">{s.label}</p>
          <p
            className={`mt-1 text-lg font-semibold ${
              s.tone === "good"
                ? "text-emerald-400"
                : s.tone === "warn"
                  ? "text-amber-300"
                  : s.tone === "bad"
                      ? "text-red-300"
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
