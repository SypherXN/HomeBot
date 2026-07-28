import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import MemberIdField from "../components/MemberIdField";
import BulkActionBar from "../components/BulkActionBar";
import { useBulkSelection } from "../hooks/useBulkSelection";
import { useDiscordGuildRoster } from "../hooks/useDiscordGuildRoster";
import { useUndoToast } from "../hooks/useUndoToast";
import { validActorId } from "../lib/validation";
import {
  deleteBuyCompleted,
  deleteBuyItem,
  getBuyItems,
  getBuyTagCatalog,
  getBuyRecurring,
  postBuyRecurring,
  deleteBuyRecurring,
  postBuyItem,
  postBuyItemComplete,
  postBuyBulkComplete,
  postBuyBulkDelete,
  postUndo,
  putBuyItem,
  putBuyTagCatalog,
  type BuyListItem,
  type BuyListSort,
  type BuyRecurringItem,
  type PagedBuyList,
} from "../api";
import { highlightRowClass, useSearchHighlightId } from "../lib/searchHighlight";

function formatSnowflake(n: string | number | null | undefined): string {
  if (n == null) return "—";
  return typeof n === "string" ? n : String(n);
}

const TAG_TOKEN = /^[a-z0-9_-]{1,48}$/;

function normalizeTagToken(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/^#+/, "");
  if (!s || !TAG_TOKEN.test(s)) return null;
  return s;
}

function formatItemAge(createdAt: string | null | undefined): string | null {
  if (!createdAt) return null;
  const ms = Date.parse(createdAt.includes("T") ? createdAt : `${createdAt.replace(" ", "T")}Z`);
  if (!Number.isFinite(ms)) return null;
  const days = Math.floor((Date.now() - ms) / 86400000);
  if (days < 1) return "added today";
  if (days === 1) return "1 day on list";
  return `${days} days on list`;
}

export default function BuyPage() {
  const { token, actorUserId } = useAuth();
  const tok = token.trim();
  const actor = actorUserId.trim();
  const canAuth = tok.length > 0;
  const canActor = canAuth && validActorId(actor);
  const guildRoster = useDiscordGuildRoster(token);
  const [params] = useSearchParams();
  const highlightId = useSearchHighlightId();
  const highlightRef = useRef<HTMLLIElement>(null);
  const initialPage = Number.parseInt(params.get("page") ?? "0", 10);

  const [catalogTags, setCatalogTags] = useState<string[]>([]);
  const [draftCatalogTags, setDraftCatalogTags] = useState<string[]>([]);
  const [newCatalogTag, setNewCatalogTag] = useState("");
  const [catalogBusy, setCatalogBusy] = useState(false);

  const [filterTag, setFilterTag] = useState("");
  const [filterAssigned, setFilterAssigned] = useState("");
  const [filterStore, setFilterStore] = useState("");
  const [sortBy, setSortBy] = useState<BuyListSort>("id");

  const [listPage, setListPage] = useState(
    Number.isFinite(initialPage) && initialPage >= 0 ? initialPage : 0
  );
  const [data, setData] = useState<PagedBuyList | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  useEffect(() => {
    if (!highlightId || !data?.items.some((i) => i.id === highlightId)) return;
    highlightRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [highlightId, data]);

  const [addName, setAddName] = useState("");
  const [addQty, setAddQty] = useState("1");
  const [addStore, setAddStore] = useState("");
  const [addTags, setAddTags] = useState("");
  const [addTagPick, setAddTagPick] = useState<string[]>([]);
  const [addNotes, setAddNotes] = useState("");
  const [addAssigned, setAddAssigned] = useState("");
  const [addSubmitting, setAddSubmitting] = useState(false);

  const [actionBusyId, setActionBusyId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editQty, setEditQty] = useState("");
  const [editStore, setEditStore] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editAssigned, setEditAssigned] = useState("");
  const [editTagPick, setEditTagPick] = useState<string[]>([]);
  const [clearBusy, setClearBusy] = useState(false);

  const [recurring, setRecurring] = useState<BuyRecurringItem[]>([]);
  const [recurName, setRecurName] = useState("");
  const [recurCadence, setRecurCadence] = useState<"weekly" | "daily">("weekly");
  const [recurBusy, setRecurBusy] = useState(false);
  const [undoBusy, setUndoBusy] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const pageIds = useMemo(() => data?.items.map((i) => i.id) ?? [], [data?.items]);
  const bulk = useBulkSelection(pageIds);

  useEffect(() => {
    bulk.clear();
  }, [listPage, bulk.clear]);

  const refreshCatalog = useCallback(async () => {
    if (!canAuth) {
      setCatalogTags([]);
      setDraftCatalogTags([]);
      return;
    }
    setCatalogBusy(true);
    try {
      const r = await getBuyTagCatalog(tok);
      setCatalogTags(r.tags);
      setDraftCatalogTags([...r.tags]);
    } catch {
      setCatalogTags([]);
      setDraftCatalogTags([]);
    } finally {
      setCatalogBusy(false);
    }
  }, [canAuth, tok]);

  useEffect(() => {
    void refreshCatalog();
  }, [refreshCatalog]);

  const loadList = useCallback(async () => {
    if (!canAuth) {
      setData(null);
      return;
    }
    setListLoading(true);
    setListError(null);
    try {
      const res = await getBuyItems(tok, listPage, {
        tag: filterTag || undefined,
        sort: sortBy,
        assignedTo: filterAssigned || undefined,
        store: filterStore || undefined,
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
  }, [canAuth, tok, listPage, filterTag, filterAssigned, filterStore, sortBy]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (!canAuth) {
      setRecurring([]);
      return;
    }
    void getBuyRecurring(tok)
      .then((r) => setRecurring(r.items))
      .catch(() => setRecurring([]));
  }, [canAuth, tok]);

  function startEdit(item: BuyListItem) {
    setEditingId(item.id);
    setEditName(item.name);
    setEditQty(item.quantity || "1");
    setEditStore(item.store || "");
    setEditNotes(item.notes || "");
    setEditAssigned(item.assignedTo != null ? String(item.assignedTo) : "");
    setEditTagPick(item.tags ? [...item.tags] : []);
  }

  async function saveEdit(item: BuyListItem) {
    if (!canAuth) return;
    const tagsPayload =
      catalogTags.length > 0
        ? editTagPick.length > 0
          ? [...editTagPick].sort().join(",")
          : ""
        : undefined;
    await putBuyItem(tok, item.id, {
      name: editName.trim() || item.name,
      quantity: editQty.trim() || undefined,
      store: editStore.trim() || undefined,
      notes: editNotes.trim() || undefined,
      assignedTo: editAssigned.trim() || null,
      tags: tagsPayload,
    });
    setEditingId(null);
    showBanner("ok", "Item updated.");
    await loadList();
  }

  function toggleEditTagPick(t: string) {
    setEditTagPick((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  function showBanner(kind: "ok" | "err", text: string) {
    setBanner({ kind, text });
    window.setTimeout(() => setBanner(null), 5000);
  }

  const undoToast = useUndoToast();

  async function handleBulkComplete() {
    if (!canActor || bulk.selectedIds.length === 0) return;
    setBulkBusy(true);
    try {
      const res = await postBuyBulkComplete(tok, actor, bulk.selectedIds);
      showBanner("ok", `Completed ${res.count} item(s).`);
      bulk.clear();
      await loadList();
    } catch (e) {
      showBanner("err", e instanceof Error ? e.message : String(e));
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleBulkDelete() {
    if (!canActor || bulk.selectedIds.length === 0) return;
    if (!window.confirm(`Remove ${bulk.selectedIds.length} item(s) from the buy list?`)) return;
    setBulkBusy(true);
    try {
      const res = await postBuyBulkDelete(tok, actor, bulk.selectedIds);
      showBanner("ok", `Removed ${res.count} item(s).`);
      bulk.clear();
      await loadList();
    } catch (e) {
      showBanner("err", e instanceof Error ? e.message : String(e));
    } finally {
      setBulkBusy(false);
    }
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

      await postBuyItem(tok, actor, {
        name,
        quantity: addQty.trim() || undefined,
        store: addStore.trim() || undefined,
        tags: tagsPayload,
        notes: addNotes.trim() || undefined,
        assignedTo: addAssigned.trim() || undefined,
      });
      setAddName("");
      setAddQty("1");
      setAddStore("");
      setAddTags("");
      setAddTagPick([]);
      setAddNotes("");
      setAddAssigned("");
      setListPage(0);
      showBanner("ok", "Item added.");
      const res = await getBuyItems(tok, 0, { tag: filterTag || undefined, sort: sortBy });
      setData(res);
    } catch (err) {
      showBanner("err", err instanceof Error ? err.message : String(err));
    } finally {
      setAddSubmitting(false);
    }
  }

  async function handleComplete(item: BuyListItem) {
    if (!canActor) {
      showBanner("err", "Set actorUserId in Settings to complete items.");
      return;
    }
    setActionBusyId(item.id);
    try {
      await postBuyItemComplete(tok, actor, item.id);
      undoToast(`Completed “${item.name}”.`, () => void loadList());
      await loadList();
    } catch (err) {
      showBanner("err", err instanceof Error ? err.message : String(err));
    } finally {
      setActionBusyId(null);
    }
  }

  async function handleDelete(item: BuyListItem) {
    if (!canActor) {
      showBanner("err", "Set actorUserId in Settings to remove items.");
      return;
    }
    if (!window.confirm(`Remove “${item.name}” from the list?`)) return;
    setActionBusyId(item.id);
    try {
      await deleteBuyItem(tok, actor, item.id);
      undoToast(`Removed “${item.name}”.`, () => void loadList());
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
      await loadList();
    } catch (err) {
      showBanner("err", err instanceof Error ? err.message : String(err));
    } finally {
      setUndoBusy(false);
    }
  }

  async function handleClearCompleted() {
    if (!canAuth) return;
    if (!window.confirm("Delete all completed buy items from history? This cannot be undone.")) return;
    setClearBusy(true);
    try {
      await deleteBuyCompleted(tok);
      showBanner("ok", "Completed items cleared.");
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
      const r = await putBuyTagCatalog(tok, draftCatalogTags);
      setCatalogTags(r.tags);
      setDraftCatalogTags([...r.tags]);
      setFilterTag((ft) => (ft && !r.tags.includes(ft) ? "" : ft));
      setAddTagPick((picked) => picked.filter((p) => r.tags.includes(p)));
      showBanner("ok", "Tag catalog saved. New items may only use these tags.");
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

  return (
    <div className="mx-auto min-w-0 max-w-3xl px-3 pb-10 sm:px-4">
      <header className="mb-6 border-b border-slate-800 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Buy list</h1>
        <p className="mt-1 text-sm text-slate-400">
          Active items only. Optional tag catalog restricts labels; filter and sort the list below.
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
          to add, complete, or delete items. You can use the server roster to pick your account.
        </div>
      )}

      {/* Tag catalog */}
      {canAuth && (
        <section
          aria-labelledby="tags-heading"
          className="mb-6 hb-card p-4 sm:p-5"
        >
          <h2 id="tags-heading" className="text-lg font-semibold text-white">
            Tag catalog
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            When you save at least one tag here, only those tags can be stored on new items (unknown tags are dropped).
            Until then, free-form comma tags still work.
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
              <label htmlFor="new-catalog-tag" className="mb-1 block text-xs font-medium text-slate-400">
                New tag
              </label>
              <input
                id="new-catalog-tag"
                value={newCatalogTag}
                onChange={(e) => setNewCatalogTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    appendDraftTag();
                  }
                }}
                placeholder="e.g. groceries"
                className="box-border min-w-0 w-full max-w-full hb-input px-3 py-2.5 text-base text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <button
              type="button"
              onClick={() => appendDraftTag()}
              className="min-h-[44px] shrink-0 rounded-lg hb-btn-soft px-4 py-2 text-sm text-slate-100 hover:bg-slate-700"
            >
              Add to draft
            </button>
            <button
              type="button"
              disabled={catalogBusy}
              onClick={() => void handleSaveCatalog()}
              className="min-h-[44px] shrink-0 rounded-lg border border-blue-500/60 bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-2 text-sm font-medium text-white hover:from-blue-500 hover:to-blue-600 disabled:opacity-50"
            >
              {catalogBusy ? "Saving…" : "Save catalog"}
            </button>
          </div>
        </section>
      )}

      {/* Filter + sort */}
      {canAuth && (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="buy-filter-tag" className="mb-1 block text-xs font-medium text-slate-400">
              Filter by tag
            </label>
            <select
              id="buy-filter-tag"
              value={filterTag}
              onChange={(e) => {
                setFilterTag(e.target.value);
                setListPage(0);
              }}
              className="h-11 w-full hb-input px-3 text-base text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">All items</option>
              {catalogTags.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="buy-filter-store" className="mb-1 block text-xs font-medium text-slate-400">
              Filter by store
            </label>
            <input
              id="buy-filter-store"
              value={filterStore}
              onChange={(e) => {
                setFilterStore(e.target.value);
                setListPage(0);
              }}
              placeholder="e.g. Costco"
              className="h-11 w-full hb-input px-3 text-base text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="buy-filter-assigned" className="mb-1 block text-xs font-medium text-slate-400">
              Assigned to
            </label>
            <select
              id="buy-filter-assigned"
              value={filterAssigned}
              onChange={(e) => {
                setFilterAssigned(e.target.value);
                setListPage(0);
              }}
              className="h-11 w-full hb-input px-3 text-base text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Anyone</option>
              {guildRoster.data?.available &&
                guildRoster.data.members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.displayName}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label htmlFor="buy-sort" className="mb-1 block text-xs font-medium text-slate-400">
              Sort by
            </label>
            <select
              id="buy-sort"
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value as BuyListSort);
                setListPage(0);
              }}
              className="h-11 w-full hb-input px-3 text-base text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="id">List order (id)</option>
              <option value="name">Name</option>
              <option value="store">Store</option>
              <option value="assigned">Assigned to</option>
              <option value="created">Created time</option>
              <option value="tags">Tags (text)</option>
            </select>
          </div>
        </div>
      )}

      {/* Add item */}
      <section
        aria-labelledby="add-heading"
        className="mb-8 min-w-0 max-w-full overflow-x-hidden hb-card p-4 shadow-sm sm:p-5"
      >
        <h2 id="add-heading" className="text-lg font-semibold text-white">
          Add an item
        </h2>
        <form onSubmit={(e) => void handleAdd(e)} className="mt-4 min-w-0 space-y-4">
          <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="buy-add-name" className="mb-1 block text-xs font-medium text-slate-400">
                Name <span className="text-red-400">*</span>
              </label>
              <input
                id="buy-add-name"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="Milk, bread, …"
                autoComplete="off"
                className="box-border min-w-0 w-full max-w-full hb-input px-3 py-2.5 text-base text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label htmlFor="buy-add-qty" className="mb-1 block text-xs font-medium text-slate-400">
                Quantity
              </label>
              <input
                id="buy-add-qty"
                value={addQty}
                onChange={(e) => setAddQty(e.target.value)}
                className="box-border min-w-0 w-full max-w-full hb-input px-3 py-2.5 text-base text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label htmlFor="buy-add-store" className="mb-1 block text-xs font-medium text-slate-400">
                Store
              </label>
              <input
                id="buy-add-store"
                value={addStore}
                onChange={(e) => setAddStore(e.target.value)}
                className="box-border min-w-0 w-full max-w-full hb-input px-3 py-2.5 text-base text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
                <>
                  <label htmlFor="buy-add-tags" className="sr-only">
                    Tags (comma-separated)
                  </label>
                  <input
                    id="buy-add-tags"
                    value={addTags}
                    onChange={(e) => setAddTags(e.target.value)}
                    placeholder="comma-separated (no catalog yet)"
                    className="box-border min-w-0 w-full max-w-full hb-input px-3 py-2.5 text-base text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </>
              )}
              {catalogTags.length > 0 && (
                <p className="mt-1 text-xs text-slate-500">Tap one or more. Only catalog tags are sent.</p>
              )}
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="buy-add-notes" className="mb-1 block text-xs font-medium text-slate-400">
                Notes
              </label>
              <textarea
                id="buy-add-notes"
                value={addNotes}
                onChange={(e) => setAddNotes(e.target.value)}
                rows={2}
                className="box-border min-w-0 w-full max-w-full resize-y hb-input px-3 py-2.5 text-base text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="sm:col-span-2">
              <MemberIdField
                id="buy-add-assigned"
                token={tok}
                value={addAssigned}
                onChange={setAddAssigned}
                label="Assign to"
                sharedRoster={guildRoster}
                actorId={actor}
              />
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-500">Adding requires actorUserId. Token uses bearer auth.</p>
            <button
              type="submit"
              disabled={addSubmitting || !canActor}
              className="min-h-[44px] w-full rounded-lg border border-blue-500/60 bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-2.5 text-sm font-medium text-white hover:from-blue-500 hover:to-blue-600 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:min-w-[140px]"
            >
              {addSubmitting ? "Adding…" : "Add to list"}
            </button>
          </div>
        </form>
      </section>

      {/* List */}
      <section aria-labelledby="list-heading">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="list-heading" className="text-lg font-semibold text-white">
              To buy
            </h2>
            {data && data.items.length > 0 && canActor && (
              <label className="flex items-center gap-2 text-sm text-slate-400">
                <input
                  type="checkbox"
                  checked={bulk.allOnPageSelected}
                  onChange={bulk.toggleAllOnPage}
                  className="h-4 w-4 rounded border-slate-600"
                />
                Select page
              </label>
            )}
          </div>
          {canAuth && (
            <button
              type="button"
              onClick={() => void loadList()}
              disabled={listLoading}
              className="min-h-[40px] rounded-lg hb-btn-soft px-3 py-2 text-sm text-slate-200 hover:bg-slate-700 disabled:opacity-50"
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

        {listLoading && !data && canAuth && (
          <p className="py-8 text-center text-slate-400">Loading…</p>
        )}

        {data && data.totalCount === 0 && !listLoading && (
          <p className="rounded-xl border border-dashed border-slate-700 bg-slate-900/30 px-4 py-10 text-center text-slate-400">
            Nothing on the list. Add an item above.
          </p>
        )}

        {data && data.items.length > 0 && (
          <>
            <BulkActionBar
              count={bulk.count}
              busy={bulkBusy}
              onComplete={() => void handleBulkComplete()}
              onDelete={() => void handleBulkDelete()}
              onClear={bulk.clear}
            />
          <ul className="space-y-3">
            {data.items.map((item) => (
              <li
                key={item.id}
                ref={item.id === highlightId ? highlightRef : undefined}
                className={`hb-card p-4 shadow-sm sm:p-5 ${highlightRowClass(item.id, highlightId)}`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  {canActor && editingId !== item.id && (
                    <label className="flex shrink-0 items-start pt-1">
                      <input
                        type="checkbox"
                        checked={bulk.selected.has(item.id)}
                        onChange={() => bulk.toggle(item.id)}
                        className="mt-1 h-4 w-4 rounded border-slate-600"
                        aria-label={`Select ${item.name}`}
                      />
                    </label>
                  )}
                  <div className="min-w-0 flex-1">
                {editingId === item.id ? (
                  <div className="space-y-3">
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full hb-input px-3 py-2 text-slate-100"
                    />
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input
                        value={editQty}
                        onChange={(e) => setEditQty(e.target.value)}
                        placeholder="Quantity"
                        className="hb-input px-3 py-2 text-slate-100"
                      />
                      <input
                        value={editStore}
                        onChange={(e) => setEditStore(e.target.value)}
                        placeholder="Store"
                        className="hb-input px-3 py-2 text-slate-100"
                      />
                    </div>
                    <textarea
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      rows={2}
                      placeholder="Notes"
                      className="w-full hb-input px-3 py-2 text-slate-100"
                    />
                    <input
                      value={editAssigned}
                      onChange={(e) => setEditAssigned(e.target.value)}
                      placeholder="Assigned to (Discord user id)"
                      className="w-full hb-input px-3 py-2 text-slate-100"
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
                        className="rounded-lg border border-blue-500/60 bg-gradient-to-r from-blue-600 to-blue-700 px-3 py-2 text-sm text-white"
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
                    {formatItemAge(item.createdAt) ? (
                      <p className="text-xs text-amber-400/90">{formatItemAge(item.createdAt)}</p>
                    ) : null}
                    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="text-xs uppercase tracking-wide text-slate-500">Quantity</dt>
                        <dd className="text-slate-200">{item.quantity || "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase tracking-wide text-slate-500">Store</dt>
                        <dd className="break-words text-slate-200">{item.store || "—"}</dd>
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
                        <dt className="text-xs uppercase tracking-wide text-slate-500">Assigned to</dt>
                        <dd className="text-slate-200">
                          {item.assignedToMemberLabel || "—"}
                          {item.assignedTo != null && (
                            <span className="mt-0.5 block font-mono text-xs text-slate-500">
                              {formatSnowflake(item.assignedTo)}
                            </span>
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase tracking-wide text-slate-500">Purchased by</dt>
                        <dd className="text-slate-200">
                          {item.purchasedByMemberLabel || "—"}
                          {item.purchasedBy != null && (
                            <span className="mt-0.5 block font-mono text-xs text-slate-500">
                              {formatSnowflake(item.purchasedBy)}
                            </span>
                          )}
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
                        className="min-h-[44px] w-full rounded-lg hb-btn-soft px-3 py-2.5 text-sm font-medium text-slate-100 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
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
                  </div>
                </div>
              </li>
            ))}
          </ul>
          </>
        )}

        {/* Pagination — Web UI only */}
        {data && data.totalCount > 0 && (
          <nav
            className="mt-6 flex min-w-0 flex-col items-stretch gap-4 border-t border-slate-800 pt-6 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
            aria-label="Buy list pages"
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
                className="min-h-[44px] min-w-0 flex-1 rounded-lg hb-btn-soft px-3 py-2 text-sm text-slate-100 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40 sm:min-w-[100px] sm:flex-none sm:px-4"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={!data.hasNext || listLoading}
                onClick={() => setListPage((p) => p + 1)}
                className="min-h-[44px] min-w-0 flex-1 rounded-lg hb-btn-soft px-3 py-2 text-sm text-slate-100 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40 sm:min-w-[100px] sm:flex-none sm:px-4"
              >
                Next
              </button>
            </div>
            <div className="flex flex-col gap-2 border-t border-slate-800/80 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-center text-xs text-slate-500 sm:text-left sm:max-w-md">
                Undo reverts the latest logged action for your actor (buy, money, wishlist, calendar, etc.), not only
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

      {canAuth && canActor && (
        <section className="mt-10 border-t border-slate-800 pt-8">
          <h3 className="text-base font-medium text-slate-300">Recurring items</h3>
          <p className="mt-1 text-sm text-slate-500">
            Automatically re-add to the buy list on a schedule (checked hourly on the server).
          </p>
          <ul className="mt-3 space-y-1 text-sm text-slate-400">
            {recurring.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2">
                <span className="text-slate-200">{r.name}</span>
                <span className="text-xs text-slate-500">
                  {r.cadence} · next {r.nextDueDate}
                </span>
                <button
                  type="button"
                  className="text-xs text-red-400 hover:underline"
                  disabled={recurBusy}
                  onClick={() => {
                    void (async () => {
                      setRecurBusy(true);
                      try {
                        await deleteBuyRecurring(tok, r.id);
                        const next = await getBuyRecurring(tok);
                        setRecurring(next.items);
                      } finally {
                        setRecurBusy(false);
                      }
                    })();
                  }}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              value={recurName}
              onChange={(e) => setRecurName(e.target.value)}
              placeholder="Item name"
              className="min-w-[10rem] flex-1 hb-input px-3 py-2 text-slate-100"
            />
            <select
              value={recurCadence}
              onChange={(e) => setRecurCadence(e.target.value as "weekly" | "daily")}
              className="hb-input px-2 py-2 text-slate-100"
            >
              <option value="weekly">Weekly</option>
              <option value="daily">Daily</option>
            </select>
            <button
              type="button"
              disabled={recurBusy || !recurName.trim()}
              className="rounded-lg hb-btn-soft px-4 py-2 text-sm text-slate-100 hover:bg-slate-700 disabled:opacity-50"
              onClick={() => {
                void (async () => {
                  setRecurBusy(true);
                  try {
                    await postBuyRecurring(tok, actor, {
                      name: recurName.trim(),
                      cadence: recurCadence,
                    });
                    setRecurName("");
                    const next = await getBuyRecurring(tok);
                    setRecurring(next.items);
                  } finally {
                    setRecurBusy(false);
                  }
                })();
              }}
            >
              Add recurring
            </button>
          </div>
        </section>
      )}

      {/* Clear completed — does not affect active list display */}
      {canAuth && (
        <section className="mt-10 border-t border-slate-800 pt-8">
          <h3 className="text-base font-medium text-slate-300">Completed history</h3>
          <p className="mt-1 text-sm text-slate-500">
            Remove all completed buy records from the database. Active items above are unchanged.
          </p>
          <button
            type="button"
            disabled={clearBusy}
            onClick={() => void handleClearCompleted()}
            className="mt-3 min-h-[44px] rounded-xl hb-btn-soft px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50"
          >
            {clearBusy ? "Working…" : "Clear all completed items"}
          </button>
        </section>
      )}
    </div>
  );
}
