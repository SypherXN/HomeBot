/**
 * Page-level swipe opt-out detection.
 *
 * Returns true when a touch target should NOT start a page-level horizontal
 * swipe (month/period change) because it either is not a DOM element or belongs
 * to something that owns its own horizontal gesture.
 */
export function shouldIgnorePageSwipe(target: EventTarget | null): boolean {
  const el =
    target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
  if (!el) return false;
  if (el.closest("[data-no-page-swipe]")) return true;
  if (el.closest("input, textarea, select, [contenteditable=true]")) return true;
  return false;
}
