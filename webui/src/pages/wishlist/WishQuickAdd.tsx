import { useRef, useState } from "react";

export type WishOwnerOption = { value: string; label: string };

type Props = {
  canActor: boolean;
  catalogTags: string[];
  ownerOptions: WishOwnerOption[];
  onAdd: (input: {
    name: string;
    ownerUserId?: string;
    price?: string;
    link?: string;
    description?: string;
    notes?: string;
    priority?: string;
    tags?: string;
  }) => Promise<void>;
  onBanner: (kind: "ok" | "err", text: string) => void;
};

const PRIORITIES: { value: string; label: string; hint: string }[] = [
  { value: "1", label: "★★★", hint: "Most wanted" },
  { value: "2", label: "★★", hint: "Want" },
  { value: "3", label: "★", hint: "Nice to have" },
];

/**
 * Amazon/Giftster-style quick add: name + price on one line, everything else
 * (link, owner, priority, description, notes, tags) behind a disclosure.
 */
export default function WishQuickAdd({ canActor, catalogTags, ownerOptions, onAdd, onBanner }: Props) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [link, setLink] = useState("");
  const [owner, setOwner] = useState("");
  const [priority, setPriority] = useState("");
  const [desc, setDesc] = useState("");
  const [notes, setNotes] = useState("");
  const [tagPick, setTagPick] = useState<string[]>([]);
  const [freeTags, setFreeTags] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

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
        ownerUserId: owner.trim() || undefined,
        price: price.trim() || undefined,
        link: link.trim() || undefined,
        description: desc.trim() || undefined,
        notes: notes.trim() || undefined,
        priority: priority || undefined,
        tags:
          catalogTags.length > 0
            ? tagPick.length > 0
              ? [...tagPick].sort().join(",")
              : undefined
            : freeTags.trim() || undefined,
      });
      setName("");
      setPrice("");
      setLink("");
      setPriority("");
      setDesc("");
      setNotes("");
      setTagPick([]);
      setFreeTags("");
      setDetailsOpen(false);
      nameRef.current?.focus();
    } finally {
      setBusy(false);
    }
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
            placeholder="Add a wish…"
            autoComplete="off"
            enterKeyHint="done"
            aria-label="Wish name"
            className="min-w-0 flex-1 hb-input px-3 py-2.5 text-base text-slate-100 placeholder:text-slate-500"
          />
          <div className="flex w-24 shrink-0 items-center hb-input px-2" aria-label="Price">
            <span className="text-slate-500">$</span>
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/[^0-9.,]/g, ""))}
              inputMode="decimal"
              placeholder="0"
              aria-label="Price"
              className="w-full bg-transparent px-1 py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-500"
            />
          </div>
          <button
            type="submit"
            disabled={busy || !name.trim() || !canActor}
            className="shrink-0 rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-2.5 text-sm font-medium text-white hover:from-blue-500 hover:to-blue-600 disabled:opacity-50"
          >
            {busy ? "…" : "Add"}
          </button>
        </div>

        <button
          type="button"
          onClick={() => setDetailsOpen((o) => !o)}
          className="text-xs text-slate-500 hover:text-slate-300"
          aria-expanded={detailsOpen}
        >
          {detailsOpen ? "▾ Hide details" : "▸ Link, owner, priority, notes, tags"}
        </button>

        {detailsOpen && (
          <div className="grid gap-3 border-t border-slate-800 pt-3 sm:grid-cols-2">
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="Link (https://…)"
              inputMode="url"
              className="hb-input px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 sm:col-span-2"
            />
            <select
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              aria-label="Owner"
              className="hb-input px-3 py-2 text-sm text-slate-100"
            >
              {ownerOptions.map((o) => (
                <option key={`add-${o.value || "def"}`} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-1" role="group" aria-label="Priority">
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
            <input
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Short description"
              className="hb-input px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 sm:col-span-2"
            />
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes"
              className="hb-input px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 sm:col-span-2"
            />
            <div className="sm:col-span-2">
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
          </div>
        )}
      </form>
    </section>
  );
}
