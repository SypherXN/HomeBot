import { useState } from "react";
import { putBudgetExchangeRate, type BudgetExchangeRate } from "../../api";

const HOME = "USD";

type Props = {
  token: string;
  actor: string;
  rates: BudgetExchangeRate[];
  onSaved: () => Promise<void>;
};

export default function BudgetCurrencyPanel({ token, actor, rates, onSaved }: Props) {
  const [from, setFrom] = useState("EUR");
  const [rate, setRate] = useState("1.08");
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10));

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <h2 className="mb-2 text-lg font-medium text-white">Multi-currency</h2>
      <p className="mb-3 text-xs text-slate-500">
        Home reporting currency is {HOME}. Set exchange rates for foreign transactions; rates apply on
        new entries when currency ≠ {HOME}.
      </p>

      {rates.length > 0 ? (
        <ul className="mb-4 max-h-32 space-y-1 overflow-y-auto text-sm text-slate-400">
          {rates.slice(0, 15).map((r) => (
            <li key={r.id}>
              1 {r.fromCurrency} = {r.rate} {r.toCurrency} ({r.effectiveDate})
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-4 text-sm text-slate-500">No custom rates stored; foreign amounts use 1:1 until set.</p>
      )}

      {actor && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            await putBudgetExchangeRate(token, actor, {
              fromCurrency: from.toUpperCase(),
              toCurrency: HOME,
              rate: Number(rate) || 1,
              effectiveDate,
            });
            await onSaved();
          }}
        >
          <label className="text-xs text-slate-400">
            1{" "}
            <input
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-14 rounded border border-slate-600 bg-slate-950 px-1 py-0.5 uppercase text-slate-100"
            />{" "}
            =
            <input
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              className="mx-1 w-16 rounded border border-slate-600 bg-slate-950 px-1 py-0.5 text-slate-100"
            />
            {HOME}
          </label>
          <input
            type="date"
            value={effectiveDate}
            onChange={(e) => setEffectiveDate(e.target.value)}
            className="rounded border border-slate-600 bg-slate-950 px-2 py-1 text-sm text-slate-100"
          />
          <button type="submit" className="rounded bg-slate-700 px-3 py-1 text-sm text-white">
            Save rate
          </button>
        </form>
      )}
    </section>
  );
}
