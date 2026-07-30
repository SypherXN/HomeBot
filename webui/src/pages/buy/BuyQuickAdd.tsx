import { useRef, useState } from "react";
import MemberIdField from "../../components/MemberIdField";
import type { DiscordGuildRosterState } from "../../hooks/useDiscordGuildRoster";
import type { BuyListItem, BuyRecurringItem } from "../../api";

type Props = {
  canActor: boolean;
  token: string;
  actor: string;
  roster: DiscordGuildRosterState;
  catalogTags: string[];
  /** Names already on the list (for autocomplete). */
  listItems: BuyListItem[];
  /** Recurring staples → one-tap "probably need" chips. */
  recurring: BuyRecurringItem[];
  onAdd: (input: {
    name: string;
    quantity?: string;
    store?: string;
    tags?: string;
    notes?: string;
    assignedTo?: string;
  }) => Promise<void>;
  onBanner: (kind: "ok" | "err", text: string) => void;
};

const QTY_RE = /^\d{0,4}$/;

/**
 * Bring!/AnyList-style quick add: one line, Enter adds and keeps focus for rapid entry,
 * "probably need" chips from recurring staples, details hidden behind a disclosure.
 */
export default function BuyQuickAdd({
  canActor,
  token,
  actor,
  roster,
  catalogTags,
  listItems,
  recurring,
  onAdd,
  onBanner,
}: Props) {
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [store, setStore] = useState("");
  const [tagPick, setTagPick] = useState<string[]>([]);
  const [freeTags, setFreeTags] = useState("");
  const [notes, setNotes] = useState("");
  const [assigned, setAssigned] = useState("");
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const onListNames = new Set(listItems.map((i) => i.name.trim().toLowerCase()));
  const suggestions = recurring.filter((r) => !onListNames.has(r.name.trim().toLowerCase())).slice(0, 8);
  const knownNames = [...new Set([...listItems.map((i) => i.name), ...recurring.map((r) => r.name)])];

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (!canActor) {
      onBanner("err", "Set “Acting as” in Settings first.");
      return;
    }
    setBusy(true);
    try {
      await onAdd({
        name: trimmed,
        quantity: qty.trim() || undefined,
        store: store.trim() || undefined,
        tags:
          catalogTags.length > 0
            ? tagPick.length > 0
              ? [...tagPick].sort().join(",")
              : undefined
            : freeTags.trim() || undefined,
        notes: notes.trim() || undefined,
        assignedTo: assigned.trim() || undefined,
      });
      setName("");
      setQty("");
      setTagPick([]);
      setFreeTags("");
      setNotes("");
      setStore("");
      setDetailsOpen(false);
      nameRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  async function quickAddSuggestion(itemName: string) {
    if (!canActor) {
      onBanner("err", "Set “Acting as” in Settings first.");
      return;
    }
    setBusy(true);
    try {
      await onAdd({ name: itemName });
    } finally {
      setBusy(false);
    }
  }

  function bumpQty(delta: number) {
    const n = Number(qty) || 0;
    const next = Math.max(0, Math.min(9999, n + delta));
    setQty(next <= 0 ? "" : String(next));
  }

  return (
    <section className="hb-card p-3 sm:p-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="space-y-2"
      >
        <div className="flex items-center gap-2">
          <input
            ref={nameRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Add an item… (Enter to add, keep typing)"
            autoComplete="off"
            enterKeyHint="done"
            list="buy-name-suggestions"
            aria-label="Item name"
            className="min-w-0 flex-1 hb-input px-3 py-2.5 text-base text-slate-100 placeholder:text-slate-500"
          />
          <datalist id="buy-name-suggestions">
            {knownNames.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
          <div className="flex shrink-0 items-center rounded-lg hb-input" aria-label="Quantity">
            <button
              type="button"
              onClick={() => bumpQty(-1)}
              aria-label="Decrease quantity"
              className="px-2.5 py-2 text-lg leading-none text-slate-400 hover:text-slate-200"
            >
              −
            </button>
            <input
              value={qty}
              onChange={(e) => {
                if (QTY_RE.test(e.target.value)) setQty(e.target.value);
              }}
              inputMode="numeric"
              placeholder="1"
              aria-label="Quantity"
              className="w-8 bg-transparent text-center text-sm text-slate-100 outline-none"
            />
            <button
              type="button"
              onClick={() => bumpQty(1)}
              aria-label="Increase quantity"
              className="px-2.5 py-2 text-lg leading-none text-slate-400 hover:text-slate-200"
            >
              +
            </button>
          </div>
          <button
            type="submit"
            disabled={busy || !name.trim() || !canActor}
            className="shrink-0 rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-2.5 text-sm font-medium text-white hover:from-blue-500 hover:to-blue-600 disabled:opacity-50"
          >
            {busy ? "…" : "Add"}
          </button>
        </div>

        {suggestions.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-slate-500">Probably need:</span>
            {suggestions.map((r) => (
              <button
                key={r.id}
                type="button"
                disabled={busy}
                onClick={() => void quickAddSuggestion(r.name)}
                className="rounded-full border border-slate-700 bg-slate-900/60 px-2.5 py-1 text-xs text-slate-300 transition-colors hover:border-blue-600 hover:text-blue-200 disabled:opacity-50"
              >
                + {r.name}
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => setDetailsOpen((o) => !o)}
          className="text-xs text-slate-500 hover:text-slate-300"
          aria-expanded={detailsOpen}
        >
          {detailsOpen ? "▾ Hide details" : "▸ Store, tags, notes, assign"}
        </button>

        {detailsOpen && (
          <div className="grid gap-3 border-t border-slate-800 pt-3 sm:grid-cols-2">
            <input
              value={store}
              onChange={(e) => setStore(e.target.value)}
              placeholder="Store (e.g. Costco)"
              className="hb-input px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
            />
            <div>
              {catalogTags.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {catalogTags.map((t) => {
                    const on = tagPick.includes(t);
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTagPick((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]))}
                        className={`rounded-full border px-2.5 py-1 text-xs ${
                          on
                            ? "border-blue-500 bg-blue-900/50 text-blue-100"
                            : "border-slate-600 bg-slate-950 text-slate-300 hover:border-slate-500"
                        }`}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <input
                  value={freeTags}
                  onChange={(e) => setFreeTags(e.target.value)}
                  placeholder="Tags, comma-separated"
                  className="w-full hb-input px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
                />
              )}
            </div>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes"
              className="hb-input px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 sm:col-span-2"
            />
            <div className="sm:col-span-2">
              <MemberIdField
                id="buy-quick-assigned"
                token={token}
                value={assigned}
                onChange={setAssigned}
                label="Assign to"
                sharedRoster={roster}
                actorId={actor}
              />
            </div>
          </div>
        )}
      </form>
    </section>
  );
}
