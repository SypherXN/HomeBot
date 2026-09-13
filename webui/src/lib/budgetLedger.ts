import type { BudgetTransactionListItem } from "../api";
import { titleCase } from "./titleCase";

export function humanizeBudgetTxType(type: string): string {
  return titleCase((type || "").replace(/_/g, " ").trim()) || "Transaction";
}

export function budgetDayLabel(isoDay: string): string {
  if (isoDay === "undated") return "No date";
  const d = new Date(`${isoDay}T12:00:00`);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const key = (x: Date) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  if (key(d) === key(today)) return "Today";
  if (key(d) === key(yesterday)) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export type BudgetLedgerDayGroup = {
  day: string;
  rows: BudgetTransactionListItem[];
  spent: number;
};

export function groupBudgetTransactionsByDay(
  items: BudgetTransactionListItem[]
): BudgetLedgerDayGroup[] {
  const groups = new Map<string, BudgetTransactionListItem[]>();
  for (const row of items) {
    const day = row.transactionDate?.slice(0, 10) || "undated";
    const arr = groups.get(day) ?? [];
    arr.push(row);
    groups.set(day, arr);
  }
  return [...groups.entries()].map(([day, rows]) => ({
    day,
    rows,
    spent: rows.filter((r) => r.type === "expense").reduce((s, r) => s + r.amount, 0),
  }));
}
