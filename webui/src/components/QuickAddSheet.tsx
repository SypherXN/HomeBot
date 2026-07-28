import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  postBudgetTransaction,
  postBuyItem,
  postCalendarItem,
  postWishlistItem,
} from "../api";
import { useAuth } from "../auth/AuthContext";
import { useCalendarZone } from "../calendar/CalendarZoneContext";
import { useUndoToast } from "../hooks/useUndoToast";
import { parseQuickAdd, QUICK_ADD_EXAMPLES, QUICK_ADD_KIND_LABEL, type QuickAddKind } from "../lib/quickAdd";
import { validActorId } from "../lib/validation";
import Sheet from "./Sheet";
import { Icon } from "./icons";

const KIND_ICON: Record<QuickAddKind, Parameters<typeof Icon>[0]["name"]> = {
  buy: "buy",
  wishlist: "wishlist",
  task: "tasks",
  event: "calendar",
  expense: "budget",
};

type Props = {
  open: boolean;
  onClose: () => void;
};

/**
 * One-line composer that routes natural language to the right feature.
 * Opened from the FAB or Ctrl/Cmd-K.
 */
export default function QuickAddSheet({ open, onClose }: Props) {
  const { token, actorUserId } = useAuth();
  const { effectiveViewerZone } = useCalendarZone();
  const undoToast = useUndoToast();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const [text, setText] = useState("");
  const [kindOverride, setKindOverride] = useState<QuickAddKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setText("");
    setKindOverride(null);
    setError(null);
    setBusy(false);
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [open]);

  const parsed = useMemo(() => parseQuickAdd(text), [text]);
  const kind: QuickAddKind | null = kindOverride ?? parsed?.kind ?? null;

  const tok = token.trim();
  const actor = actorUserId.trim();
  const canSubmit = tok.length > 0 && parsed != null && kind != null && !busy;

  async function submit() {
    if (!parsed || !kind) return;
    setBusy(true);
    setError(null);
    try {
      switch (kind) {
        case "buy": {
          const name = parsed.kind === "buy" ? parsed.name : text.trim();
          const store = parsed.kind === "buy" ? parsed.store : undefined;
          await postBuyItem(tok, actor, { name, store });
          undoToast(`Added "${name}" to the buy list.`);
          break;
        }
        case "wishlist": {
          const name = parsed.kind === "wishlist" ? parsed.name : text.trim();
          await postWishlistItem(tok, actor, { name });
          undoToast(`Added "${name}" to the wishlist.`);
          break;
        }
        case "task": {
          const title = parsed.kind === "task" ? parsed.title : text.trim();
          await postCalendarItem(tok, { title, start: "", timezone: effectiveViewerZone });
          undoToast(`Added task "${title}".`);
          break;
        }
        case "event": {
          if (parsed.kind !== "event") return;
          await postCalendarItem(tok, {
            title: parsed.title,
            start: `${parsed.date}T${parsed.time}:00`,
            timezone: effectiveViewerZone,
          });
          undoToast(`Added event "${parsed.title}".`);
          break;
        }
        case "expense": {
          if (parsed.kind !== "expense") return;
          if (!validActorId(actor)) {
            setError("Set your actor (Discord user id) in Settings to log expenses.");
            return;
          }
          await postBudgetTransaction(tok, actor, {
            type: "expense",
            amountInput: parsed.amount,
            spentByUserId: actor,
            merchant: parsed.merchant,
          });
          undoToast(`Logged $${parsed.amount} at ${parsed.merchant}.`);
          break;
        }
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const KINDS: QuickAddKind[] = ["buy", "task", "event", "expense", "wishlist"];

  return (
    <Sheet open={open} title="Quick add" onClose={onClose}>
      <p className="mb-3 text-xs text-slate-500">
        One line, routed automatically —{" "}
        {QUICK_ADD_EXAMPLES.map((ex, i) => (
          <span key={ex}>
            <button
              type="button"
              onClick={() => {
                setText(ex);
                setKindOverride(null);
                inputRef.current?.focus();
              }}
              className="text-blue-400 hover:underline"
            >
              {ex}
            </button>
            {i < QUICK_ADD_EXAMPLES.length - 1 ? <span className="text-slate-600"> · </span> : null}
          </span>
        ))}
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-950/80 px-3.5 py-2.5 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/25">
          <Icon name="search" className="h-4 w-4 shrink-0 text-slate-500" />
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setKindOverride(null);
            }}
            placeholder="milk @costco, task call the bank, $12 lunch…"
            className="min-w-0 flex-1 bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
            aria-label="Quick add"
          />
          <button
            type="submit"
            disabled={!canSubmit}
            className="shrink-0 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {busy ? "Adding…" : "Add"}
          </button>
        </div>

        {kind && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {KINDS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKindOverride(k === kind && kindOverride ? null : k)}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  k === kind
                    ? "border-blue-500/60 bg-blue-950/60 text-blue-200"
                    : "border-slate-700 text-slate-400 hover:text-slate-200"
                }`}
              >
                <Icon name={KIND_ICON[k]} className="h-3.5 w-3.5" />
                {QUICK_ADD_KIND_LABEL[k]}
              </button>
            ))}
          </div>
        )}

        {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}
      </form>

      <div className="mt-5 border-t border-slate-800/70 pt-3">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Or jump to</p>
        <div className="flex flex-wrap gap-1.5">
          {[
            { to: "/buy", label: "Buy list", icon: "buy" as const },
            { to: "/calendar", label: "Calendar", icon: "calendar" as const },
            { to: "/meals", label: "Meals", icon: "meals" as const },
            { to: "/budget", label: "Budget", icon: "budget" as const },
          ].map((l) => (
            <button
              key={l.to}
              type="button"
              onClick={() => {
                onClose();
                navigate(l.to);
              }}
              className="flex items-center gap-1.5 rounded-lg hb-btn-soft px-2.5 py-1.5 text-xs text-slate-300"
            >
              <Icon name={l.icon} className="h-3.5 w-3.5" />
              {l.label}
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  );
}
