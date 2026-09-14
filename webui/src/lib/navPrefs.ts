import { TOGGLEABLE_NAV_PAGES, type NavPageId } from "./navConfig";

const STORAGE_KEY = "homebot-nav-hidden";

const VALID_IDS = new Set<NavPageId>(TOGGLEABLE_NAV_PAGES.map((p) => p.id));

export function loadHiddenNavPages(): Set<NavPageId> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    const hidden = new Set<NavPageId>();
    for (const id of parsed) {
      if (typeof id === "string" && VALID_IDS.has(id as NavPageId)) {
        hidden.add(id as NavPageId);
      }
    }
    return hidden;
  } catch {
    return new Set();
  }
}

export function saveHiddenNavPages(hidden: ReadonlySet<NavPageId>) {
  try {
    const ids = [...hidden].filter((id) => VALID_IDS.has(id));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    window.dispatchEvent(new CustomEvent("homebot-nav-prefs-changed"));
  } catch {
    /* ignore */
  }
}
