export function moveIdToTarget<T extends { id: number }>(
  items: T[],
  fromId: number,
  targetId: number
): T[] {
  if (fromId === targetId) return items;
  const from = items.findIndex((item) => item.id === fromId);
  const to = items.findIndex((item) => item.id === targetId);
  if (from < 0 || to < 0) return items;
  const next = items.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function orderChanged<T extends { id: number }>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return true;
  return a.some((item, i) => item.id !== b[i]?.id);
}
