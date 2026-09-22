/** Case-insensitive merchant matches. Empty query returns nothing so the menu stays closed until the user types. */
export function filterMerchants(merchants: string[], query: string, limit = 8): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of merchants) {
    const name = raw.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key) || !key.includes(q)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= limit) break;
  }
  return out;
}
