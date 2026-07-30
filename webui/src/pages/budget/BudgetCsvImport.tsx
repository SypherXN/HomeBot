import { useMemo, useState } from "react";
import { postBudgetImportCsv } from "../../api";

type Props = {
  token: string;
  actor: string;
  defaultSpender: string;
  onImported: () => Promise<void>;
};

type ColumnKey = "type" | "date" | "amount" | "merchant" | "note" | "category";

const COLUMN_OPTIONS: { key: ColumnKey; label: string }[] = [
  { key: "type", label: "Type" },
  { key: "date", label: "Date" },
  { key: "amount", label: "Amount" },
  { key: "merchant", label: "Merchant" },
  { key: "note", label: "Note" },
  { key: "category", label: "Category" },
];

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQuotes = !inQuotes;
    } else if (c === "," && !inQuotes) {
      result.push(cur);
      cur = "";
    } else cur += c;
  }
  result.push(cur);
  return result;
}

function guessMapping(headers: string[]): Partial<Record<ColumnKey, number>> {
  const norm = headers.map((h) => h.trim().toLowerCase());
  const find = (...names: string[]) => norm.findIndex((h) => names.some((n) => h.includes(n)));
  const mapping: Partial<Record<ColumnKey, number>> = {};
  const typeIdx = find("type");
  const dateIdx = find("date", "when", "transaction");
  const amtIdx = find("amount", "value", "total");
  const merchIdx = find("merchant", "vendor", "payee", "description");
  const noteIdx = find("note", "memo");
  const catIdx = find("category", "cat");
  if (typeIdx >= 0) mapping.type = typeIdx;
  if (dateIdx >= 0) mapping.date = dateIdx;
  if (amtIdx >= 0) mapping.amount = amtIdx;
  if (merchIdx >= 0) mapping.merchant = merchIdx;
  if (noteIdx >= 0) mapping.note = noteIdx;
  if (catIdx >= 0) mapping.category = catIdx;
  return mapping;
}

function csvEscape(s: string): string {
  if (s.includes(",") || s.includes('"')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildHomeBotCsv(
  rows: string[][],
  mapping: Partial<Record<ColumnKey, number>>,
  defaultSpender: string
): string {
  const lines = ["Id,Type,Date,Amount,Currency,Category,SpentByUserId,Merchant,Note,Tags"];
  for (const cols of rows) {
    const type = mapping.type != null ? cols[mapping.type]?.trim() || "expense" : "expense";
    const date = mapping.date != null ? cols[mapping.date]?.trim() || new Date().toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
    const amount = mapping.amount != null ? cols[mapping.amount]?.trim() || "0" : "0";
    const merchant = mapping.merchant != null ? cols[mapping.merchant]?.trim() || "" : "";
    const note = mapping.note != null ? cols[mapping.note]?.trim() || "" : "";
    const category = mapping.category != null ? cols[mapping.category]?.trim() || "" : "";
    lines.push(
      [
        "",
        csvEscape(type),
        csvEscape(date),
        csvEscape(amount),
        "USD",
        csvEscape(category),
        defaultSpender,
        csvEscape(merchant),
        csvEscape(note),
        "",
      ].join(",")
    );
  }
  return lines.join("\n");
}

function duplicateWarnings(rows: string[][], mapping: Partial<Record<ColumnKey, number>>): string[] {
  const seen = new Map<string, number>();
  const warnings: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    const cols = rows[i];
    const date = mapping.date != null ? cols[mapping.date]?.trim() : "";
    const amount = mapping.amount != null ? cols[mapping.amount]?.trim() : "";
    const merchant = mapping.merchant != null ? cols[mapping.merchant]?.trim() : "";
    if (!date && !amount && !merchant) continue;
    const key = `${date}|${amount}|${merchant.toLowerCase()}`;
    const prev = seen.get(key);
    if (prev != null) warnings.push(`Rows ${prev + 1} and ${i + 1} look alike (${date}, $${amount}, ${merchant || "no merchant"}).`);
    else seen.set(key, i);
  }
  return warnings.slice(0, 5);
}

export default function BudgetCsvImport({ token, actor, defaultSpender, onImported }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [dataRows, setDataRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Partial<Record<ColumnKey, number>>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const dupes = useMemo(() => duplicateWarnings(dataRows, mapping), [dataRows, mapping]);

  async function onFileChange(f: File | null) {
    setFile(f);
    setStatus(null);
    if (!f) {
      setHeaders([]);
      setDataRows([]);
      setMapping({});
      return;
    }
    const text = await f.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length === 0) return;
    const headerCols = parseCsvLine(lines[0]);
    setHeaders(headerCols);
    setDataRows(lines.slice(1).map(parseCsvLine));
    setMapping(guessMapping(headerCols));
  }

  function setMap(key: ColumnKey, colIdx: string) {
    setMapping((m) => {
      const next = { ...m };
      if (colIdx === "") delete next[key];
      else next[key] = Number(colIdx);
      return next;
    });
  }

  async function handleImport() {
    if (!file || !actor || !defaultSpender) return;
    if (mapping.amount == null || mapping.date == null) {
      setStatus("Map at least Date and Amount columns.");
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const csv = buildHomeBotCsv(dataRows, mapping, defaultSpender);
      const blob = new Blob([csv], { type: "text/csv" });
      const mappedFile = new File([blob], "mapped-import.csv", { type: "text/csv" });
      const res = await postBudgetImportCsv(token, actor, mappedFile, defaultSpender);
      setStatus(
        `Imported ${res.imported} row(s). Uncategorized items may need review in the Ledger.`
      );
      setFile(null);
      setHeaders([]);
      setDataRows([]);
      setMapping({});
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
        Upload a bank or spreadsheet export — map columns, then we&apos;ll convert to HomeBot format.
      </p>
      <input
        type="file"
        accept=".csv,text/csv"
        onChange={(e) => void onFileChange(e.target.files?.[0] ?? null)}
        className="text-sm text-slate-400"
      />

      {headers.length > 0 && (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-medium text-slate-400">Column mapping</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {COLUMN_OPTIONS.map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 text-xs text-slate-400">
                <span className="w-20 shrink-0">{label}</span>
                <select
                  value={mapping[key] ?? ""}
                  onChange={(e) => setMap(key, e.target.value)}
                  className="min-w-0 flex-1 hb-input px-2 py-1 text-xs text-slate-100"
                >
                  <option value="">—</option>
                  {headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h || `Column ${i + 1}`}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <pre className="max-h-24 overflow-auto rounded bg-slate-950 p-2 text-xs text-slate-400">
            {headers.join(" | ")}
            {dataRows.slice(0, 3).map((r) => `\n${r.join(" | ")}`)}
          </pre>
        </div>
      )}

      {dupes.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-amber-300">
          {dupes.map((w) => (
            <li key={w}>⚠ {w}</li>
          ))}
        </ul>
      )}

      <button
        type="button"
        disabled={!file || busy || !actor || mapping.amount == null || mapping.date == null}
        onClick={() => void handleImport()}
        className="mt-2 rounded bg-slate-700 px-3 py-1 text-sm text-white disabled:opacity-50"
      >
        {busy ? "Importing…" : "Import"}
      </button>
      {status && <p className="mt-2 text-xs text-slate-400">{status}</p>}
    </div>
  );
}
