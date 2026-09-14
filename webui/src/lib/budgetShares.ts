import type {
  BudgetShareChargeInput,
  BudgetSharePaymentInput,
  BudgetTransactionListItem,
  BudgetTransactionShareSummary,
} from "../api";

export const SHARE_EPS = 0.005;

/** Stored label for a split with no specific person assigned. */
export const GENERAL_SHARE_LABEL = "Unassigned";

export function isGeneralShareLabel(label: string): boolean {
  return label.trim().toLowerCase() === GENERAL_SHARE_LABEL.toLowerCase();
}

export function formatShareOwedByLabel(label: string): string {
  return isGeneralShareLabel(label) ? "To be repaid" : label;
}

export type ShareChargeDraft = {
  key: string;
  id?: number;
  owedByUserId: string;
  owedByLabel: string;
  amount: string;
  /** Amount waiting to be repaid without naming who owes it. */
  isGeneral?: boolean;
};

export type SharePaymentDraft = {
  chargeId: number;
  amount: string;
};

export function emptyShareChargeDraft(): ShareChargeDraft {
  return { key: crypto.randomUUID(), owedByUserId: "", owedByLabel: "", amount: "" };
}

export function emptyGeneralShareChargeDraft(): ShareChargeDraft {
  return { key: crypto.randomUUID(), owedByUserId: "", owedByLabel: "", amount: "", isGeneral: true };
}

function isNamedPersonRow(d: ShareChargeDraft): boolean {
  return !d.isGeneral && Boolean(d.owedByLabel.trim());
}

export function draftsFromShareSummary(summary?: BudgetTransactionShareSummary | null): ShareChargeDraft[] {
  const charges = summary?.charges ?? [];
  if (charges.length === 0) return [emptyShareChargeDraft()];
  return charges.map((c) => ({
    key: String(c.id),
    id: c.id,
    owedByUserId: c.owedByUserId ?? "",
    owedByLabel: isGeneralShareLabel(c.owedByLabel) ? "" : c.owedByLabel,
    amount: String(c.amount),
    isGeneral: isGeneralShareLabel(c.owedByLabel),
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
    .filter((d) => (d.isGeneral || d.owedByLabel.trim()) && (Number(d.amount) || 0) > SHARE_EPS)
    .map((d) => ({
      id: d.id,
      owedByUserId: d.isGeneral ? null : d.owedByUserId.trim() || null,
      owedByLabel: d.isGeneral ? GENERAL_SHARE_LABEL : d.owedByLabel.trim(),
      amount: Number(d.amount) || 0,
    }));
}

export function shareChargeError(total: number, drafts: ShareChargeDraft[]): string | null {
  const filled = drafts.filter((d) => d.isGeneral || d.owedByLabel.trim() || d.amount.trim());
  if (filled.length === 0) return "Add at least one split.";
  for (const d of filled) {
    if (!d.isGeneral && !d.owedByLabel.trim()) return "Each person split needs a name, or use General.";
    if ((Number(d.amount) || 0) <= SHARE_EPS) return "Each split needs an amount.";
  }
  const charged = chargedTotal(drafts);
  if (charged > total + SHARE_EPS) return "Charges to others cannot exceed the expense.";
  return null;
}

/** Split the bill N+1 ways (named people plus you) and charge each named person their share. */
export function splitRemainingEqually(total: number, drafts: ShareChargeDraft[]): ShareChargeDraft[] {
  const general = drafts.filter((d) => d.isGeneral);
  const generalTotal = chargedTotal(general);
  const named = drafts.filter(isNamedPersonRow);
  if (named.length === 0) return drafts;
  const rest = drafts.filter((d) => !d.isGeneral && !d.owedByLabel.trim());
  const pool = Math.max(0, total - generalTotal);
  const ways = named.length + 1;
  const each = Math.round((pool / ways) * 100) / 100;
  const othersTotal = Math.round(each * named.length * 100) / 100;
  let allocated = 0;
  const nextNamed = named.map((d, i) => {
    const amount =
      i === named.length - 1 ? Math.round((othersTotal - allocated) * 100) / 100 : each;
    if (i < named.length - 1) allocated += each;
    return { ...d, amount: amount.toFixed(2) };
  });
  return [...nextNamed, ...general, ...rest];
}

export function looksEvenSplit(total: number, drafts: ShareChargeDraft[]): boolean {
  if (drafts.some((d) => d.isGeneral)) return false;
  const named = drafts.filter(isNamedPersonRow);
  if (named.length === 0) return true;
  if (named.some((d) => !d.amount.trim())) return true;
  const expected = splitRemainingEqually(total, drafts);
  const expectedNamed = expected.filter(isNamedPersonRow);
  return named.every((d, i) => Math.abs((Number(d.amount) || 0) - (Number(expectedNamed[i]?.amount) || 0)) <= 0.02);
}

export const AWAITING_REPAYMENT_CATEGORY_KEY = "-1";

export function shareCollectedAmount(summary?: BudgetTransactionShareSummary | null): number {
  const charges = summary?.charges ?? [];
  let n = 0;
  for (const c of charges) {
    n += c.paidAmount;
    if (c.status === "reimbursed") n += c.remaining;
  }
  return n;
}

/** Expense total still counting as spend (your share + still waiting). Collected repayments are excluded. */
export function netExpenseAmount(row: { type: string; amount: number; shareSummary?: BudgetTransactionShareSummary | null }): number {
  if (row.type !== "expense") return row.amount;
  return Math.max(0, row.amount - shareCollectedAmount(row.shareSummary));
}

export function toSharePaymentInputs(drafts: SharePaymentDraft[]): BudgetSharePaymentInput[] {
  return drafts
    .filter((d) => (Number(d.amount) || 0) > SHARE_EPS)
    .map((d) => ({ chargeId: d.chargeId, amount: Number(d.amount) || 0 }));
}

export function relatedShareLinks(row: BudgetTransactionListItem): {
  incomeIds: number[];
  expenseIds: number[];
} {
  const payments = row.shareSummary?.payments ?? [];
  const incomeIds = [...new Set(payments.map((p) => p.incomeTransactionId).filter((id) => id > 0))];
  const expenseIds = [...new Set(payments.map((p) => p.expenseTransactionId).filter((id) => id > 0))];
  return { incomeIds, expenseIds };
}

export function sharePaymentError(incomeAmount: number, drafts: SharePaymentDraft[]): string | null {
  const applied = drafts.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
  if (applied <= SHARE_EPS) return "Apply this payment to at least one open charge.";
  if (applied > incomeAmount + SHARE_EPS) return "Reimbursement allocations cannot exceed the amount received.";
  return null;
}
