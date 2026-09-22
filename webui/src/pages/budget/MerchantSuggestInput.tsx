import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { measureComboboxMenu, type ComboboxMenuPos } from "../../lib/comboboxPosition";
import { filterMerchants } from "../../lib/merchantSearch";

type Props = {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  placeholder?: string;
  className?: string;
  /** Layout classes for the field wrapper (for example flex-1 in a toolbar). */
  rootClassName?: string;
};

/** Free-text merchant field that lists matching past merchants as the user types. */
export default function MerchantSuggestInput({
  value,
  onChange,
  suggestions,
  placeholder = "Merchant",
  className = "",
  rootClassName = "w-full",
}: Props) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [pos, setPos] = useState<ComboboxMenuPos | null>(null);

  const matches = filterMerchants(suggestions, value);
  const show = open && matches.length > 0;

  function updatePos() {
    const el = rootRef.current;
    if (!el) return;
    setPos(measureComboboxMenu(el));
  }

  useLayoutEffect(() => {
    if (!show) return;
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
  }, [show, value, matches.length]);

  useEffect(() => {
    setActiveIndex(0);
  }, [value]);

  useEffect(() => {
    if (!show) return;
    const el = document.getElementById(`${listId}-opt-${activeIndex}`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, show, listId]);

  useEffect(() => {
    if (!show) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [show]);

  function pick(name: string) {
    onChange(name);
    setOpen(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      if (!show) return;
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      return;
    }
    if (!matches.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!show) {
        setOpen(true);
        setActiveIndex(0);
        return;
      }
      setActiveIndex((i) => Math.min(matches.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!show) {
        setOpen(true);
        setActiveIndex(0);
        return;
      }
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter" && show) {
      const row = matches[activeIndex];
      if (!row) return;
      e.preventDefault();
      pick(row);
    }
  }

  const menu =
    show && pos
      ? createPortal(
          <div
            ref={menuRef}
            data-no-page-swipe=""
            className="fixed z-[80] overflow-hidden rounded-lg border border-slate-700 bg-slate-950 shadow-xl shadow-black/40"
            style={{ top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxHeight }}
          >
            <ul id={listId} role="listbox" aria-label="Matching merchants" className="overflow-y-auto py-1">
              {matches.map((name, i) => (
                <li key={name} role="presentation">
                  <button
                    type="button"
                    role="option"
                    id={`${listId}-opt-${i}`}
                    aria-selected={i === activeIndex}
                    className={`block w-full truncate px-3 py-2 text-left text-sm ${
                      i === activeIndex ? "bg-slate-800 text-white" : "text-slate-200 hover:bg-slate-800/70"
                    }`}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActiveIndex(i)}
                    onClick={() => pick(name)}
                  >
                    {name}
                  </button>
                </li>
              ))}
            </ul>
          </div>,
          document.body
        )
      : null;

  return (
    <div ref={rootRef} className={`relative min-w-0 ${rootClassName}`}>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={show}
        aria-controls={show ? listId : undefined}
        aria-autocomplete="list"
        className={className}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {menu}
    </div>
  );
}
