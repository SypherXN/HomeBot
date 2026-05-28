import type { BudgetForecastCategory, BudgetNotificationItem } from "../../api";

function formatMoney(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Props = {
  forecast: BudgetForecastCategory[];
  notifications: BudgetNotificationItem[];
};

export default function BudgetAlertsPanel({ forecast, notifications }: Props) {
  const paceWarnings = forecast.filter(
    (f) => f.envelopeTarget != null && f.envelopeTarget > 0 && f.projectedMonthEnd > f.envelopeTarget
  );

  if (paceWarnings.length === 0 && notifications.length === 0) {
    return (
      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <h2 className="text-lg font-medium text-white">Forecast & alerts</h2>
        <p className="mt-2 text-sm text-slate-500">No pace warnings or pending alerts right now.</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <h2 className="mb-3 text-lg font-medium text-white">Forecast & alerts</h2>

      {paceWarnings.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Pace forecast</h3>
          <ul className="space-y-2">
            {paceWarnings.map((f) => (
              <li
                key={f.categoryId}
                className="rounded-lg border border-amber-800/40 bg-amber-950/20 px-3 py-2 text-sm text-amber-100"
              >
                <strong>{f.categoryName}</strong>: on track for ${formatMoney(f.projectedMonthEnd)} this month
                (budget ${formatMoney(f.envelopeTarget!)}, MTD ${formatMoney(f.monthToDate)})
              </li>
            ))}
          </ul>
        </div>
      )}

      {notifications.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            Active alerts (also sent to Discord when configured)
          </h3>
          <ul className="space-y-2">
            {notifications.map((n, i) => (
              <li
                key={`${n.kind}-${i}`}
                className="rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-sm text-slate-300"
              >
                {n.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
