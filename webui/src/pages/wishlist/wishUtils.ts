/** Priority 1 = most wanted → ★★★, 2 → ★★, 3 → ★ (backend sorts 1 first). */
export function priorityStars(priority: string): number {
  const n = Number.parseInt(priority, 10);
  if (n === 1) return 3;
  if (n === 2) return 2;
  if (n === 3) return 1;
  return 0;
}

export function linkDomain(link: string): string | null {
  try {
    return new URL(link).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** First number found in a free-form price string, for totals. */
export function parsePriceNumber(price: string): number | null {
  const m = price.replace(/,/g, "").match(/\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}
