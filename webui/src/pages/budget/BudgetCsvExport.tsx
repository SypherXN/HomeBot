import { useState } from "react";
import { downloadBudgetCsv } from "../../api";

type Props = {
  token: string;
  defaultMonth: string;
};

type Preset = "month" | "ytd" | "tax";

function lastDayOfMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${ym}-${String(last).padStart(2, "0")}`;
}

function presetRange(preset: Preset, defaultMonth: string): { from: string; to: string } {
  const year = defaultMonth.slice(0, 4);
  if (preset === "tax") {
    return { from: `${year}-01-01`, to: `${year}-12-31` };
  }
  if (preset === "ytd") {
    const today = new Date().toISOString().slice(0, 10);
    return { from: `${year}-01-01`, to: today };
  }
  return { from: `${defaultMonth}-01`, to: lastDayOfMonth(defaultMonth) };
}

export default function BudgetCsvExport({ token, defaultMonth }: Props) {
  const [preset, setPreset] = useState<Preset>("month");
  const initial = presetRange("month", defaultMonth);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function applyPreset(p: Preset) {
    setPreset(p);
    const range = presetRange(p, defaultMonth);
    setFrom(range.from);
    setTo(range.to);
  }

  async function handleExport() {
    setBusy(true);
    setError(null);
    try {
      const csv = await downloadBudgetCsv(token, from, to);
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `budget-${from}_to_${to}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-700 p-3">
      <h3 className="mb-2 text-sm font-medium text-slate-200">Export CSV</h3>
      <div className="mb-2 flex flex-wrap gap-2">
        {(
          [
            ["month", "This month"],
            ["ytd", "YTD"],
            ["tax", "Tax year"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => applyPreset(id)}
            className={`rounded-full px-3 py-1 text-xs ${
              preset === id
                ? "bg-gradient-to-r from-blue-600 to-blue-700 text-white"
                : "bg-slate-800 text-slate-400 hover:text-slate-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mb-2 grid gap-2 sm:grid-cols-2">
        <label className="block text-xs text-slate-400">
          From
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setPreset("month");
              setFrom(e.target.value);
            }}
            className="mt-1 w-full hb-input px-2 py-1 text-sm text-slate-100"
          />
        </label>
        <label className="block text-xs text-slate-400">
          To
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setPreset("month");
              setTo(e.target.value);
            }}
            className="mt-1 w-full hb-input px-2 py-1 text-sm text-slate-100"
          />
        </label>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => void handleExport()}
        className="rounded-lg bg-slate-700 px-4 py-2 text-sm text-white hover:bg-slate-600 disabled:opacity-50"
      >
        {busy ? "Exporting…" : "Download CSV"}
      </button>
      {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
    </div>
  );
}
