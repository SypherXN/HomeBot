function searchKey(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

/** Prefix matches first, then fragments; ignore case, accents and punctuation. */
export function filterMerchants(merchants: string[], query: string, limit = 8): string[] {
  const q = searchKey(query);
  if (!q || limit <= 0) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of merchants) {
    const name = raw.trim();
    if (!name) continue;
    const key = searchKey(name);
    if (seen.has(key) || !key.includes(q)) continue;
    seen.add(key);
    out.push(name);
  }
  return out.sort((a, b) => Number(searchKey(b).startsWith(q)) - Number(searchKey(a).startsWith(q))).slice(0, limit);
}
