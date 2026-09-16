import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import type { BudgetCategory } from "../../api";
import { categoryDotStyle } from "../../lib/budgetMoney";
import { filterCategories } from "../../lib/categorySearch";
import { measureComboboxMenu, type ComboboxMenuPos } from "../../lib/comboboxPosition";

type Props = {
  categories: BudgetCategory[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  allowEmpty?: boolean;
  id?: string;
};

type Row = { id: string; category: BudgetCategory | null };

function buildRows(categories: BudgetCategory[], query: string, allowEmpty: boolean): Row[] {
  const filtered = filterCategories(categories, query).map((category) => ({
    id: String(category.id),
    category,
  }));
  if (allowEmpty && !query.trim()) return [{ id: "", category: null }, ...filtered];
  return filtered;
}

/** Searchable category picker — native selects can't host a search field. */
export default function CategorySelect({
  categories,
  value,
  onChange,
  placeholder = "Choose category",
  disabled = false,
  required = false,
  className = "",
  allowEmpty = true,
  id,
}: Props) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [pos, setPos] = useState<ComboboxMenuPos | null>(null);

  const selected = categories.find((c) => String(c.id) === value);
  const rows = buildRows(categories, query, allowEmpty);

  function updatePos() {
    const el = rootRef.current;
    if (!el) return;
    setPos(measureComboboxMenu(el));
  }

  useLayoutEffect(() => {
    if (!open) return;
    updatePos();
    const onWin = () => updatePos();
    window.addEventListener("resize", onWin);
    window.visualViewport?.addEventListener("resize", onWin);
    window.visualViewport?.addEventListener("scroll", onWin);
    document.addEventListener("scroll", onWin, true);
    return () => {
      window.removeEventListener("resize", onWin);
      window.visualViewport?.removeEventListener("resize", onWin);
      window.visualViewport?.removeEventListener("scroll", onWin);
      document.removeEventListener("scroll", onWin, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    const found = categories.findIndex((c) => String(c.id) === value);
    setActiveIndex(allowEmpty ? (found >= 0 ? found + 1 : 0) : Math.max(0, found));
    const t = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || query === "") return;
    setActiveIndex(0);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    const el = document.getElementById(`${listId}-opt-${activeIndex}`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open, listId]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  function pick(id: string) {
    onChange(id);
    setOpen(false);
  }

  function onSearchKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(rows.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const row = rows[activeIndex];
      if (row) pick(row.id);
    }
  }

  const searchInput = (
    <input
      ref={searchRef}
      type="search"
      value={query}
      onChange={(e) => setQuery(e.target.value)}
      onKeyDown={onSearchKey}
      placeholder="Search categories…"
      aria-label="Search categories"
      aria-controls={listId}
      className="w-full rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
    />
  );

  const listBlock = (
    <ul
      id={listId}
      role="listbox"
      aria-label="Categories"
      className="min-h-0 flex-1 overflow-y-auto py-1"
    >
      {rows.length === 0 ? (
        <li className="px-3 py-2 text-sm text-slate-500">No categories match.</li>
      ) : (
        rows.map((row, i) => {
          const isEmpty = row.category == null;
          const cat = row.category;
          const isActive = i === activeIndex;
          const isSelected = row.id === value;
          return (
            <li key={isEmpty ? "empty" : row.id} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={isSelected}
                id={`${listId}-opt-${i}`}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                  isActive ? "bg-slate-800 text-white" : "text-slate-200 hover:bg-slate-800/70"
                }`}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => pick(row.id)}
              >
                {cat ? (
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={categoryDotStyle(cat.color)} aria-hidden />
                ) : null}
                <span className={`min-w-0 truncate ${isEmpty ? "text-slate-500" : ""}`}>
                  {isEmpty ? placeholder : cat!.name}
                </span>
              </button>
            </li>
          );
        })
      )}
    </ul>
  );

  const menu =
    open && pos
      ? createPortal(
          <div
            ref={menuRef}
            className="fixed z-[80] flex flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-950 shadow-xl shadow-black/40"
            style={{ top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxHeight }}
          >
            {pos.openUp ? (
              <>
                {listBlock}
                <div className="shrink-0 border-t border-slate-800 p-2">{searchInput}</div>
              </>
            ) : (
              <>
                <div className="shrink-0 border-b border-slate-800 p-2">{searchInput}</div>
                {listBlock}
              </>
            )}
          </div>,
          document.body
        )
      : null;

  return (
    <div ref={rootRef} className={`relative min-w-0 ${className}`}>
      <button
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-required={required || undefined}
        onClick={() => !disabled && setOpen((v) => !v)}
        className="flex w-full min-w-0 items-center justify-between gap-2 hb-input px-3 py-2 text-left text-sm text-slate-100 disabled:opacity-50"
      >
        <span className="flex min-w-0 items-center gap-2 truncate">
          {selected ? (
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={categoryDotStyle(selected.color)} aria-hidden />
          ) : null}
          <span className={`truncate ${selected ? "text-slate-100" : "text-slate-500"}`}>
            {selected ? selected.name : placeholder}
          </span>
        </span>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className="shrink-0 fill-slate-500">
          <path d="M2.2 4.2 6 8l3.8-3.8H2.2z" />
        </svg>
      </button>
      {required && (
        <input
          tabIndex={-1}
          required
          value={value}
          onChange={() => {}}
          className="pointer-events-none absolute h-0 w-0 opacity-0"
          aria-hidden
        />
      )}
      {menu}
    </div>
  );
}
