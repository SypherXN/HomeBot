import { useState } from "react";
import { postBudgetImportCsv } from "../../api";

type Props = {
  token: string;
  actor: string;
  defaultSpender: string;
  onImported: () => Promise<void>;
};

export default function BudgetCsvImport({ token, actor, defaultSpender, onImported }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFileChange(f: File | null) {
    setFile(f);
    setStatus(null);
    if (!f) {
      setPreview([]);
      return;
    }
    const text = await f.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    setPreview(lines.slice(0, 6));
  }

  async function handleImport() {
    if (!file || !actor || !defaultSpender) return;
    setBusy(true);
    setStatus(null);
    try {
      const res = await postBudgetImportCsv(token, actor, file, defaultSpender);
      setStatus(`Imported ${res.imported} row(s).`);
      setFile(null);
      setPreview([]);
      await onImported();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-700 p-3">
      <h3 className="mb-2 text-sm font-medium text-slate-200">Import CSV</h3>
      <p className="mb-2 text-xs text-slate-500">
        Columns: Type, Date, Amount, … (see export format). Uses your actor as default spender when missing.
      </p>
      <input
        type="file"
        accept=".csv,text/csv"
        onChange={(e) => void onFileChange(e.target.files?.[0] ?? null)}
        className="text-sm text-slate-400"
      />
      {preview.length > 0 && (
        <pre className="mt-2 max-h-32 overflow-auto rounded bg-slate-950 p-2 text-xs text-slate-400">
          {preview.join("\n")}
          {preview.length >= 6 ? "\n…" : ""}
        </pre>
      )}
      <button
        type="button"
        disabled={!file || busy || !actor}
        onClick={() => void handleImport()}
        className="mt-2 rounded bg-slate-700 px-3 py-1 text-sm text-white disabled:opacity-50"
      >
        {busy ? "Importing…" : "Import"}
      </button>
      {status && <p className="mt-2 text-xs text-slate-400">{status}</p>}
    </div>
  );
}
