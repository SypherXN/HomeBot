import type { BudgetTransactionListItem } from "../api";

const EPS = 0.005;

/** Amount credited to the destination account (gift-card bonus, fee, or the same as paid). */
export function transferReceivedAmount(
  row: Pick<BudgetTransactionListItem, "amount" | "transferToAmount">
): number {
  if (row.transferToAmount != null && row.transferToAmount > EPS) return row.transferToAmount;
  return row.amount;
}

export function transferAmountDelta(paid: number, received: number): number {
  return Math.round((received - paid) * 100) / 100;
}

export function formatTransferLedgerAmount(paid: number, received: number, formatMoney: (n: number) => string): string {
  if (Math.abs(received - paid) <= EPS) return formatMoney(paid);
  return `${formatMoney(paid)} → ${formatMoney(received)}`;
}

export function transferBonusLabel(paid: number, received: number, formatMoney: (n: number) => string): string | null {
  const delta = transferAmountDelta(paid, received);
  if (Math.abs(delta) <= EPS) return null;
  if (delta > 0) return `Bonus $${formatMoney(delta)} — not counted as income`;
  return `Fee $${formatMoney(Math.abs(delta))}`;
}
