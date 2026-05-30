import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";

export function useSearchHighlightId(): number | null {
  const [params] = useSearchParams();
  const raw = params.get("highlight");
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function highlightRowClass(id: number, highlightId: number | null): string {
  return highlightId === id
    ? "ring-2 ring-sky-500 ring-offset-2 ring-offset-slate-950"
    : "";
}

/** Scroll the highlighted row into view once data is present. */
export function useScrollToHighlight(active: boolean) {
  const ref = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    if (!active || !ref.current) return;
    ref.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [active]);
  return ref;
}
