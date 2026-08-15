import { useEffect, useState } from "react";
import Sheet from "../../components/Sheet";
import MemberIdField from "../../components/MemberIdField";
import type { DiscordGuildRosterState } from "../../hooks/useDiscordGuildRoster";
import type { BuyListItem } from "../../api";

type Props = {
  item: BuyListItem | null;
  token: string;
  actor: string;
  roster: DiscordGuildRosterState;
  catalogTags: string[];
  catalogStores: string[];
  onClose: () => void;
  onSave: (item: BuyListItem, input: {
    name: string;
    quantity?: string;
    store?: string;
    notes?: string;
    assignedTo: string | null;
    tags?: string;
  }) => Promise<void>;
};

/** Edit an item in a bottom sheet (mobile) / dialog (desktop) instead of inline. */
export default function BuyItemEditSheet({
  item,
  token,
  actor,
  roster,
  catalogTags,
  catalogStores,
  onClose,
  onSave,
}: Props) {
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [store, setStore] = useState("");
  const [notes, setNotes] = useState("");
  const [assigned, setAssigned] = useState("");
  const [tagPick, setTagPick] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!item) return;
    setName(item.name);
    setQty(item.quantity || "1");
    const rawStore = item.store || "";
    if (catalogStores.length > 0) {
      const hit = catalogStores.find((s) => s.toLowerCase() === rawStore.trim().toLowerCase());
      setStore(hit ?? "");
    } else {
      setStore(rawStore);
    }
    setNotes(item.notes || "");
    setAssigned(item.assignedTo != null ? String(item.assignedTo) : "");
    setTagPick(item.tags ? [...item.tags] : []);
  }, [item, catalogStores]);

  if (!item) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await onSave(item!, {
        name: name.trim() || item!.name,
        quantity: qty.trim() || undefined,
        store: store.trim() || undefined,
        notes: notes.trim() || undefined,
        assignedTo: assigned.trim() || null,
        tags: catalogTags.length > 0 ? (tagPick.length > 0 ? [...tagPick].sort().join(",") : "") : undefined,
      });
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={item != null} title={`Edit “${item.name}”`} onClose={onClose}>
      <form onSubmit={(e) => void submit(e)} className="space-y-3">
        <label className="block text-xs text-slate-400">
          Name
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full hb-input px-3 py-2 text-slate-100"
          />
        </label>
        <div className={catalogStores.length === 0 ? "grid grid-cols-2 gap-3" : undefined}>
          <label className="block text-xs text-slate-400">
            Quantity
            <input
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="mt-1 w-full hb-input px-3 py-2 text-slate-100"
            />
          </label>
          {catalogStores.length === 0 && (
            <label className="block text-xs text-slate-400">
              Store
              <input
                value={store}
                onChange={(e) => setStore(e.target.value)}
                className="mt-1 w-full hb-input px-3 py-2 text-slate-100"
              />
            </label>
          )}
        </div>
        {catalogStores.length > 0 && (
          <div>
            <span className="mb-1 block text-xs text-slate-400">Store</span>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Store">
              {catalogStores.map((s) => {
                const on = store.toLowerCase() === s.toLowerCase();
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStore(on ? "" : s)}
                    className={`rounded-full border px-2.5 py-1 text-xs ${
                      on
                        ? "border-blue-500 bg-blue-900/50 text-blue-100"
                        : "border-slate-600 bg-slate-950 text-slate-300 hover:border-slate-500"
                    }`}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <label className="block text-xs text-slate-400">
          Notes
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="mt-1 w-full resize-y hb-input px-3 py-2 text-slate-100"
          />
        </label>
        {catalogTags.length > 0 && (
          <div>
            <span className="mb-1 block text-xs text-slate-400">Tags</span>
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
          </div>
        )}
        <MemberIdField
          id="buy-edit-assigned"
          token={token}
          value={assigned}
          onChange={setAssigned}
          label="Assign to"
          sharedRoster={roster}
          actorId={actor}
        />
        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-2 text-sm font-medium text-white hover:from-blue-500 hover:to-blue-600 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={onClose} className="rounded-lg hb-btn-soft px-4 py-2 text-sm text-slate-300">
            Cancel
          </button>
        </div>
      </form>
    </Sheet>
  );
}
