import type { BudgetAuditEntry } from "../../api";

type Props = {
  entries: BudgetAuditEntry[];
};

export default function BudgetAuditLog({ entries }: Props) {
  return (
    <section className="hb-card p-4">
      <h2 className="mb-3 text-lg font-medium text-white">Audit log</h2>
      {entries.length === 0 ? (
        <p className="text-sm text-slate-500">No audit entries yet.</p>
      ) : (
        <ul className="max-h-64 space-y-2 overflow-y-auto text-sm">
          {entries.map((e) => (
            <li key={e.id} className="rounded border border-slate-800 px-3 py-2 text-slate-400">
              <div className="flex flex-wrap justify-between gap-2">
                <span className="text-slate-300">
                  {e.action} · {e.entityType} #{e.entityId}
                </span>
                <span className="text-xs text-slate-500">{e.createdAt}</span>
              </div>
              <div className="text-xs text-slate-500">Actor {e.actorUserId}</div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
