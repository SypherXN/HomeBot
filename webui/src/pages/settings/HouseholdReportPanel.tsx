import { useCallback, useEffect, useState } from "react";
import { getHouseholdReport, type HouseholdReport } from "../../api";

type Props = {
  token: string;
};

export default function HouseholdReportPanel({ token }: Props) {
  const tok = token.trim();
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [report, setReport] = useState<HouseholdReport | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!tok) return;
    setBusy(true);
    setErr(null);
    try {
      setReport(await getHouseholdReport(tok, month));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setReport(null);
    } finally {
      setBusy(false);
    }
  }, [tok, month]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!tok) {
    return <p className="text-sm text-slate-500">Sign in to view the household report.</p>;
  }

  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="report-month" className="text-slate-400">
          Month
        </label>
        <input
          id="report-month"
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded border border-slate-600 bg-slate-950 px-2 py-1.5 text-slate-100"
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => void load()}
          className="rounded border border-slate-600 px-3 py-1.5 text-slate-200 hover:bg-slate-800 disabled:opacity-50"
        >
          Refresh
        </button>
      </div>
      {err ? <p className="text-red-300">{err}</p> : null}
      {report ? (
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded border border-slate-700 bg-slate-950/60 p-3 text-xs text-slate-300">
          {report.markdown}
        </pre>
      ) : null}
    </div>
  );
}
