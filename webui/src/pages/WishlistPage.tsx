import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useDiscordGuildRoster } from "../hooks/useDiscordGuildRoster";
import { validActorId } from "../lib/validation";
import {
  deleteWishlistCompleted,
  deleteWishlistItem,
  getWishlistItems,
  getWishlistOwners,
  getWishlistTagCatalog,
  postWishlistItem,
  postWishlistItemComplete,
  postUndo,
  putWishlistItem,
  putWishlistTagCatalog,
  type PagedWishlistList,
  type WishlistListItem,
  type WishlistListSort,
  type WishlistOwnerRow,
} from "../api";

const TAG_TOKEN = /^[a-z0-9_-]{1,48}$/;

function normalizeTagToken(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/^#+/, "");
  if (!s || !TAG_TOKEN.test(s)) return null;
  return s;
}

function formatSnowflake(n: string | number | null | undefined): string {
  if (n == null) return "—";
  return typeof n === "string" ? n : String(n);
}

export default function WishlistPage() {
  const { token, actorUserId } = useAuth();
  const tok = token.trim();
  const actor = actorUserId.trim();
  const canAuth = tok.length > 0;
  const canActor = canAuth && validActorId(actor);
  const guildRoster = useDiscordGuildRoster(token);

  const [catalogTags, setCatalogTags] = useState<string[]>([]);
  const [draftCatalogTags, setDraftCatalogTags] = useState<string[]>([]);
  const [newCatalogTag, setNewCatalogTag] = useState("");
  const [catalogBusy, setCatalogBusy] = useState(false);

  const [dbOwners, setDbOwners] = useState<WishlistOwnerRow[]>([]);

  const [ownerFilter, setOwnerFilter] = useState("");
  const [filterTag, setFilterTag] = useState("");
  const [sortBy, setSortBy] = useState<WishlistListSort>("id");

  const [listPage, setListPage] = useState(0);
  const [data, setData] = useState<PagedWishlistList | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [addName, setAddName] = useState("");
  const [addOwnerUserId, setAddOwnerUserId] = useState("");
  const [addPrice, setAddPrice] = useState("");
  const [addLink, setAddLink] = useState("");
  const [addDesc, setAddDesc] = useState("");
  const [addNotes, setAddNotes] = useState("");
  const [addPriority, setAddPriority] = useState("");
  const [addTags, setAddTags] = useState("");
  const [addTagPick, setAddTagPick] = useState<string[]>([]);
  const [addSubmitting, setAddSubmitting] = useState(false);

  const [actionBusyId, setActionBusyId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editOwner, setEditOwner] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editLink, setEditLink] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editPriority, setEditPriority] = useState("");
  const [editTagPick, setEditTagPick] = useState<string[]>([]);
  const [clearBusy, setClearBusy] = useState(false);
  const [undoBusy, setUndoBusy] = useState(false);
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const ownerPickerOptions = useMemo(() => {
    const base: { value: string; label: string }[] = [{ value: "", label: "Default (actor / you)" }];
    const seen = new Set<string>([""]);
    const r = guildRoster.data;
    if (r?.available && r.members.length > 0) {
      for (const m of r.members) {
        seen.add(m.userId);
        base.push({ value: m.userId, label: `${m.displayName} (@${m.username})` });
      }
      for (const o of dbOwners) {
        if (!seen.has(o.userId)) {
          seen.add(o.userId);
          base.push({ value: o.userId, label: `${o.label} (${o.userId})` });
        }
      }
    } else {
      for (const o of dbOwners) {
        if (!seen.has(o.userId)) {
          seen.add(o.userId);
          base.push({ value: o.userId, label: `${o.label} (${o.userId})` });
        }
      }
    }
    return base;
  }, [guildRoster.data, dbOwners]);

  const listOwnerFilterOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [{ value: "", label: "Everyone" }];
    const seen = new Set<string>([""]);
    const r = guildRoster.data;
    if (r?.available && r.members.length > 0) {
      for (const m of r.members) {
        seen.add(m.userId);
        opts.push({ value: m.userId, label: `${m.displayName} (@${m.username})` });
      }
      for (const o of dbOwners) {
        if (!seen.has(o.userId)) {
          seen.add(o.userId);
          opts.push({ value: o.userId, label: `${o.label} (${o.userId})` });
        }
      }
    } else {
      for (const o of dbOwners) {
        if (!seen.has(o.userId)) {
          seen.add(o.userId);
          opts.push({ value: o.userId, label: `${o.label} (${o.userId})` });
        }
      }
    }
    return opts;
  }, [guildRoster.data, dbOwners]);

  const refreshCatalog = useCallback(async () => {
    if (!canAuth) {
      setCatalogTags([]);
      setDraftCatalogTags([]);
      return;
    }
    setCatalogBusy(true);
    try {
      const r = await getWishlistTagCatalog(tok);
      setCatalogTags(r.tags);
      setDraftCatalogTags([...r.tags]);
    } catch {
      setCatalogTags([]);
      setDraftCatalogTags([]);
    } finally {
      setCatalogBusy(false);
    }
  }, [canAuth, tok]);

  const refreshDbOwners = useCallback(async () => {
    if (!canAuth) {
      setDbOwners([]);
      return;
    }
    try {
      const r = await getWishlistOwners(tok);
      setDbOwners(r.owners);
    } catch {
      setDbOwners([]);
    }
  }, [canAuth, tok]);

  useEffect(() => {
    void refreshCatalog();
  }, [refreshCatalog]);

  useEffect(() => {
    void refreshDbOwners();
  }, [refreshDbOwners]);

  const loadList = useCallback(async () => {
    if (!canAuth) {
      setData(null);
      return;
    }
    setListLoading(true);
    setListError(null);
    try {
      const res = await getWishlistItems(tok, listPage, {
        owner: ownerFilter || undefined,
        tag: filterTag || undefined,
        sort: sortBy,
      });
      if (res.items.length === 0 && res.hasPrev) {
        setListPage((p) => Math.max(0, p - 1));
        return;
      }
      setData(res);
    } catch (e) {
      setListError(e instanceof Error ? e.message : String(e));
      setData(null);
    } finally {
      setListLoading(false);
    }
  }, [canAuth, tok, listPage, ownerFilter, filterTag, sortBy]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  function showBanner(kind: "ok" | "err", text: string) {
    setBanner({ kind, text });
    window.setTimeout(() => setBanner(null), 5000);
  }

  function startEdit(item: WishlistListItem) {
    setEditingId(item.id);
    setEditName(item.name);
    setEditOwner(item.owner);
    setEditPrice(item.price || "");
    setEditLink(item.link || "");
    setEditDesc(item.description || "");
    setEditNotes(item.notes || "");
    setEditPriority(item.priority || "");
    setEditTagPick(item.tags ? [...item.tags] : []);
  }

  async function saveEdit(item: WishlistListItem) {
    if (!canAuth) return;
    const tagsPayload =
      catalogTags.length > 0
        ? editTagPick.length > 0
          ? [...editTagPick].sort().join(",")
          : ""
        : undefined;
    await putWishlistItem(tok, item.id, {
      name: editName.trim() || item.name,
      ownerUserId: editOwner.trim() || undefined,
      price: editPrice.trim() || undefined,
      link: editLink.trim() || undefined,
      description: editDesc.trim() || undefined,
      notes: editNotes.trim() || undefined,
      priority: editPriority.trim() || undefined,
      tags: tagsPayload,
    });
    setEditingId(null);
    showBanner("ok", "Wish updated.");
    await refreshDbOwners();
    await loadList();
  }

  function toggleEditTagPick(t: string) {
    setEditTagPick((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!canActor) {
      showBanner("err", "Set actorUserId in Settings (your Discord user id).");
      return;
    }
    const name = addName.trim();
    if (!name) {
      showBanner("err", "Name is required.");
      return;
    }
    setAddSubmitting(true);
    try {
      const tagsPayload =
        catalogTags.length > 0
          ? addTagPick.length > 0
            ? [...addTagPick].sort().join(",")
            : undefined
          : addTags.trim() || undefined;

      await postWishlistItem(tok, actor, {
        name,
        ownerUserId: addOwnerUserId.trim() || undefined,
        price: addPrice.trim() || undefined,
        link: addLink.trim() || undefined,
        description: addDesc.trim() || undefined,
        notes: addNotes.trim() || undefined,
        priority: addPriority.trim() || undefined,
        tags: tagsPayload,
      });
      setAddName("");
      setAddOwnerUserId("");
      setAddPrice("");
      setAddLink("");
      setAddDesc("");
      setAddNotes("");
      setAddPriority("");
      setAddTags("");
      setAddTagPick([]);
      setListPage(0);
      showBanner("ok", "Wish added.");
      await refreshDbOwners();
      const res = await getWishlistItems(tok, 0, {
        owner: ownerFilter || undefined,
        tag: filterTag || undefined,
        sort: sortBy,
      });
      setData(res);
    } catch (err) {
      showBanner("err", err instanceof Error ? err.message : String(err));
    } finally {
      setAddSubmitting(false);
    }
  }

  async function handleComplete(item: WishlistListItem) {
    if (!canActor) {
      showBanner("err", "Set actorUserId in Settings to complete items.");
      return;
    }
    setActionBusyId(item.id);
    try {
      await postWishlistItemComplete(tok, actor, item.id);
      showBanner("ok", `Completed “${item.name}”.`);
      await refreshDbOwners();
      await loadList();
    } catch (err) {
      showBanner("err", err instanceof Error ? err.message : String(err));
    } finally {
      setActionBusyId(null);
    }
  }

  async function handleDelete(item: WishlistListItem) {
    if (!canActor) {
      showBanner("err", "Set actorUserId in Settings to remove items.");
      return;
    }
    if (!window.confirm(`Remove “${item.name}” from the wishlist?`)) return;
    setActionBusyId(item.id);
    try {
      await deleteWishlistItem(tok, actor, item.id);
      showBanner("ok", `Removed “${item.name}”.`);
      await refreshDbOwners();
      await loadList();
    } catch (err) {
      showBanner("err", err instanceof Error ? err.message : String(err));
    } finally {
      setActionBusyId(null);
    }
  }

  async function handleUndo() {
    if (!canActor) {
      showBanner("err", "Set actorUserId in Settings to use undo.");
      return;
    }
    setUndoBusy(true);
    try {
      const r = await postUndo(tok, actor);
      if (!r.undone) {
        showBanner("err", (r.message && r.message.trim()) || "Nothing to undo for this actor.");
        return;
      }
      showBanner("ok", "Last action was undone.");
      await refreshDbOwners();
      await loadList();
    } catch (err) {
      showBanner("err", err instanceof Error ? err.message : String(err));
    } finally {
      setUndoBusy(false);
    }
  }

  async function handleClearCompleted() {
    if (!canAuth) return;
    if (!window.confirm("Delete all completed wishlist rows? This cannot be undone.")) return;
    setClearBusy(true);
    try {
      await deleteWishlistCompleted(tok);
      showBanner("ok", "Completed wishes cleared.");
      await refreshDbOwners();
      await loadList();
    } catch (err) {
      showBanner("err", err instanceof Error ? err.message : String(err));
    } finally {
      setClearBusy(false);
    }
  }

  function toggleAddTagPick(t: string) {
    setAddTagPick((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  function appendDraftTag() {
    const n = normalizeTagToken(newCatalogTag);
    if (!n) {
      showBanner("err", "Use 1–48 characters: letters, digits, hyphen, or underscore.");
      return;
    }
    if (draftCatalogTags.includes(n)) {
      setNewCatalogTag("");
      return;
    }
    setDraftCatalogTags((d) => [...d, n].sort((a, b) => a.localeCompare(b)));
    setNewCatalogTag("");
  }

  function removeDraftTag(t: string) {
    setDraftCatalogTags((d) => d.filter((x) => x !== t));
  }

  async function handleSaveCatalog() {
    if (!canAuth) return;
    setCatalogBusy(true);
    try {
      const r = await putWishlistTagCatalog(tok, draftCatalogTags);
      setCatalogTags(r.tags);
      setDraftCatalogTags([...r.tags]);
      setFilterTag((ft) => (ft && !r.tags.includes(ft) ? "" : ft));
      setAddTagPick((picked) => picked.filter((p) => r.tags.includes(p)));
      showBanner("ok", "Wishlist tag catalog saved.");
      await loadList();
    } catch (err) {
      showBanner("err", err instanceof Error ? err.message : String(err));
    } finally {
      setCatalogBusy(false);
    }
  }

  const totalPages =
    data && data.pageSize > 0 ? Math.max(1, Math.ceil(data.totalCount / data.pageSize)) : 1;
  const rangeStart =
    data && data.items.length > 0 ? data.page * data.pageSize + 1 : 0;
  const rangeEnd = data ? data.page * data.pageSize + data.items.length : 0;

  const rosterHint =
    guildRoster.data?.available === false
      ? "Discord roster unavailable — owner lists use people who already have active wishes, or set actor and type ids manually."
      : null;

  return (
    <div className="mx-auto min-w-0 max-w-3xl px-3 pb-10 sm:px-4">
      <header className="mb-6 border-b border-slate-800 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Wishlist</h1>
        <p className="mt-1 text-sm text-slate-400">
          Active wishes only. Filter by household member, tag, and sort. Tag catalog works like Buy.
        </p>
      </header>

      {banner && (
        <div
          role="status"
          className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
            banner.kind === "ok"
              ? "border-emerald-800/60 bg-emerald-950/50 text-emerald-100"
              : "border-red-800/60 bg-red-950/40 text-red-100"
          }`}
        >
          {banner.text}
        </div>
      )}

      {!canAuth && (
        <div className="mb-6 rounded-lg border border-amber-700/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">
          Add your API token in{" "}
          <Link to="/settings" className="font-medium text-amber-50 underline">
            Settings
          </Link>{" "}
          to load the list.
        </div>
      )}

      {canAuth && !canActor && (
        <div className="mb-6 rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-3 text-sm text-slate-300">
          Set <strong className="text-slate-100">actorUserId</strong> in{" "}
          <Link to="/settings" className="text-blue-400 hover:underline">
            Settings
          </Link>{" "}
          to add, complete, or delete wishes.
        </div>
      )}

      {rosterHint && (
        <p className="mb-4 text-xs text-amber-200/90">{rosterHint}</p>
      )}

      {canAuth && (
        <section className="mb-6 rounded-xl border border-slate-800 bg-slate-900/40 p-4 sm:p-5">
          <h2 className="text-lg font-semibold text-white">Tag catalog</h2>
          <p className="mt-1 text-sm text-slate-400">
            When saved, only these tags are stored on new wishes (same rules as Buy tags).
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {draftCatalogTags.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 rounded-full bg-slate-700 px-3 py-1 text-sm text-slate-100"
              >
                {t}
                <button
                  type="button"
                  className="rounded p-0.5 text-slate-300 hover:bg-slate-600 hover:text-white"
                  onClick={() => removeDraftTag(t)}
                  aria-label={`Remove ${t}`}
                >
                  ×
                </button>
              </span>
            ))}
            {draftCatalogTags.length === 0 && (
              <span className="text-sm text-slate-500">No tags in catalog yet.</span>
            )}
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <label htmlFor="wl-new-tag" className="mb-1 block text-xs font-medium text-slate-400">
                New tag
              </label>
              <input
                id="wl-new-tag"
                value={newCatalogTag}
                onChange={(e) => setNewCatalogTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    appendDraftTag();
                  }
                }}
                placeholder="e.g. birthday"
                className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2.5 text-base text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <button
              type="button"
              onClick={() => appendDraftTag()}
              className="min-h-[44px] shrink-0 rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-sm text-slate-100 hover:bg-slate-700"
            >
              Add to draft
            </button>
            <button
              type="button"
              disabled={catalogBusy}
              onClick={() => void handleSaveCatalog()}
              className="min-h-[44px] shrink-0 rounded-lg border border-blue-600 bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
            >
              {catalogBusy ? "Saving…" : "Save catalog"}
            </button>
          </div>
        </section>
      )}

      {canAuth && (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <label htmlFor="wl-owner-filter" className="mb-1 block text-xs font-medium text-slate-400">
              Whose wishlist
            </label>
            <select
              id="wl-owner-filter"
              value={ownerFilter}
              onChange={(e) => {
                setOwnerFilter(e.target.value);
                setListPage(0);
              }}
              className="h-11 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 text-base text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {listOwnerFilterOptions.map((o) => (
                <option key={o.value || "__all__"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="wl-filter-tag" className="mb-1 block text-xs font-medium text-slate-400">
              Filter by tag
            </label>
            <select
              id="wl-filter-tag"
              value={filterTag}
              onChange={(e) => {
                setFilterTag(e.target.value);
                setListPage(0);
              }}
              className="h-11 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 text-base text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">All tags</option>
              {catalogTags.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="wl-sort" className="mb-1 block text-xs font-medium text-slate-400">
              Sort by
            </label>
            <select
              id="wl-sort"
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value as WishlistListSort);
                setListPage(0);
              }}
              className="h-11 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 text-base text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="id">List order</option>
              <option value="name">Name</option>
              <option value="owner">Owner</option>
              <option value="tags">Tags</option>
              <option value="priority">Priority</option>
              <option value="price">Price</option>
            </select>
          </div>
        </div>
      )}

      <section className="mb-8 min-w-0 max-w-full overflow-x-hidden rounded-xl border border-slate-800 bg-slate-900/40 p-4 shadow-sm sm:p-5">
        <h2 className="text-lg font-semibold text-white">Add a wish</h2>
        <form onSubmit={(e) => void handleAdd(e)} className="mt-4 min-w-0 space-y-4">
          <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="wl-add-name" className="mb-1 block text-xs font-medium text-slate-400">
                Name <span className="text-red-400">*</span>
              </label>
              <input
                id="wl-add-name"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                autoComplete="off"
                className="box-border min-w-0 w-full max-w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2.5 text-base text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="wl-add-owner" className="mb-1 block text-xs font-medium text-slate-400">
                Owner
              </label>
              <select
                id="wl-add-owner"
                value={addOwnerUserId}
                onChange={(e) => setAddOwnerUserId(e.target.value)}
                className="box-border h-11 min-w-0 w-full max-w-full rounded-lg border border-slate-600 bg-slate-950 px-3 text-base text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {ownerPickerOptions.map((o) => (
                  <option key={`add-${o.value || "def"}`} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="wl-add-price" className="mb-1 block text-xs font-medium text-slate-400">
                Price
              </label>
              <input
                id="wl-add-price"
                value={addPrice}
                onChange={(e) => setAddPrice(e.target.value)}
                placeholder="$20"
                className="box-border min-w-0 w-full max-w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2.5 text-base text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label htmlFor="wl-add-priority" className="mb-1 block text-xs font-medium text-slate-400">
                Priority (1–3)
              </label>
              <input
                id="wl-add-priority"
                value={addPriority}
                onChange={(e) => setAddPriority(e.target.value)}
                className="box-border min-w-0 w-full max-w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2.5 text-base text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="wl-add-link" className="mb-1 block text-xs font-medium text-slate-400">
                Link
              </label>
              <input
                id="wl-add-link"
                value={addLink}
                onChange={(e) => setAddLink(e.target.value)}
                className="box-border min-w-0 w-full max-w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2.5 text-base text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="wl-add-desc" className="mb-1 block text-xs font-medium text-slate-400">
                Description
              </label>
              <input
                id="wl-add-desc"
                value={addDesc}
                onChange={(e) => setAddDesc(e.target.value)}
                className="box-border min-w-0 w-full max-w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2.5 text-base text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="wl-add-notes" className="mb-1 block text-xs font-medium text-slate-400">
                Notes
              </label>
              <textarea
                id="wl-add-notes"
                value={addNotes}
                onChange={(e) => setAddNotes(e.target.value)}
                rows={2}
                className="box-border min-w-0 w-full max-w-full resize-y rounded-lg border border-slate-600 bg-slate-950 px-3 py-2.5 text-base text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-slate-400">Tags</span>
              {catalogTags.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {catalogTags.map((t) => {
                    const on = addTagPick.includes(t);
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => toggleAddTagPick(t)}
                        className={`min-h-[40px] rounded-full border px-3 py-1.5 text-sm transition ${
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
                  id="wl-add-tags"
                  value={addTags}
                  onChange={(e) => setAddTags(e.target.value)}
                  placeholder="comma-separated"
                  className="box-border min-w-0 w-full max-w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2.5 text-base text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              )}
            </div>
          </div>
          <button
            type="submit"
            disabled={addSubmitting || !canActor}
            className="min-h-[44px] w-full rounded-lg border border-blue-600 bg-blue-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            {addSubmitting ? "Adding…" : "Add wish"}
          </button>
        </form>
      </section>

      <section aria-labelledby="wl-list-heading">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <h2 id="wl-list-heading" className="text-lg font-semibold text-white">
            Wishes
          </h2>
          {canAuth && (
            <button
              type="button"
              onClick={() => void loadList()}
              disabled={listLoading}
              className="min-h-[40px] rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700 disabled:opacity-50"
            >
              {listLoading ? "Refreshing…" : "Refresh"}
            </button>
          )}
        </div>

        {listError && (
          <p className="mb-4 rounded-lg border border-red-800/50 bg-red-950/30 px-3 py-2 text-sm text-red-200">
            {listError}
          </p>
        )}

        {listLoading && !data && canAuth && <p className="py-8 text-center text-slate-400">Loading…</p>}

        {data && data.totalCount === 0 && !listLoading && (
          <p className="rounded-xl border border-dashed border-slate-700 bg-slate-900/30 px-4 py-10 text-center text-slate-400">
            No wishes match these filters.
          </p>
        )}

        {data && data.items.length > 0 && (
          <ul className="space-y-3">
            {data.items.map((item) => (
              <li
                key={item.id}
                className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 shadow-sm sm:p-5"
              >
                {editingId === item.id ? (
                  <div className="space-y-3">
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100"
                    />
                    <select
                      value={editOwner}
                      onChange={(e) => setEditOwner(e.target.value)}
                      className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100"
                    >
                      {ownerPickerOptions.map((o) => (
                        <option key={`edit-${o.value || "def"}`} value={o.value || item.owner}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input
                        value={editPrice}
                        onChange={(e) => setEditPrice(e.target.value)}
                        placeholder="Price"
                        className="rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100"
                      />
                      <input
                        value={editPriority}
                        onChange={(e) => setEditPriority(e.target.value)}
                        placeholder="Priority"
                        className="rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100"
                      />
                    </div>
                    <input
                      value={editLink}
                      onChange={(e) => setEditLink(e.target.value)}
                      placeholder="Link"
                      className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100"
                    />
                    <input
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                      placeholder="Description"
                      className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100"
                    />
                    <textarea
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      rows={2}
                      placeholder="Notes"
                      className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100"
                    />
                    {catalogTags.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {catalogTags.map((t) => {
                          const on = editTagPick.includes(t);
                          return (
                            <button
                              key={t}
                              type="button"
                              onClick={() => toggleEditTagPick(t)}
                              className={`rounded-full border px-3 py-1 text-sm ${
                                on
                                  ? "border-blue-500 bg-blue-900/50 text-blue-100"
                                  : "border-slate-600 bg-slate-950 text-slate-300"
                              }`}
                            >
                              {t}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void saveEdit(item)}
                        className="rounded-lg border border-blue-600 bg-blue-700 px-3 py-2 text-sm text-white"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-300"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className="text-lg font-semibold leading-snug text-white">{item.name}</p>
                    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="text-xs uppercase tracking-wide text-slate-500">Owner</dt>
                        <dd className="text-slate-200">
                          {item.ownerMemberLabel}
                          <span className="mt-0.5 block font-mono text-xs text-slate-500">
                            {formatSnowflake(item.owner)}
                          </span>
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase tracking-wide text-slate-500">Price</dt>
                        <dd className="text-slate-200">{item.price || "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase tracking-wide text-slate-500">Priority</dt>
                        <dd className="text-slate-200">{item.priority || "—"}</dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="text-xs uppercase tracking-wide text-slate-500">Link</dt>
                        <dd className="break-all text-slate-200">
                          {item.link ? (
                            <a
                              href={item.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-400 hover:underline"
                            >
                              {item.link}
                            </a>
                          ) : (
                            "—"
                          )}
                        </dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="text-xs uppercase tracking-wide text-slate-500">Description</dt>
                        <dd className="whitespace-pre-wrap break-words text-slate-200">
                          {item.description || "—"}
                        </dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="text-xs uppercase tracking-wide text-slate-500">Tags</dt>
                        <dd className="text-slate-200">
                          {item.tags?.length ? (
                            <span className="flex flex-wrap gap-1.5">
                              {item.tags.map((t) => (
                                <span
                                  key={t}
                                  className="inline-flex rounded-full bg-slate-700/80 px-2.5 py-0.5 text-xs text-slate-100"
                                >
                                  {t}
                                </span>
                              ))}
                            </span>
                          ) : (
                            "—"
                          )}
                        </dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="text-xs uppercase tracking-wide text-slate-500">Notes</dt>
                        <dd className="whitespace-pre-wrap break-words text-slate-200">
                          {item.notes || "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase tracking-wide text-slate-500">Id</dt>
                        <dd className="font-mono text-slate-400">{item.id}</dd>
                      </div>
                    </dl>
                  </div>
                  <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:min-w-[140px]">
                    {canAuth && (
                      <button
                        type="button"
                        disabled={actionBusyId === item.id}
                        onClick={() => startEdit(item)}
                        className="min-h-[44px] w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2.5 text-sm font-medium text-slate-100 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Edit
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={!canActor || actionBusyId === item.id}
                      onClick={() => void handleComplete(item)}
                      className="min-h-[44px] w-full rounded-lg border border-emerald-700 bg-emerald-900/40 px-3 py-2.5 text-sm font-medium text-emerald-100 hover:bg-emerald-900/60 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {actionBusyId === item.id ? "…" : "Complete"}
                    </button>
                    <button
                      type="button"
                      disabled={!canActor || actionBusyId === item.id}
                      onClick={() => void handleDelete(item)}
                      className="min-h-[44px] w-full rounded-lg border border-red-800/80 bg-red-950/40 px-3 py-2.5 text-sm font-medium text-red-100 hover:bg-red-950/70 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {data && data.totalCount > 0 && (
          <nav
            className="mt-6 flex min-w-0 flex-col items-stretch gap-4 border-t border-slate-800 pt-6 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
            aria-label="Wishlist pages"
          >
            {rangeStart > 0 ? (
              <p className="min-w-0 space-y-1 text-center text-sm leading-snug text-slate-400 sm:max-w-[55%] sm:text-left">
                <span className="block break-words sm:inline">
                  Showing <strong className="text-slate-200">{rangeStart}</strong>–
                  <strong className="text-slate-200">{rangeEnd}</strong> of{" "}
                  <strong className="text-slate-200">{data.totalCount}</strong>
                </span>
                <span className="block text-xs text-slate-500 sm:text-sm">
                  Page {data.page + 1} of {totalPages} · {data.pageSize} per page
                </span>
              </p>
            ) : null}
            <div className="flex w-full min-w-0 gap-2 sm:w-auto sm:flex-wrap sm:justify-end">
              <button
                type="button"
                disabled={!data.hasPrev || listLoading}
                onClick={() => setListPage((p) => Math.max(0, p - 1))}
                className="min-h-[44px] min-w-0 flex-1 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40 sm:min-w-[100px] sm:flex-none sm:px-4"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={!data.hasNext || listLoading}
                onClick={() => setListPage((p) => p + 1)}
                className="min-h-[44px] min-w-0 flex-1 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40 sm:min-w-[100px] sm:flex-none sm:px-4"
              >
                Next
              </button>
            </div>
            <div className="flex flex-col gap-2 border-t border-slate-800/80 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-center text-xs text-slate-500 sm:text-left sm:max-w-md">
                Undo reverts the latest logged action for your actor (wishlist, buy, money, calendar, etc.), not only
                this page.
              </p>
              <button
                type="button"
                disabled={!canActor || undoBusy || listLoading}
                onClick={() => void handleUndo()}
                className="min-h-[44px] shrink-0 rounded-lg border border-amber-700/80 bg-amber-950/40 px-4 py-2.5 text-sm font-medium text-amber-100 hover:bg-amber-950/70 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {undoBusy ? "Undoing…" : "Undo last action"}
              </button>
            </div>
          </nav>
        )}
      </section>

      {canAuth && (
        <section className="mt-10 border-t border-slate-800 pt-8">
          <h3 className="text-base font-medium text-slate-300">Completed history</h3>
          <p className="mt-1 text-sm text-slate-500">Remove all completed wishlist rows from the database.</p>
          <button
            type="button"
            disabled={clearBusy}
            onClick={() => void handleClearCompleted()}
            className="mt-3 min-h-[44px] rounded-lg border border-slate-600 bg-slate-900 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50"
          >
            {clearBusy ? "Working…" : "Clear all completed wishes"}
          </button>
        </section>
      )}
    </div>
  );
}
