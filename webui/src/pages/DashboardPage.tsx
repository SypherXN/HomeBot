import { useState } from "react";
import { Link } from "react-router-dom";
import { getHealth, getMeta } from "../api";
import { useAuth } from "../auth/AuthContext";

function formatJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

export default function DashboardPage() {
  const { token } = useAuth();
  const [snippet, setSnippet] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const hasToken = token.trim().length > 0;

  async function pingApi() {
    setLoading(true);
    try {
      const data = { health: await getHealth(), meta: await getMeta() };
      setSnippet(formatJson(data));
    } catch (e) {
      setSnippet(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Dashboard</h1>
        <p className="mt-1 text-slate-400">
          Single-household console for the HomeBot API. Configure credentials in{" "}
          <Link to="/settings" className="text-blue-400 hover:underline">
            Settings
          </Link>
          .
        </p>
      </div>

      {!hasToken && (
        <div className="rounded-lg border border-amber-700/50 bg-amber-950/40 px-4 py-3 text-sm text-amber-100">
          No bearer token stored in this browser. Add{" "}
          <code className="rounded bg-slate-900 px-1">HOMEBOT_API_TOKEN</code> in{" "}
          <Link to="/settings" className="font-medium text-amber-50 underline">
            Settings
          </Link>{" "}
          to call protected routes.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          to="/buy"
          className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 transition hover:border-slate-600 hover:bg-slate-900"
        >
          <div className="text-sm font-medium text-white">Buy list</div>
          <p className="mt-1 text-sm text-slate-400">Shopping items and completions</p>
        </Link>
        <Link
          to="/wishlist"
          className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 transition hover:border-slate-600 hover:bg-slate-900"
        >
          <div className="text-sm font-medium text-white">Wishlist</div>
          <p className="mt-1 text-sm text-slate-400">Wishes and priorities</p>
        </Link>
        <Link
          to="/money"
          className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 transition hover:border-slate-600 hover:bg-slate-900"
        >
          <div className="text-sm font-medium text-white">Money</div>
          <p className="mt-1 text-sm text-slate-400">Expenses, split, payments, summary</p>
        </Link>
        <Link
          to="/calendar"
          className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 transition hover:border-slate-600 hover:bg-slate-900"
        >
          <div className="text-sm font-medium text-white">Calendar</div>
          <p className="mt-1 text-sm text-slate-400">Events, today, upcoming</p>
        </Link>
      </div>

      <div>
        <button
          type="button"
          className="rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-sm text-slate-100 hover:bg-slate-700 disabled:opacity-50"
          disabled={loading}
          onClick={() => void pingApi()}
        >
          {loading ? "Checking…" : "Ping /api/health + /api/meta"}
        </button>
        {snippet !== null && (
          <pre className="hb-json mt-4">{snippet}</pre>
        )}
      </div>
    </div>
  );
}
