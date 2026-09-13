import type { BudgetAccount } from "../api";

/** Case-insensitive match on name, type, or currency. */
export function filterAccounts(accounts: BudgetAccount[], query: string): BudgetAccount[] {
  const q = query.trim().toLowerCase();
  if (!q) return accounts;
  return accounts.filter((a) => {
    const hay = `${a.name} ${a.accountType} ${a.currency}`.toLowerCase();
    return hay.includes(q);
  });
}
