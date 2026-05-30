import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { getApiBaseUrl, getHealth, getMeta, getOpsHealth, isApiBaseInferred } from "../api";

type Slice =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ok"; health: unknown; meta: unknown; ops?: unknown };

export default function HealthPage() {
  const { token } = useAuth();
  const tok = token.trim();
  const [slice, setSlice] = useState<Slice>({ status: "idle" });

  const load = useCallback(async () => {
    setSlice({ status: "loading" });
    try {
      const [health, meta] = await Promise.all([getHealth(), getMeta()]);
      let ops: unknown;
      if (tok) {
        try {
          ops = await getOpsHealth(tok);
        } catch {
          ops = { error: "Admin token required for /api/ops/health" };
        }
      }
      setSlice({ status: "ok", health, meta, ops });
    } catch (e) {
      setSlice({
        status: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }, [tok]);

  useEffect(() => {
    void load();
  }, [load]);

  const base = getApiBaseUrl();
  const inferred = isApiBaseInferred();
  const backups =
    slice.status === "ok" && slice.meta && typeof slice.meta === "object" && slice.meta !== null
      ? (slice.meta as { backups?: { latestModifiedUtc?: string; fileCount?: number; exists?: boolean } }).backups
      : undefined;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Ops & diagnostics</h1>
        <p className="mt-1 text-sm text-slate-400">
          Health, meta, backups, and detailed ops (admin token). See also{" "}
          <a href="/docs/MOBILE.md" className="text-blue-400 hover:underline">
            mobile install
          </a>
          .
        </p>
      </div>

      {backups && !backups.exists ? (
        <div role="alert" className="rounded-lg border border-amber-800/50 bg-amber-950/40 px-4 py-3 text-sm text-amber-100">
          No local backup directory found. Configure <code className="text-amber-50">HOMEBOT_BACKUP_DIR</code> and{" "}
          <code className="text-amber-50">scripts/backup-homebot-with-gdrive.sh</code>. Restore:{" "}
          <code className="text-amber-50">scripts/restore-homebot-backup.sh</code>.
        </div>
      ) : null}
      {backups?.latestModifiedUtc ? (
        <div className="rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-3 text-sm text-slate-300">
          Latest local backup: <span className="text-white">{backups.latestModifiedUtc}</span>
          {backups.fileCount != null ? <> ({backups.fileCount} file(s))</> : null}
        </div>
      ) : null}

      <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3 text-sm text-slate-300">
        <div>
          <span className="text-slate-500">Configured base URL</span>{" "}
          <code className="rounded bg-slate-950 px-1.5 py-0.5 text-slate-200">{base}</code>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          {inferred ? "Using same-host inference or build default." : "Using saved or build-time API base URL."}
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
        </div>
      </div>

      {slice.status === "error" ? (
        <div className="rounded-lg border border-red-800/60 bg-red-950/40 px-4 py-3 text-sm text-red-100" role="alert">
          {slice.message}
        </div>
      ) : null}

      {slice.status === "ok" ? (
        <pre className="max-h-[min(70vh,32rem)] overflow-auto rounded-lg border border-slate-800 bg-slate-950/80 p-4 text-xs leading-relaxed text-slate-200">
          {JSON.stringify({ health: slice.health, meta: slice.meta, ops: slice.ops }, null, 2)}
        </pre>
      ) : slice.status === "loading" ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : null}
    </div>
  );
}
