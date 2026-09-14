import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import type { DiscordGuildRosterState } from "../../hooks/useDiscordGuildRoster";
import {
  sharePersonChoiceCaption,
  sharePersonChoices,
  type SharePersonChoice,
} from "../../lib/sharePerson";
import { memberPickerLabel } from "../../lib/memberDisplay";

type Props = {
  roster: DiscordGuildRosterState;
  guests: string[];
  label: string;
  onChange: (userId: string, label: string) => void;
};

type MenuPos = { top: number; left: number; width: number; maxHeight: number };

/** Type any name, or pick a household member. Native datalists block custom names on iOS. */
export default function SharePersonSelect({ roster, guests, label, onChange }: Props) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [pos, setPos] = useState<MenuPos | null>(null);

  const members = roster.data?.available ? roster.data.members : [];
  const rows = sharePersonChoices(members, guests, label);

  function updatePos() {
    const el = rootRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 4;
    const maxH = 240;
    const spaceBelow = window.innerHeight - r.bottom - gap;
    const spaceAbove = r.top - gap;
    const openUp = spaceBelow < 140 && spaceAbove > spaceBelow;
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
  }, [open, label, rows.length]);

  useEffect(() => {
    if (!open) return;
    setActiveIndex(0);
  }, [label, open]);

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

  function apply(choice: SharePersonChoice) {
    onChange(choice.userId, choice.label);
    setOpen(false);
    inputRef.current?.blur();
  }

  function typeName(raw: string) {
    const mem = members.find(
      (m) => memberPickerLabel(m) === raw || m.username === raw || m.displayName === raw
    );
    if (mem) onChange(mem.userId, memberPickerLabel(mem));
    else onChange("", raw);
  }

  function onSearchKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => Math.min(Math.max(0, rows.length - 1), i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      const row = rows[activeIndex];
      if (open && row) {
        e.preventDefault();
        apply(row);
      }
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
            <ul
              id={listId}
              role="listbox"
              aria-label="People who can owe you"
              className="overflow-y-auto py-1"
              style={{ maxHeight: pos.maxHeight }}
            >
              {rows.length === 0 ? (
                <li className="px-3 py-2 text-sm text-slate-500">
                  Type a name to add someone who is not in the household.
                </li>
              ) : (
                rows.map((row, i) => {
                  const isActive = i === activeIndex;
                  return (
                    <li key={`${row.kind}:${row.userId}:${row.label.toLowerCase()}`} role="presentation">
                      <button
                        type="button"
                        role="option"
                        aria-selected={isActive}
                        id={`${listId}-opt-${i}`}
                        className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${
                          isActive ? "bg-slate-800 text-white" : "text-slate-200 hover:bg-slate-800/70"
                        }`}
                        onMouseDown={(e) => e.preventDefault()}
                        onMouseEnter={() => setActiveIndex(i)}
                        onClick={() => apply(row)}
                      >
                        <span className="min-w-0 truncate">
                          {row.kind === "custom" ? `Use “${row.label}”` : row.label}
                        </span>
                        <span className="shrink-0 text-[11px] text-slate-500">{sharePersonChoiceCaption(row)}</span>
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
    <div ref={rootRef} className="relative min-w-0">
      <input
        ref={inputRef}
        type="text"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="words"
        spellCheck={false}
        value={label}
        placeholder="Type a name"
        aria-label="Person who owes you"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        role="combobox"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          typeName(e.target.value);
          setOpen(true);
        }}
        onKeyDown={onSearchKey}
        className="hb-input w-full px-2 py-1.5 text-sm text-slate-100"
      />
      {menu}
    </div>
  );
}
