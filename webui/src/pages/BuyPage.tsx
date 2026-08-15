import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import BulkActionBar from "../components/BulkActionBar";
import { useBulkSelection } from "../hooks/useBulkSelection";
import { useGuildRoster } from "../hooks/GuildRosterContext";
import { memberPickerLabel, memberUsername } from "../lib/memberDisplay";
import { useUndoToast } from "../hooks/useUndoToast";
import { validActorId } from "../lib/validation";
import { titleCase } from "../lib/titleCase";
import {
  deleteBuyCompleted,
  deleteBuyItem,
  getBuyItems,
  getBuyTagCatalog,
  getBuyStoreCatalog,
  getBuyRecurring,
  postBuyRecurring,
  deleteBuyRecurring,
  getStaleBuyItems,
  postBuyItem,
  postBuyItemComplete,
  postBuyBulkComplete,
  postBuyBulkDelete,
  postUndo,
  putBuyItem,
  putBuyTagCatalog,
  putBuyStoreCatalog,
  type BuyListItem,
  type BuyListSort,
  type BuyRecurringItem,
  type PagedBuyList,
} from "../api";
import { highlightRowClass, useSearchHighlightId } from "../lib/searchHighlight";
import BuyQuickAdd from "./buy/BuyQuickAdd";
import BuyItemRow from "./buy/BuyItemRow";
import BuyItemEditSheet from "./buy/BuyItemEditSheet";

const TAG_TOKEN = /^[a-z0-9_-]{1,48}$/;

function normalizeTagToken(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/^#+/, "");
  if (!s || !TAG_TOKEN.test(s)) return null;
  return s;
}

function normalizeStoreName(raw: string): string | null {
  const s = raw.trim().replace(/\s+/g, " ");
  if (!s || s.length > 50 || s.includes(",")) return null;
  return s;
}

type GroupMode = "all" | "store" | "tag";

export default function BuyPage() {
  const { token, actorUserId } = useAuth();
  const tok = token.trim();
  const actor = actorUserId.trim();
  const canAuth = tok.length > 0;
  const canActor = canAuth && validActorId(actor);
  const guildRoster = useGuildRoster();
  const [params] = useSearchParams();
  const highlightId = useSearchHighlightId();
  const highlightRef = useRef<HTMLLIElement>(null);
  const initialPage = Number.parseInt(params.get("page") ?? "0", 10);

  const [catalogTags, setCatalogTags] = useState<string[]>([]);
  const [draftCatalogTags, setDraftCatalogTags] = useState<string[]>([]);
  const [newCatalogTag, setNewCatalogTag] = useState("");
  const [catalogStores, setCatalogStores] = useState<string[]>([]);
  const [draftCatalogStores, setDraftCatalogStores] = useState<string[]>([]);
  const [newCatalogStore, setNewCatalogStore] = useState("");
  const [catalogBusy, setCatalogBusy] = useState(false);

  const [filterTag, setFilterTag] = useState("");
  const [filterAssigned, setFilterAssigned] = useState("");
  const [filterStore, setFilterStore] = useState("");
  const [sortBy, setSortBy] = useState<BuyListSort>("id");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [groupMode, setGroupMode] = useState<GroupMode>("all");

  const [listPage, setListPage] = useState(
    Number.isFinite(initialPage) && initialPage >= 0 ? initialPage : 0
  );
  const [data, setData] = useState<PagedBuyList | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [selectMode, setSelectMode] = useState(false);
  const [actionBusyId, setActionBusyId] = useState<number | null>(null);
  const [editItem, setEditItem] = useState<BuyListItem | null>(null);
  const [clearBusy, setClearBusy] = useState(false);

  const [recurring, setRecurring] = useState<BuyRecurringItem[]>([]);
  const [recurName, setRecurName] = useState("");
  const [recurCadence, setRecurCadence] = useState<"weekly" | "daily">("weekly");
  const [recurBusy, setRecurBusy] = useState(false);
  const [undoBusy, setUndoBusy] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [stale, setStale] = useState<{ days: number; count: number } | null>(null);

  const pageIds = useMemo(() => data?.items.map((i) => i.id) ?? [], [data?.items]);
  const bulk = useBulkSelection(pageIds);

  useEffect(() => {
    bulk.clear();
  }, [listPage, bulk.clear]);

  useEffect(() => {
    if (!highlightId || !data?.items.some((i) => i.id === highlightId)) return;
    highlightRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [highlightId, data]);

  const refreshCatalog = useCallback(async () => {
    if (!canAuth) {
      setCatalogTags([]);
      setDraftCatalogTags([]);
      setCatalogStores([]);
      setDraftCatalogStores([]);
      return;
    }
    setCatalogBusy(true);
    try {
      const [tags, stores] = await Promise.all([getBuyTagCatalog(tok), getBuyStoreCatalog(tok)]);
      setCatalogTags(tags.tags);
      setDraftCatalogTags([...tags.tags]);
      setCatalogStores(stores.stores);
      setDraftCatalogStores([...stores.stores]);
    } catch {
      setCatalogTags([]);
      setDraftCatalogTags([]);
      setCatalogStores([]);
      setDraftCatalogStores([]);
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
      setStale(null);
      return;
    }
    void getBuyRecurring(tok)
      .then((r) => setRecurring(r.items))
      .catch(() => setRecurring([]));
    void getStaleBuyItems(tok, 30, 50)
      .then((r) => setStale(r.items.length > 0 ? { days: r.days, count: r.items.length } : null))
      .catch(() => setStale(null));
  }, [canAuth, tok]);

  function showBanner(kind: "ok" | "err", text: string) {
    setBanner({ kind, text });
    window.setTimeout(() => setBanner(null), 5000);
  }

  const undoToast = useUndoToast();

  async function handleAdd(input: {
    name: string;
    quantity?: string;
    store?: string;
    tags?: string;
    notes?: string;
    assignedTo?: string;
  }) {
    if (!canActor) return;
    await postBuyItem(tok, actor, input);
    showBanner("ok", `Added “${input.name}”.`);
    setListPage(0);
    const res = await getBuyItems(tok, 0, { tag: filterTag || undefined, sort: sortBy });
    setData(res);
  }

  async function handleSaveEdit(
    item: BuyListItem,
    input: { name: string; quantity?: string; store?: string; notes?: string; assignedTo: string | null; tags?: string }
  ) {
    if (!canAuth) return;
    await putBuyItem(tok, item.id, input);
    showBanner("ok", "Item updated.");
    await loadList();
  }

  async function handleComplete(item: BuyListItem) {
    if (!canActor) {
      showBanner("err", "Set “Acting as” in Settings to check items off.");
      return;
    }
    setActionBusyId(item.id);
    try {
      await postBuyItemComplete(tok, actor, item.id);
      undoToast(`Bought “${titleCase(item.name)}”.`, () => void loadList());
      await loadList();
    } catch (err) {
      showBanner("err", err instanceof Error ? err.message : String(err));
    } finally {
      setActionBusyId(null);
    }
  }

  async function handleDelete(item: BuyListItem) {
    if (!canActor) return;
    setActionBusyId(item.id);
    try {
      await deleteBuyItem(tok, actor, item.id);
      undoToast(`Removed “${titleCase(item.name)}”.`, () => void loadList());
      await loadList();
    } catch (err) {
      showBanner("err", err instanceof Error ? err.message : String(err));
    } finally {
      setActionBusyId(null);
    }
  }

  async function handleBulkComplete() {
    if (!canActor || bulk.selectedIds.length === 0) return;
    setBulkBusy(true);
    try {
      const res = await postBuyBulkComplete(tok, actor, bulk.selectedIds);
      showBanner("ok", `Completed ${res.count} item(s).`);
      bulk.clear();
      setSelectMode(false);
      await loadList();
    } catch (e) {
      showBanner("err", e instanceof Error ? e.message : String(e));
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleBulkDelete() {
    if (!canActor || bulk.selectedIds.length === 0) return;
    setBulkBusy(true);
    try {
      const res = await postBuyBulkDelete(tok, actor, bulk.selectedIds);
      showBanner("ok", `Removed ${res.count} item(s).`);
      bulk.clear();
      setSelectMode(false);
      await loadList();
    } catch (e) {
      showBanner("err", e instanceof Error ? e.message : String(e));
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleUndo() {
    if (!canActor) {
      showBanner("err", "Set “Acting as” in Settings to use undo.");
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

  async function handleSaveCatalog() {
    if (!canAuth) return;
    setCatalogBusy(true);
    try {
      const r = await putBuyTagCatalog(tok, draftCatalogTags);
      setCatalogTags(r.tags);
      setDraftCatalogTags([...r.tags]);
      setFilterTag((ft) => (ft && !r.tags.includes(ft) ? "" : ft));
      showBanner("ok", "Tag catalog saved.");
      await loadList();
    } catch (err) {
      showBanner("err", err instanceof Error ? err.message : String(err));
    } finally {
      setCatalogBusy(false);
    }
  }

  function appendDraftStore() {
    const n = normalizeStoreName(newCatalogStore);
    if (!n) {
      showBanner("err", "Use 1–50 characters, no commas (e.g. Costco).");
      return;
    }
    if (draftCatalogStores.some((s) => s.toLowerCase() === n.toLowerCase())) {
      setNewCatalogStore("");
      return;
    }
    setDraftCatalogStores((d) => [...d, n].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })));
    setNewCatalogStore("");
  }

  async function handleSaveStoreCatalog() {
    if (!canAuth) return;
    setCatalogBusy(true);
    try {
      const r = await putBuyStoreCatalog(tok, draftCatalogStores);
      setCatalogStores(r.stores);
      setDraftCatalogStores([...r.stores]);
      setFilterStore((fs) => {
        if (!fs) return fs;
        if (r.stores.length === 0) return fs;
        const hit = r.stores.find((s) => s.toLowerCase() === fs.toLowerCase());
        return hit ?? "";
      });
      showBanner("ok", "Store catalog saved.");
      await loadList();
    } catch (err) {
      showBanner("err", err instanceof Error ? err.message : String(err));
    } finally {
      setCatalogBusy(false);
    }
  }

  const totalPages = data && data.pageSize > 0 ? Math.max(1, Math.ceil(data.totalCount / data.pageSize)) : 1;
  const rangeStart = data && data.items.length > 0 ? data.page * data.pageSize + 1 : 0;
  const rangeEnd = data ? data.page * data.pageSize + data.items.length : 0;

  const activeFilters = [filterTag, filterStore, filterAssigned].filter(Boolean).length;
  const items = useMemo(() => data?.items ?? [], [data?.items]);

  const groups = useMemo(() => {
    if (groupMode === "all" || items.length === 0) return [{ key: "", items }];
    const map = new Map<string, BuyListItem[]>();
    for (const item of items) {
      let keys: string[];
      if (groupMode === "store") {
        keys = [item.store?.trim() || "No store"];
      } else {
        keys = item.tags?.length ? item.tags : ["Untagged"];
      }
      for (const k of keys) {
        const arr = map.get(k) ?? [];
        arr.push(item);
        map.set(k, arr);
      }
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, groupItems]) => ({ key, items: groupItems }));
  }, [groupMode, items]);

  return (
    <div className="mx-auto min-w-0 max-w-3xl space-y-4 px-3 pb-10 sm:px-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Buy list</h1>
          <p className="mt-1 text-sm text-slate-400">
            {data ? `${data.totalCount} to buy` : "Loading…"}
            {stale ? ` · ${stale.count} sitting ${stale.days}+ days` : ""}
          </p>
        </div>
        {canAuth && (
          <div className="flex items-center gap-2">
            {canActor && items.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setSelectMode((m) => !m);
                  bulk.clear();
                }}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                  selectMode
                    ? "bg-gradient-to-r from-blue-600 to-blue-700 text-white"
                    : "hb-btn-soft text-slate-300"
                }`}
              >
                {selectMode ? "Done selecting" : "Select"}
              </button>
            )}
            <button
              type="button"
              onClick={() => void loadList()}
              disabled={listLoading}
              aria-label="Refresh list"
              className="rounded-lg hb-btn-soft px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700 disabled:opacity-50"
            >
              {listLoading ? "…" : "Refresh"}
            </button>
          </div>
        )}
      </header>

      {banner && (
        <div
          role="status"
          className={`rounded-lg border px-4 py-3 text-sm ${
            banner.kind === "ok"
              ? "border-emerald-800/60 bg-emerald-950/50 text-emerald-100"
              : "border-red-800/60 bg-red-950/40 text-red-100"
          }`}
        >
          {banner.text}
        </div>
      )}

      {!canAuth && (
        <div className="rounded-lg border border-amber-700/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">
          Sign in via{" "}
          <Link to="/settings" className="font-medium text-amber-50 underline">
            Settings
          </Link>{" "}
          to load the list.
        </div>
      )}

      {canAuth && !canActor && (
        <div className="rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-3 text-sm text-slate-300">
          Set <strong className="text-slate-100">“Acting as”</strong> in{" "}
          <Link to="/settings" className="text-blue-400 hover:underline">
            Settings
          </Link>{" "}
          to add, buy, or remove items.
        </div>
      )}

      {stale && stale.count > 0 && (
        <div className="rounded-lg border border-amber-800/50 bg-amber-950/30 px-4 py-2.5 text-sm text-amber-200">
          {stale.count} item{stale.count === 1 ? " has" : "s have"} been on the list for {stale.days}+ days — still
          needed?
        </div>
      )}

      {canAuth && (
        <BuyQuickAdd
          canActor={canActor}
          token={tok}
          actor={actor}
          roster={guildRoster}
          catalogTags={catalogTags}
          catalogStores={catalogStores}
          listItems={items}
          recurring={recurring}
          onAdd={handleAdd}
          onBanner={showBanner}
        />
      )}

      {canAuth && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-slate-700" role="group" aria-label="Group items">
            {(
              [
                ["all", "All"],
                ["store", "By store"],
                ["tag", "By tag"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setGroupMode(id)}
                className={`px-3 py-1.5 text-xs font-medium ${
                  groupMode === id
                    ? "bg-gradient-to-r from-blue-600 to-blue-700 text-white"
                    : "bg-slate-900/60 text-slate-400 hover:text-slate-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setFiltersOpen((o) => !o)}
            aria-expanded={filtersOpen}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
              activeFilters > 0
                ? "border border-blue-700/60 bg-blue-950/40 text-blue-200"
                : "hb-btn-soft text-slate-300"
            }`}
          >
            Filters{activeFilters > 0 ? ` (${activeFilters})` : ""}
          </button>
          {filterTag && (
            <button
              type="button"
              onClick={() => setFilterTag("")}
              className="flex items-center gap-1 rounded-full border border-blue-700/60 bg-blue-950/40 px-2.5 py-1 text-xs text-blue-100"
            >
              #{filterTag} <span aria-hidden>✕</span>
            </button>
          )}
          {filterStore && (
            <button
              type="button"
              onClick={() => setFilterStore("")}
              className="flex items-center gap-1 rounded-full border border-blue-700/60 bg-blue-950/40 px-2.5 py-1 text-xs text-blue-100"
            >
              {filterStore} <span aria-hidden>✕</span>
            </button>
          )}
          {filterAssigned && (
            <button
              type="button"
              onClick={() => setFilterAssigned("")}
              className="flex items-center gap-1 rounded-full border border-blue-700/60 bg-blue-950/40 px-2.5 py-1 text-xs text-blue-100"
            >
              Assigned: {memberUsername(guildRoster.data, filterAssigned, filterAssigned)}{" "}
              <span aria-hidden>✕</span>
            </button>
          )}
        </div>
      )}

      {canAuth && filtersOpen && (
        <div className="hb-card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="buy-filter-tag" className="mb-1 block text-xs font-medium text-slate-400">
              Tag
            </label>
            <select
              id="buy-filter-tag"
              value={filterTag}
              onChange={(e) => {
                setFilterTag(e.target.value);
                setListPage(0);
              }}
              className="h-10 w-full hb-input px-3 text-sm text-slate-100"
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
              Store
            </label>
            {catalogStores.length > 0 ? (
              <select
                id="buy-filter-store"
                value={filterStore}
                onChange={(e) => {
                  setFilterStore(e.target.value);
                  setListPage(0);
                }}
                className="h-10 w-full hb-input px-3 text-sm text-slate-100"
              >
                <option value="">All stores</option>
                {catalogStores.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id="buy-filter-store"
                value={filterStore}
                onChange={(e) => {
                  setFilterStore(e.target.value);
                  setListPage(0);
                }}
                placeholder="e.g. Costco"
                className="h-10 w-full hb-input px-3 text-sm text-slate-100"
              />
            )}
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
              className="h-10 w-full hb-input px-3 text-sm text-slate-100"
            >
              <option value="">Anyone</option>
              {guildRoster.data?.available &&
                guildRoster.data.members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {memberPickerLabel(m)}
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
              className="h-10 w-full hb-input px-3 text-sm text-slate-100"
            >
              <option value="id">List order</option>
              <option value="name">Name</option>
              <option value="store">Store</option>
              <option value="assigned">Assigned to</option>
              <option value="created">Newest</option>
              <option value="tags">Tags</option>
            </select>
          </div>
        </div>
      )}

      {listError && (
        <p className="rounded-lg border border-red-800/50 bg-red-950/30 px-3 py-2 text-sm text-red-200">{listError}</p>
      )}

      {listLoading && !data && canAuth && <p className="py-8 text-center text-slate-400">Loading…</p>}

      {data && data.totalCount === 0 && !listLoading && (
        <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/30 px-4 py-10 text-center">
          <p className="text-sm text-slate-400">
            {activeFilters > 0 ? "Nothing matches these filters." : "List is clear — add something above."}
          </p>
          {activeFilters > 0 && (
            <button
              type="button"
              onClick={() => {
                setFilterTag("");
                setFilterStore("");
                setFilterAssigned("");
              }}
              className="mt-3 rounded-lg hb-btn-soft px-4 py-2 text-sm text-slate-200"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {items.length > 0 && (
        <>
          {selectMode && (
            <BulkActionBar
              count={bulk.count}
              busy={bulkBusy}
              onComplete={() => void handleBulkComplete()}
              onDelete={() => void handleBulkDelete()}
              onClear={bulk.clear}
            />
          )}
          {groups.map((group) => (
            <section key={group.key || "all"} aria-label={group.key || "All items"}>
              {group.key && (
                <h2 className="mb-1 mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  {titleCase(group.key)}
                  <span className="ml-1.5 font-normal normal-case text-slate-600">{group.items.length}</span>
                </h2>
              )}
              <ul className="divide-y divide-slate-800 overflow-hidden rounded-xl border border-slate-800 bg-slate-950/40">
                {group.items.map((item) => (
                  <li
                    key={item.id}
                    ref={item.id === highlightId ? highlightRef : undefined}
                    className={highlightRowClass(item.id, highlightId)}
                  >
                    <BuyItemRow
                      item={item}
                      canActor={canActor}
                      busy={actionBusyId === item.id}
                      selectMode={selectMode}
                      selected={bulk.selected.has(item.id)}
                      onToggleSelect={() => bulk.toggle(item.id)}
                      onComplete={() => void handleComplete(item)}
                      onEdit={() => setEditItem(item)}
                      onDelete={() => void handleDelete(item)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}

          {data && data.totalCount > data.pageSize && (
            <nav className="flex items-center justify-between gap-3 pt-2" aria-label="Buy list pages">
              <p className="text-xs text-slate-500">
                {rangeStart}–{rangeEnd} of {data.totalCount} · page {data.page + 1} of {totalPages}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={!data.hasPrev || listLoading}
                  onClick={() => setListPage((p) => Math.max(0, p - 1))}
                  className="rounded-lg hb-btn-soft px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-40"
                >
                  ← Newer
                </button>
                <button
                  type="button"
                  disabled={!data.hasNext || listLoading}
                  onClick={() => setListPage((p) => p + 1)}
                  className="rounded-lg hb-btn-soft px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-40"
                >
                  Older →
                </button>
              </div>
            </nav>
          )}
        </>
      )}

      {canAuth && (
        <details className="hb-card group p-4">
          <summary className="cursor-pointer list-none text-sm font-medium text-slate-300 marker:hidden">
            <span className="inline-block transition-transform group-open:rotate-90">▸</span> Manage list{" "}
            <span className="text-xs font-normal text-slate-500">tags, stores, recurring, undo, cleanup</span>
          </summary>

          <div className="mt-4 space-y-6 border-t border-slate-800 pt-4">
            <section aria-labelledby="tags-heading">
              <h2 id="tags-heading" className="text-sm font-semibold text-white">
                Tag catalog
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Once saved, new items can only use these tags (unknown tags are dropped).
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {draftCatalogTags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 rounded-full bg-slate-700 px-3 py-1 text-sm text-slate-100"
                  >
                    {t}
                    <button
                      type="button"
                      className="rounded p-0.5 text-slate-300 hover:bg-slate-600 hover:text-white"
                      onClick={() => setDraftCatalogTags((d) => d.filter((x) => x !== t))}
                      aria-label={`Remove ${t}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
                {draftCatalogTags.length === 0 && <span className="text-sm text-slate-500">No tags yet.</span>}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <input
                  value={newCatalogTag}
                  onChange={(e) => setNewCatalogTag(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      appendDraftTag();
                    }
                  }}
                  placeholder="e.g. groceries"
                  aria-label="New catalog tag"
                  className="min-w-[10rem] flex-1 hb-input px-3 py-2 text-sm text-slate-100"
                />
                <button
                  type="button"
                  onClick={appendDraftTag}
                  className="rounded-lg hb-btn-soft px-3 py-2 text-sm text-slate-200"
                >
                  Add
                </button>
                <button
                  type="button"
                  disabled={catalogBusy}
                  onClick={() => void handleSaveCatalog()}
                  className="rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {catalogBusy ? "Saving…" : "Save catalog"}
                </button>
              </div>
            </section>

            <section aria-labelledby="stores-heading">
              <h2 id="stores-heading" className="text-sm font-semibold text-white">
                Store catalog
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Once saved, new items can only use these stores (unknown stores are dropped). Leave empty to keep
                typing any store name.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {draftCatalogStores.map((s) => (
                  <span
                    key={s}
                    className="inline-flex items-center gap-1 rounded-full bg-slate-700 px-3 py-1 text-sm text-slate-100"
                  >
                    {s}
                    <button
                      type="button"
                      className="rounded p-0.5 text-slate-300 hover:bg-slate-600 hover:text-white"
                      onClick={() => setDraftCatalogStores((d) => d.filter((x) => x !== s))}
                      aria-label={`Remove ${s}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
                {draftCatalogStores.length === 0 && <span className="text-sm text-slate-500">No stores yet.</span>}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <input
                  value={newCatalogStore}
                  onChange={(e) => setNewCatalogStore(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      appendDraftStore();
                    }
                  }}
                  placeholder="e.g. Costco"
                  aria-label="New catalog store"
                  className="min-w-[10rem] flex-1 hb-input px-3 py-2 text-sm text-slate-100"
                />
                <button
                  type="button"
                  onClick={appendDraftStore}
                  className="rounded-lg hb-btn-soft px-3 py-2 text-sm text-slate-200"
                >
                  Add
                </button>
                <button
                  type="button"
                  disabled={catalogBusy}
                  onClick={() => void handleSaveStoreCatalog()}
                  className="rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {catalogBusy ? "Saving…" : "Save catalog"}
                </button>
              </div>
            </section>

            {canActor && (
              <section aria-labelledby="recurring-heading">
                <h2 id="recurring-heading" className="text-sm font-semibold text-white">
                  Recurring staples
                </h2>
                <p className="mt-1 text-xs text-slate-500">Re-added to the list automatically on a schedule.</p>
                <ul className="mt-2 space-y-1 text-sm text-slate-400">
                  {recurring.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center gap-2">
                      <span className="text-slate-200">{titleCase(r.name)}</span>
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
                  {recurring.length === 0 && <li className="text-xs text-slate-600">None yet.</li>}
                </ul>
                <div className="mt-2 flex flex-wrap gap-2">
                  <input
                    value={recurName}
                    onChange={(e) => setRecurName(e.target.value)}
                    placeholder="Item name"
                    className="min-w-[10rem] flex-1 hb-input px-3 py-2 text-sm text-slate-100"
                  />
                  <select
                    value={recurCadence}
                    onChange={(e) => setRecurCadence(e.target.value as "weekly" | "daily")}
                    className="hb-input px-2 py-2 text-sm text-slate-100"
                  >
                    <option value="weekly">Weekly</option>
                    <option value="daily">Daily</option>
                  </select>
                  <button
                    type="button"
                    disabled={recurBusy || !recurName.trim()}
                    className="rounded-lg hb-btn-soft px-4 py-2 text-sm text-slate-200 disabled:opacity-50"
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

            <section aria-labelledby="maintenance-heading">
              <h2 id="maintenance-heading" className="text-sm font-semibold text-white">
                Maintenance
              </h2>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!canActor || undoBusy || listLoading}
                  onClick={() => void handleUndo()}
                  title="Reverts the latest logged action for your actor (buy, money, wishlist, calendar…)"
                  className="rounded-lg hb-btn-soft px-3 py-2 text-sm text-slate-200 disabled:opacity-40"
                >
                  {undoBusy ? "Undoing…" : "Undo last action"}
                </button>
                <button
                  type="button"
                  disabled={clearBusy}
                  onClick={() => void handleClearCompleted()}
                  title="Deletes completed buy records from history"
                  className="rounded-lg hb-btn-soft px-3 py-2 text-sm text-slate-300 disabled:opacity-50"
                >
                  {clearBusy ? "Working…" : "Clear completed history"}
                </button>
              </div>
            </section>
          </div>
        </details>
      )}

      <BuyItemEditSheet
        item={editItem}
        token={tok}
        actor={actor}
        roster={guildRoster}
        catalogTags={catalogTags}
        catalogStores={catalogStores}
        onClose={() => setEditItem(null)}
        onSave={handleSaveEdit}
      />
    </div>
  );
}
