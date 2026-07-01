/** YYYY-MM for the current calendar month (local time). */
export function currentBudgetMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** YYYY-MM-DD for today (local time). */
export function todayBudgetDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Default date when adding a transaction while viewing a budget month.
 * Current month → today; any other month → first of that month (day within month rarely matters).
 */
export function defaultTransactionDateForMonth(month: string): string {
  const m = month.trim();
  if (!/^\d{4}-\d{2}$/.test(m)) return todayBudgetDate();
  if (m === currentBudgetMonth()) return todayBudgetDate();
  return `${m}-01`;
}
