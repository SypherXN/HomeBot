import type { BudgetShareChargeInput, BudgetSharePaymentInput, BudgetTransactionShareSummary } from "../api";

export const SHARE_EPS = 0.005;

export type ShareChargeDraft = {
  key: string;
  id?: number;
  owedByUserId: string;
  owedByLabel: string;
  amount: string;
};

export type SharePaymentDraft = {
  chargeId: number;
  amount: string;
};

export function emptyShareChargeDraft(): ShareChargeDraft {
  return { key: crypto.randomUUID(), owedByUserId: "", owedByLabel: "", amount: "" };
}

export function draftsFromShareSummary(summary?: BudgetTransactionShareSummary | null): ShareChargeDraft[] {
  const charges = summary?.charges ?? [];
  if (charges.length === 0) return [emptyShareChargeDraft()];
  return charges.map((c) => ({
    key: String(c.id),
    id: c.id,
    owedByUserId: c.owedByUserId ?? "",
    owedByLabel: c.owedByLabel,
    amount: String(c.amount),
  }));
}

export function chargedTotal(drafts: ShareChargeDraft[]): number {
  return drafts.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
}

export function yourShare(total: number, charged: number): number {
  return total - charged;
}

export function toShareChargeInputs(drafts: ShareChargeDraft[]): BudgetShareChargeInput[] {
  return drafts
    .filter((d) => d.owedByLabel.trim() && (Number(d.amount) || 0) > SHARE_EPS)
    .map((d) => ({
      id: d.id,
      owedByUserId: d.owedByUserId.trim() || null,
      owedByLabel: d.owedByLabel.trim(),
      amount: Number(d.amount) || 0,
    }));
}

export function shareChargeError(total: number, drafts: ShareChargeDraft[]): string | null {
  const filled = drafts.filter((d) => d.owedByLabel.trim() || d.amount.trim());
  if (filled.length === 0) return "Add at least one person who owes you.";
  for (const d of filled) {
    if (!d.owedByLabel.trim()) return "Each charge needs a person name.";
    if ((Number(d.amount) || 0) <= SHARE_EPS) return "Each charge needs an amount.";
  }
  const charged = chargedTotal(drafts);
  if (charged > total + SHARE_EPS) return "Charges to others cannot exceed the expense.";
  return null;
}

/** Split the bill N+1 ways (named people plus you) and charge each named person their share. */
export function splitRemainingEqually(total: number, drafts: ShareChargeDraft[]): ShareChargeDraft[] {
  const named = drafts.filter((d) => d.owedByLabel.trim());
  if (named.length === 0) return drafts;
  const unnamed = drafts.filter((d) => !d.owedByLabel.trim());
  const ways = named.length + 1;
  const each = Math.round((total / ways) * 100) / 100;
  const othersTotal = Math.round(each * named.length * 100) / 100;
  let allocated = 0;
  const nextNamed = named.map((d, i) => {
    const amount =
      i === named.length - 1 ? Math.round((othersTotal - allocated) * 100) / 100 : each;
    if (i < named.length - 1) allocated += each;
    return { ...d, amount: amount.toFixed(2) };
  });
  return [...nextNamed, ...unnamed];
}

export function toSharePaymentInputs(drafts: SharePaymentDraft[]): BudgetSharePaymentInput[] {
  return drafts
    .filter((d) => (Number(d.amount) || 0) > SHARE_EPS)
    .map((d) => ({ chargeId: d.chargeId, amount: Number(d.amount) || 0 }));
}

export function sharePaymentError(incomeAmount: number, drafts: SharePaymentDraft[]): string | null {
  const applied = drafts.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
  if (applied <= SHARE_EPS) return "Apply this payment to at least one open charge.";
  if (applied > incomeAmount + SHARE_EPS) return "Reimbursement allocations cannot exceed the amount received.";
  return null;
}
