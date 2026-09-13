import { describe, expect, it } from "vitest";
import {
  chargedTotal,
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
});
