import { useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { validActorId } from "../lib/validation";
import { getApiBaseUrl, getHealth, getMeta, postUndo } from "../api";

export type WorkspaceSection = "health" | "undo";

function formatJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

export default function WorkspacePage({ section }: { section: WorkspaceSection }) {
  const { token, actorUserId } = useAuth();
  const [output, setOutput] = useState<string>(
    section === "health"
      ? "GET /api/health and /api/meta. No token required."
      : "Reverts the last undoable row in ActionLog for actorUserId."
  );
  const [loading, setLoading] = useState(false);

  const baseUrl = useMemo(() => getApiBaseUrl(), []);
  const tok = token.trim();
  const actor = actorUserId.trim();
  const requiresToken = section !== "health";
  const canRead = !requiresToken || tok.length > 0;
  const canAuth = tok.length > 0;
  const canActor = canAuth && validActorId(actor);

  async function runHealth() {
    setLoading(true);
    try {
      const data = { health: await getHealth(), meta: await getMeta() };
      setOutput(formatJson(data));
    } catch (e) {
      setOutput(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function runUndo() {
    if (!canActor) {
      setOutput(
        "Undo needs actorUserId: your Discord user id (non-zero digits)."
      );
      return;
    }
    setLoading(true);
    try {
      const data = await postUndo(tok, actor);
      setOutput(formatJson(data));
    } catch (e) {
      setOutput(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="hb-workspace">
      <p className="hb-hint mb-4">
        API base{" "}
        <code className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-200">{baseUrl}</code>
      </p>

      {section === "health" && (
        <section className="hb-section">
          <button type="button" disabled={!canRead || loading} onClick={() => void runHealth()}>
            {loading ? "…" : "GET /api/health + /api/meta"}
          </button>
        </section>
      )}

      {section === "undo" && (
        <section className="hb-section">
          <p>
            Reverts the last undoable row in <code>ActionLog</code> for <code>actorUserId</code>.
            Buy / Wishlist / Money / Calendar pages also expose Undo next to their lists.
          </p>
          <button
            type="button"
            className="hb-btn-primary"
            disabled={loading || !canActor}
            onClick={() => void runUndo()}
          >
            POST /api/undo
          </button>
        </section>
      )}

      {requiresToken && !canRead && <p className="hb-warn">Set a bearer token to call the API.</p>}

      <pre className="hb-json">{output}</pre>
    </div>
  );
}
