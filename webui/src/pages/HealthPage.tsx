import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getApiBaseUrl, getHealth, getMeta, isApiBaseInferred } from "../api";

type Slice =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ok"; health: unknown; meta: unknown };

export default function HealthPage() {
  const [slice, setSlice] = useState<Slice>({ status: "idle" });

  const load = useCallback(async () => {
    setSlice({ status: "loading" });
    try {
      const [health, meta] = await Promise.all([getHealth(), getMeta()]);
      setSlice({ status: "ok", health, meta });
    } catch (e) {
      setSlice({
        status: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const base = getApiBaseUrl();
  const inferred = isApiBaseInferred();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">API diagnostics</h1>
        <p className="mt-1 text-sm text-slate-400">
          Public <code className="text-slate-300">/api/health</code> and <code className="text-slate-300">/api/meta</code>{" "}
          from this browser. Bookmark this page for quick checks; the header still shows live connection status on other
          routes.
        </p>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3 text-sm text-slate-300">
        <div>
          <span className="text-slate-500">Configured base URL</span>{" "}
          <code className="rounded bg-slate-950 px-1.5 py-0.5 text-slate-200">{base}</code>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          {inferred ? "Using same-host inference or build default (no localStorage override)." : "Using a saved or build-time API base URL."}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={slice.status === "loading"}
            className="rounded-md bg-slate-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-600 disabled:opacity-50"
          >
            {slice.status === "loading" ? "Refreshing…" : "Refresh"}
          </button>
          <Link to="/settings" className="rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800">
            Settings
          </Link>
          <Link to="/" className="rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800">
            Home
          </Link>
        </div>
      </div>

      {slice.status === "error" ? (
        <div className="rounded-lg border border-red-800/60 bg-red-950/40 px-4 py-3 text-sm text-red-100" role="alert">
          {slice.message}
        </div>
      ) : null}

      {slice.status === "ok" ? (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-300">Responses</h2>
          <pre className="max-h-[min(70vh,32rem)] overflow-auto rounded-lg border border-slate-800 bg-slate-950/80 p-4 text-xs leading-relaxed text-slate-200">
            {JSON.stringify({ health: slice.health, meta: slice.meta }, null, 2)}
          </pre>
        </div>
      ) : slice.status === "loading" ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : null}
    </div>
  );
}
