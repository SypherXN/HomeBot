import { describe, expect, it } from "vitest";
import {
  chargedTotal,
  looksEvenSplit,
  netExpenseAmount,
  shareChargeError,
  splitRemainingEqually,
  toShareChargeInputs,
  yourShare,
  type ShareChargeDraft,
} from "./budgetShares";

function draft(partial: Partial<ShareChargeDraft> = {}): ShareChargeDraft {
  return { key: "k", owedByUserId: "", owedByLabel: "", amount: "", ...partial };
}

describe("budgetShares", () => {
  it("computes your share as leftover after charges", () => {
    const drafts = [draft({ owedByLabel: "Alex", amount: "20" }), draft({ owedByLabel: "Sam", amount: "20" })];
    expect(chargedTotal(drafts)).toBe(40);
    expect(yourShare(80, 40)).toBe(40);
  });

  it("splits equally including you", () => {
    const drafts = [draft({ owedByLabel: "Alex" })];
    const next = splitRemainingEqually(80, drafts);
    expect(next[0].amount).toBe("40.00");
    expect(yourShare(80, chargedTotal(next))).toBe(40);
  });

  it("rejects charges over the expense", () => {
    expect(shareChargeError(20, [draft({ owedByLabel: "Alex", amount: "25" })])).toMatch(/cannot exceed/i);
  });

  it("omits empty rows from the payload", () => {
    expect(
      toShareChargeInputs([
        draft({ owedByLabel: "Alex", amount: "12.5" }),
        draft({ owedByLabel: "  ", amount: "3" }),
      ])
    ).toEqual([{ id: undefined, owedByUserId: null, owedByLabel: "Alex", amount: 12.5 }]);
  });

  it("detects even vs assigned splits", () => {
    expect(looksEvenSplit(80, [draft({ owedByLabel: "Alex", amount: "40.00" })])).toBe(true);
    expect(looksEvenSplit(80, [draft({ owedByLabel: "Alex", amount: "20" })])).toBe(false);
  });

  it("nets collected reimbursements out of expense totals", () => {
    expect(netExpenseAmount({ type: "expense", amount: 80 })).toBe(80);
    expect(
      netExpenseAmount({
        type: "expense",
        amount: 80,
        shareSummary: {
          owed: 40,
          received: 20,
          remaining: 20,
          charges: [
            {
              id: 1,
              expenseTransactionId: 1,
              owedByUserId: null,
              owedByLabel: "Alex",
              amount: 40,
              paidAmount: 20,
              remaining: 20,
              status: "open",
              merchant: "Dinner",
              expenseDate: "2026-09-13",
              expenseAmount: 80,
            },
          ],
          payments: [],
        },
      })
    ).toBe(60);
    expect(
      netExpenseAmount({
        type: "expense",
        amount: 80,
        shareSummary: {
          owed: 40,
          received: 0,
          remaining: 0,
          charges: [
            {
              id: 1,
              expenseTransactionId: 1,
              owedByUserId: null,
              owedByLabel: "Alex",
              amount: 40,
              paidAmount: 0,
              remaining: 40,
              status: "reimbursed",
              merchant: "Dinner",
              expenseDate: "2026-09-13",
              expenseAmount: 80,
            },
          ],
          payments: [],
        },
      })
    ).toBe(40);
  });
});
