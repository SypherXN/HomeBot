import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  getBudgetNotifications,
  postBudgetNotificationDismiss,
  type BudgetNotificationItem,
} from "../api";
import { useAuth } from "../auth/AuthContext";
import { validActorId } from "../lib/validation";
import Sheet from "./Sheet";
import { Icon } from "./icons";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Non-budget alerts collected by the shell (backup warning, API down). */
  shellAlerts: { key: string; message: string; to?: string; linkLabel?: string }[];
  onChanged?: () => void;
};

/** Bell-target panel: pending budget notifications + shell-level alerts, dismissible. */
export default function NotificationCenter({ open, onClose, shellAlerts, onChanged }: Props) {
  const { token, actorUserId } = useAuth();
  const tok = token.trim();
  const actor = actorUserId.trim();
  const canDismiss = tok.length > 0 && validActorId(actor);

  const [items, setItems] = useState<BudgetNotificationItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dismissing, setDismissing] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tok) {
      setItems([]);
      return;
    }
    try {
      setItems(await getBudgetNotifications(tok));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setItems([]);
    }
  }, [tok]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  async function dismiss(key: string) {
    if (!canDismiss) return;
    setDismissing(key);
    try {
      await postBudgetNotificationDismiss(tok, actor, key);
      setItems((prev) => (prev ?? []).filter((i) => i.key !== key));
      window.dispatchEvent(new Event("homebot-budget-alerts-changed"));
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDismissing(null);
    }
  }

  const empty =
    shellAlerts.length === 0 && items != null && items.length === 0 && !error;

  return (
    <Sheet open={open} title="Notifications" onClose={onClose}>
      {shellAlerts.map((a) => (
        <div
          key={a.key}
          className="mb-2 flex items-start gap-2.5 rounded-xl border border-amber-800/50 bg-amber-950/40 px-3.5 py-2.5 text-sm text-amber-100"
        >
          <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1">
            {a.message}{" "}
            {a.to ? (
              <Link to={a.to} onClick={onClose} className="font-medium underline">
                {a.linkLabel ?? "Open"}
              </Link>
            ) : null}
          </span>
        </div>
      ))}

      {error && <p className="mb-2 text-sm text-rose-300">{error}</p>}
      {items == null && !error && <p className="text-sm text-slate-500">Loading…</p>}

      {items && items.length > 0 && (
        <ul className="space-y-2">
          {items.map((n) => (
            <li
              key={n.key}
              className="flex items-start gap-2.5 rounded-xl border border-slate-800 bg-slate-900/50 px-3.5 py-2.5"
            >
              <Icon name="budget" className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
              <span className="min-w-0 flex-1 text-sm text-slate-200">{n.message}</span>
              <button
                type="button"
                disabled={!canDismiss || dismissing === n.key}
                onClick={() => void dismiss(n.key)}
                className="shrink-0 rounded-lg hb-btn-soft px-2 py-1 text-xs text-slate-300 disabled:opacity-50"
                title={canDismiss ? "Dismiss" : "Set actorUserId in Settings to dismiss"}
              >
                {dismissing === n.key ? "…" : "Dismiss"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {empty && (
        <div className="py-6 text-center">
          <Icon name="check" className="mx-auto h-6 w-6 text-emerald-400" />
          <p className="mt-2 text-sm text-slate-400">All caught up.</p>
        </div>
      )}
    </Sheet>
  );
}
