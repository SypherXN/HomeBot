import { useCallback, useEffect, useState } from "react";
import { getHouseholdAudit, type HouseholdAuditEntry } from "../../api";

type Props = { token: string };

export default function HouseholdAuditPanel({ token }: Props) {
  const tok = token.trim();
  const [entries, setEntries] = useState<HouseholdAuditEntry[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tok) return;
    try {
      const r = await getHouseholdAudit(tok, 80);
      setEntries(r.entries);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [tok]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!tok) return <p className="text-sm text-slate-500">Sign in to view household audit log.</p>;

  return (
    <div className="space-y-2 text-sm">
      {err ? <p className="text-red-300">{err}</p> : null}
      <ul className="max-h-48 space-y-1 overflow-y-auto text-slate-400">
        {entries.map((e) => (
          <li key={e.id}>
            <span className="text-slate-500">{e.createdAt}</span>{" "}
            <span className="text-slate-200">{e.category}/{e.action}</span>
            {e.actorUsername ? <> · {e.actorUsername}</> : null}
            {e.detail ? <> · {e.detail}</> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
