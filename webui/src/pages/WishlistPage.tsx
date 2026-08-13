import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import BulkActionBar from "../components/BulkActionBar";
import { useBulkSelection } from "../hooks/useBulkSelection";
import { useGuildRoster } from "../hooks/GuildRosterContext";
import { memberPickerLabel, memberUsername } from "../lib/memberDisplay";
import { validActorId } from "../lib/validation";
import { titleCase } from "../lib/titleCase";
import { layerForAssignee } from "../lib/personLayers";
import {
  deleteWishlistCompleted,
  deleteWishlistItem,
  getWishlistItems,
  getWishlistOwners,
  getWishlistTagCatalog,
  postWishlistItem,
  postWishlistItemComplete,
  postWishlistBulkComplete,
  postWishlistBulkDelete,
  postWishlistAddToBuy,
  postUndo,
  putWishlistItem,
  putWishlistTagCatalog,
  type PagedWishlistList,
  type WishlistListItem,
  type WishlistListSort,
  type WishlistOwnerRow,
} from "../api";
import { highlightRowClass, useSearchHighlightId } from "../lib/searchHighlight";
import WishQuickAdd, { type WishOwnerOption } from "./wishlist/WishQuickAdd";
import WishCard from "./wishlist/WishCard";
import WishEditSheet from "./wishlist/WishEditSheet";
import { parsePriceNumber } from "./wishlist/wishUtils";

const TAG_TOKEN = /^[a-z0-9_-]{1,48}$/;

function normalizeTagToken(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/^#+/, "");
  if (!s || !TAG_TOKEN.test(s)) return null;
  return s;
}

type GroupMode = "all" | "owner" | "tag";

export default function WishlistPage() {
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
  const [catalogBusy, setCatalogBusy] = useState(false);

  const [dbOwners, setDbOwners] = useState<WishlistOwnerRow[]>([]);

  const [ownerFilter, setOwnerFilter] = useState("");
  const [filterTag, setFilterTag] = useState("");
  const [sortBy, setSortBy] = useState<WishlistListSort>("id");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [groupMode, setGroupMode] = useState<GroupMode>("all");

  const [listPage, setListPage] = useState(
    Number.isFinite(initialPage) && initialPage >= 0 ? initialPage : 0
  );
  const [data, setData] = useState<PagedWishlistList | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [selectMode, setSelectMode] = useState(false);
  const [actionBusyId, setActionBusyId] = useState<number | null>(null);
  const [editItem, setEditItem] = useState<WishlistListItem | null>(null);
  const [clearBusy, setClearBusy] = useState(false);
  const [undoBusy, setUndoBusy] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const pageIds = useMemo(() => data?.items.map((i) => i.id) ?? [], [data?.items]);
  const bulk = useBulkSelection(pageIds);

  useEffect(() => {
    bulk.clear();
  }, [listPage, bulk.clear]);

  useEffect(() => {
    if (!highlightId || !data?.items.some((i) => i.id === highlightId)) return;
    highlightRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [highlightId, data]);

  const ownerPickerOptions = useMemo<WishOwnerOption[]>(() => {
    const base: WishOwnerOption[] = [{ value: "", label: "Default (actor / you)" }];
    const seen = new Set<string>([""]);
    const r = guildRoster.data;
    if (r?.available && r.members.length > 0) {
      for (const m of r.members) {
        seen.add(m.userId);
        base.push({ value: m.userId, label: memberPickerLabel(m) });
      }
    }
    for (const o of dbOwners) {
      if (!seen.has(o.userId)) {
        seen.add(o.userId);
        base.push({ value: o.userId, label: memberUsername(guildRoster.data, o.userId, o.label) || o.userId });
      }
    }
    return base;
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

  async function handleAdd(input: {
    name: string;
    ownerUserId?: string;
    price?: string;
    link?: string;
    description?: string;
    notes?: string;
    priority?: string;
    tags?: string;
  }) {
    if (!canActor) return;
    try {
      await postWishlistItem(tok, actor, input);
      showBanner("ok", `Added “${input.name}”.`);
      setListPage(0);
      await refreshDbOwners();
      const res = await getWishlistItems(tok, 0, {
        owner: ownerFilter || undefined,
        tag: filterTag || undefined,
        sort: sortBy,
      });
      setData(res);
    } catch (err) {
      showBanner("err", err instanceof Error ? err.message : String(err));
      throw err;
    }
  }

  async function handleSaveEdit(
    item: WishlistListItem,
    input: {
      name: string;
      ownerUserId?: string;
      price?: string;
      link?: string;
      description?: string;
      notes?: string;
      priority?: string;
      tags?: string;
    }
  ) {
    if (!canAuth) return;
    try {
      await putWishlistItem(tok, item.id, input);
      showBanner("ok", "Wish updated.");
      await refreshDbOwners();
      await loadList();
    } catch (err) {
      showBanner("err", err instanceof Error ? err.message : String(err));
      throw err;
    }
  }

  async function handleAddToBuy(item: WishlistListItem) {
    if (!canActor) return;
    setActionBusyId(item.id);
    try {
      await postWishlistAddToBuy(tok, actor, item.id);
      showBanner("ok", `Added “${titleCase(item.name)}” to the buy list.`);
    } catch (e) {
      showBanner("err", e instanceof Error ? e.message : String(e));
    } finally {
      setActionBusyId(null);
    }
  }

  async function handleComplete(item: WishlistListItem) {
    if (!canActor) {
      showBanner("err", "Set “Acting as” in Settings to complete wishes.");
      return;
    }
    setActionBusyId(item.id);
    try {
      await postWishlistItemComplete(tok, actor, item.id);
      showBanner("ok", `“${titleCase(item.name)}” — nice!`);
      await refreshDbOwners();
      await loadList();
    } catch (err) {
      showBanner("err", err instanceof Error ? err.message : String(err));
    } finally {
      setActionBusyId(null);
    }
  }

  async function handleDelete(item: WishlistListItem) {
    if (!canActor) return;
    setActionBusyId(item.id);
    try {
      await deleteWishlistItem(tok, actor, item.id);
      showBanner("ok", `Removed “${titleCase(item.name)}”.`);
      await refreshDbOwners();
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
      const res = await postWishlistBulkComplete(tok, actor, bulk.selectedIds);
      showBanner("ok", `Completed ${res.count} wish(es).`);
      bulk.clear();
      setSelectMode(false);
      await refreshDbOwners();
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
      const res = await postWishlistBulkDelete(tok, actor, bulk.selectedIds);
      showBanner("ok", `Removed ${res.count} wish(es).`);
      bulk.clear();
      setSelectMode(false);
      await refreshDbOwners();
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
      const r = await putWishlistTagCatalog(tok, draftCatalogTags);
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

  const totalPages = data && data.pageSize > 0 ? Math.max(1, Math.ceil(data.totalCount / data.pageSize)) : 1;
  const rangeStart = data && data.items.length > 0 ? data.page * data.pageSize + 1 : 0;
  const rangeEnd = data ? data.page * data.pageSize + data.items.length : 0;

  const rosterHint =
    guildRoster.data?.available === false
      ? "Discord roster unavailable — owner lists use people who already have wishes."
      : null;

  const items = useMemo(() => data?.items ?? [], [data?.items]);

  const totalValue = useMemo(() => {
    let sum = 0;
    let any = false;
    for (const i of items) {
      const n = parsePriceNumber(i.price);
      if (n != null) {
        sum += n;
        any = true;
      }
    }
    return any ? sum : null;
  }, [items]);

  const ownerChips = useMemo(() => {
    const seen = new Set<string>();
    const chips: { userId: string; label: string }[] = [];
    for (const o of dbOwners) {
      if (!seen.has(o.userId)) {
        seen.add(o.userId);
        chips.push({ userId: o.userId, label: memberUsername(guildRoster.data, o.userId, o.label) || o.userId });
      }
    }
    return chips;
  }, [dbOwners, guildRoster.data]);

  const groups = useMemo(() => {
    if (groupMode === "all" || items.length === 0) return [{ key: "", items }];
    const map = new Map<string, WishlistListItem[]>();
    for (const item of items) {
      let keys: string[];
      if (groupMode === "owner") {
        keys = [memberUsername(guildRoster.data, item.owner, item.ownerMemberLabel) || "Unknown owner"];
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
  }, [groupMode, items, guildRoster.data]);

  return (
    <div className="mx-auto min-w-0 max-w-3xl space-y-4 px-3 pb-10 sm:px-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Wishlist</h1>
          <p className="mt-1 text-sm text-slate-400">
            {data ? `${data.totalCount} wish${data.totalCount === 1 ? "" : "es"}` : "Loading…"}
            {totalValue != null
              ? ` · ≈$${totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })} on this page`
              : ""}
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
          to add, gift, or remove wishes.
        </div>
      )}

      {rosterHint && <p className="text-xs text-amber-200/90">{rosterHint}</p>}

      {canAuth && (
        <WishQuickAdd
          canActor={canActor}
          catalogTags={catalogTags}
          ownerOptions={ownerPickerOptions}
          onAdd={handleAdd}
          onBanner={showBanner}
        />
      )}

      {canAuth && ownerChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setOwnerFilter("");
              setListPage(0);
            }}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              ownerFilter === ""
                ? "border-blue-600 bg-blue-950/50 text-blue-100"
                : "border-slate-700 bg-slate-900/60 text-slate-400 hover:text-slate-200"
            }`}
          >
            Everyone
          </button>
          {ownerChips.map((o) => {
            const on = ownerFilter === o.userId;
            const layer = layerForAssignee(o.userId);
            return (
              <button
                key={o.userId}
                type="button"
                onClick={() => {
                  setOwnerFilter(on ? "" : o.userId);
                  setListPage(0);
                }}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
                  on
                    ? "border-blue-600 bg-blue-950/50 text-blue-100"
                    : "border-slate-700 bg-slate-900/60 text-slate-400 hover:text-slate-200"
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${layer.dot}`} aria-hidden />
                {o.label}
              </button>
            );
          })}
        </div>
      )}

      {canAuth && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-slate-700" role="group" aria-label="Group wishes">
            {(
              [
                ["all", "All"],
                ["owner", "By owner"],
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
              filterTag ? "border border-blue-700/60 bg-blue-950/40 text-blue-200" : "hb-btn-soft text-slate-300"
            }`}
          >
            Filters{filterTag ? " (1)" : ""}
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
        </div>
      )}

      {canAuth && filtersOpen && (
        <div className="hb-card grid gap-3 p-4 sm:grid-cols-2">
          <div>
            <label htmlFor="wl-filter-tag" className="mb-1 block text-xs font-medium text-slate-400">
              Tag
            </label>
            <select
              id="wl-filter-tag"
              value={filterTag}
              onChange={(e) => {
                setFilterTag(e.target.value);
                setListPage(0);
              }}
              className="h-10 w-full hb-input px-3 text-sm text-slate-100"
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
              className="h-10 w-full hb-input px-3 text-sm text-slate-100"
            >
              <option value="id">List order</option>
              <option value="priority">Most wanted</option>
              <option value="price">Price</option>
              <option value="name">Name</option>
              <option value="owner">Owner</option>
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
            {ownerFilter || filterTag ? "No wishes match these filters." : "No wishes yet — add one above."}
          </p>
          {(ownerFilter || filterTag) && (
            <button
              type="button"
              onClick={() => {
                setOwnerFilter("");
                setFilterTag("");
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
            <section key={group.key || "all"} aria-label={group.key || "All wishes"}>
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
                    <WishCard
                      item={item}
                      canActor={canActor}
                      busy={actionBusyId === item.id}
                      selectMode={selectMode}
                      selected={bulk.selected.has(item.id)}
                      onToggleSelect={() => bulk.toggle(item.id)}
                      onComplete={() => void handleComplete(item)}
                      onAddToBuy={() => void handleAddToBuy(item)}
                      onEdit={() => setEditItem(item)}
                      onDelete={() => void handleDelete(item)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}

          {data && data.totalCount > data.pageSize && (
            <nav className="flex items-center justify-between gap-3 pt-2" aria-label="Wishlist pages">
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
            <span className="inline-block transition-transform group-open:rotate-90">▸</span> Manage wishlist{" "}
            <span className="text-xs font-normal text-slate-500">tags, undo, cleanup</span>
          </summary>

          <div className="mt-4 space-y-6 border-t border-slate-800 pt-4">
            <section aria-labelledby="wl-tags-heading">
              <h2 id="wl-tags-heading" className="text-sm font-semibold text-white">
                Tag catalog
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Once saved, new wishes can only use these tags (same rules as Buy).
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
                  placeholder="e.g. birthday"
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

            <section aria-labelledby="wl-maint-heading">
              <h2 id="wl-maint-heading" className="text-sm font-semibold text-white">
                Maintenance
              </h2>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!canActor || undoBusy || listLoading}
                  onClick={() => void handleUndo()}
                  title="Reverts the latest logged action for your actor (wishlist, buy, money, calendar…)"
                  className="rounded-lg hb-btn-soft px-3 py-2 text-sm text-slate-200 disabled:opacity-40"
                >
                  {undoBusy ? "Undoing…" : "Undo last action"}
                </button>
                <button
                  type="button"
                  disabled={clearBusy}
                  onClick={() => void handleClearCompleted()}
                  title="Deletes completed wishlist rows from history"
                  className="rounded-lg hb-btn-soft px-3 py-2 text-sm text-slate-300 disabled:opacity-50"
                >
                  {clearBusy ? "Working…" : "Clear completed history"}
                </button>
              </div>
            </section>
          </div>
        </details>
      )}

      <WishEditSheet
        item={editItem}
        catalogTags={catalogTags}
        ownerOptions={ownerPickerOptions}
        onClose={() => setEditItem(null)}
        onSave={handleSaveEdit}
      />
    </div>
  );
}
