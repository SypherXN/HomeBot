import type { BudgetForecastCategory, BudgetNotificationItem } from "../../api";
import { titleCase } from "../../lib/titleCase";

function formatMoney(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Props = {
  forecast: BudgetForecastCategory[];
  notifications: BudgetNotificationItem[];
  onDismiss?: (key: string) => void;
  dismissBusyKey?: string | null;
};

export default function BudgetAlertsPanel({ forecast, notifications, onDismiss, dismissBusyKey }: Props) {
  const paceWarnings = forecast.filter(
    (f) => f.envelopeTarget != null && f.envelopeTarget > 0 && f.projectedMonthEnd > f.envelopeTarget
  );

  if (paceWarnings.length === 0 && notifications.length === 0) {
    return (
      <section className="hb-card p-4">
        <h2 className="text-lg font-medium text-white">Forecast & alerts</h2>
        <p className="mt-2 text-sm text-slate-500">Nothing needs attention right now.</p>
      </section>
    );
  }

  return (
    <section className="hb-card p-4">
      <h2 className="mb-3 text-lg font-medium text-white">Forecast & alerts</h2>

      {paceWarnings.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">At this rate</h3>
          <ul className="space-y-2">
            {paceWarnings.map((f) => (
              <li
                key={f.categoryId}
                className="rounded-lg border border-amber-800/40 bg-amber-950/20 px-3 py-2 text-sm text-amber-100"
              >
                <strong>{titleCase(f.categoryName)}</strong> is on track for ${formatMoney(f.projectedMonthEnd)} this month —
                over the ${formatMoney(f.envelopeTarget!)} limit (${formatMoney(f.monthToDate)} so far).
              </li>
            ))}
          </ul>
        </div>
      )}

      {notifications.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Active alerts</h3>
          <ul className="space-y-2">
            {notifications.map((n) => (
              <li
                key={n.key || `${n.kind}-${n.message}`}
                className="flex items-start justify-between gap-3 rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-sm text-slate-300"
              >
                <span>{n.message}</span>
                {onDismiss && n.key ? (
                  <button
                    type="button"
                    disabled={dismissBusyKey === n.key}
                    onClick={() => onDismiss(n.key)}
                    className="shrink-0 text-xs text-slate-400 hover:text-white disabled:opacity-50"
                  >
                    {dismissBusyKey === n.key ? "…" : "Dismiss"}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
