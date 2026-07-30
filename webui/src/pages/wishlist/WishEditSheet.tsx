import { useEffect, useState } from "react";
import Sheet from "../../components/Sheet";
import type { WishlistListItem } from "../../api";
import type { WishOwnerOption } from "./WishQuickAdd";

type Props = {
  item: WishlistListItem | null;
  catalogTags: string[];
  ownerOptions: WishOwnerOption[];
  onClose: () => void;
  onSave: (item: WishlistListItem, input: {
    name: string;
    ownerUserId?: string;
    price?: string;
    link?: string;
    description?: string;
    notes?: string;
    priority?: string;
    tags?: string;
  }) => Promise<void>;
};

const PRIORITIES: { value: string; label: string; hint: string }[] = [
  { value: "1", label: "★★★", hint: "Most wanted" },
  { value: "2", label: "★★", hint: "Want" },
  { value: "3", label: "★", hint: "Nice to have" },
];

/** Edit a wish in a bottom sheet (mobile) / dialog (desktop) instead of inline. */
export default function WishEditSheet({ item, catalogTags, ownerOptions, onClose, onSave }: Props) {
  const [name, setName] = useState("");
  const [owner, setOwner] = useState("");
  const [price, setPrice] = useState("");
  const [link, setLink] = useState("");
  const [desc, setDesc] = useState("");
  const [notes, setNotes] = useState("");
  const [priority, setPriority] = useState("");
  const [tagPick, setTagPick] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!item) return;
    setName(item.name);
    setOwner(item.owner);
    setPrice(item.price || "");
    setLink(item.link || "");
    setDesc(item.description || "");
    setNotes(item.notes || "");
    setPriority(item.priority || "");
    setTagPick(item.tags ? [...item.tags] : []);
  }, [item]);

  if (!item) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await onSave(item!, {
        name: name.trim() || item!.name,
        ownerUserId: owner.trim() || undefined,
        price: price.trim() || undefined,
        link: link.trim() || undefined,
        description: desc.trim() || undefined,
        notes: notes.trim() || undefined,
        priority: priority.trim() || undefined,
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
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs text-slate-400">
            Price
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="$20"
              className="mt-1 w-full hb-input px-3 py-2 text-slate-100"
            />
          </label>
          <label className="block text-xs text-slate-400">
            Owner
            <select
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              className="mt-1 w-full hb-input px-3 py-2 text-slate-100"
            >
              {ownerOptions.map((o) => (
                <option key={`edit-${o.value || "def"}`} value={o.value || item.owner}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div>
          <span className="mb-1 block text-xs text-slate-400">Priority</span>
          <div className="flex gap-1">
            {PRIORITIES.map((p) => (
              <button
                key={p.value}
                type="button"
                title={p.hint}
                onClick={() => setPriority((cur) => (cur === p.value ? "" : p.value))}
                className={`rounded-lg border px-2.5 py-1.5 text-xs tracking-wide ${
                  priority === p.value
                    ? "border-amber-600/70 bg-amber-950/40 text-amber-300"
                    : "border-slate-700 bg-slate-950 text-slate-500 hover:text-slate-300"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <label className="block text-xs text-slate-400">
          Link
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            inputMode="url"
            className="mt-1 w-full hb-input px-3 py-2 text-slate-100"
          />
        </label>
        <label className="block text-xs text-slate-400">
          Description
          <input
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            className="mt-1 w-full hb-input px-3 py-2 text-slate-100"
          />
        </label>
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
