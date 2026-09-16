import type { BudgetCategory } from "../api";

/** Case-insensitive match on category name. */
export function filterCategories(categories: BudgetCategory[], query: string): BudgetCategory[] {
  const q = query.trim().toLowerCase();
  if (!q) return categories;
  return categories.filter((c) => c.name.toLowerCase().includes(q));
}
