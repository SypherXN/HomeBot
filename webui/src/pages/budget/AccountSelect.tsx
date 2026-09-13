import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import type { BudgetAccount } from "../../api";
import { filterAccounts } from "../../lib/accountSearch";
import { formatMoney } from "../../lib/budgetMoney";

type Props = {
  accounts: BudgetAccount[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  showBalance?: boolean;
  allowEmpty?: boolean;
  id?: string;
};

type MenuPos = { top: number; left: number; width: number; maxHeight: number };

type Row = { id: string; account: BudgetAccount | null };

function accountButtonLabel(a: BudgetAccount, showBalance: boolean): string {
  if (!showBalance) return a.name;
  const sign = a.currentBalance < 0 ? "−" : "";
  return `${a.name} (${sign}$${formatMoney(Math.abs(a.currentBalance))})`;
}

function buildRows(accounts: BudgetAccount[], query: string, allowEmpty: boolean): Row[] {
  const filtered = filterAccounts(accounts, query).map((account) => ({
    id: String(account.id),
    account,
  }));
  if (allowEmpty && !query.trim()) return [{ id: "", account: null }, ...filtered];
  return filtered;
}

/** Searchable account picker — native selects can't host a search field. */
export default function AccountSelect({
  accounts,
  value,
  onChange,
  placeholder = "Choose account",
  disabled = false,
  required = false,
  className = "",
  showBalance = false,
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
  const [pos, setPos] = useState<MenuPos | null>(null);

  const selected = accounts.find((a) => String(a.id) === value);
  const rows = buildRows(accounts, query, allowEmpty);

  function updatePos() {
    const el = rootRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 4;
    const maxH = 280;
    const spaceBelow = window.innerHeight - r.bottom - gap;
    const spaceAbove = r.top - gap;
    const openUp = spaceBelow < 160 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(120, Math.min(maxH, openUp ? spaceAbove : spaceBelow));
    setPos({
      top: openUp ? r.top - maxHeight - gap : r.bottom + gap,
      left: Math.max(8, r.left),
      width: Math.max(r.width, 220),
      maxHeight,
    });
  }

  useLayoutEffect(() => {
    if (!open) return;
    updatePos();
    const onWin = () => updatePos();
    window.addEventListener("resize", onWin);
    document.addEventListener("scroll", onWin, true);
    return () => {
      window.removeEventListener("resize", onWin);
      document.removeEventListener("scroll", onWin, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    const found = accounts.findIndex((a) => String(a.id) === value);
    setActiveIndex(allowEmpty ? (found >= 0 ? found + 1 : 0) : Math.max(0, found));
    const t = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
    // Highlight the current value only when the menu opens.
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

  const menu =
    open && pos
      ? createPortal(
          <div
            ref={menuRef}
            className="fixed z-[80] overflow-hidden rounded-lg border border-slate-700 bg-slate-950 shadow-xl shadow-black/40"
            style={{ top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxHeight }}
          >
            <div className="border-b border-slate-800 p-2">
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onSearchKey}
                placeholder="Search accounts…"
                aria-label="Search accounts"
                aria-controls={listId}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <ul
              id={listId}
              role="listbox"
              aria-label="Accounts"
              className="overflow-y-auto py-1"
              style={{ maxHeight: pos.maxHeight - 52 }}
            >
              {rows.length === 0 ? (
                <li className="px-3 py-2 text-sm text-slate-500">No accounts match.</li>
              ) : (
                rows.map((row, i) => {
                  const isEmpty = row.account == null;
                  const acc = row.account;
                  const isActive = i === activeIndex;
                  const isSelected = row.id === value;
                  return (
                    <li key={isEmpty ? "empty" : row.id} role="presentation">
                      <button
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        id={`${listId}-opt-${i}`}
                        className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${
                          isActive ? "bg-slate-800 text-white" : "text-slate-200 hover:bg-slate-800/70"
                        }`}
                        onMouseEnter={() => setActiveIndex(i)}
                        onClick={() => pick(row.id)}
                      >
                        <span className={`min-w-0 truncate ${isEmpty ? "text-slate-500" : ""}`}>
                          {isEmpty ? placeholder : acc!.name}
                        </span>
                        {acc && (
                          <span className="shrink-0 text-[11px] text-slate-500">
                            {acc.accountType}
                            {showBalance
                              ? ` · ${acc.currentBalance < 0 ? "−" : ""}$${formatMoney(Math.abs(acc.currentBalance))}`
                              : ""}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>,
          document.body
        )
      : null;

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-required={required || undefined}
        onClick={() => !disabled && setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 hb-input px-3 py-2 text-left text-sm text-slate-100 disabled:opacity-50"
      >
        <span className={`min-w-0 truncate ${selected ? "text-slate-100" : "text-slate-500"}`}>
          {selected ? accountButtonLabel(selected, showBalance) : placeholder}
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
