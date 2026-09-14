import { describe, expect, it } from "vitest";
import type { BudgetShareChargeLine } from "../api";
import { GENERAL_SHARE_LABEL } from "./budgetShares";
import { groupOpenShareTotals } from "./budgetShareTotals";

function charge(partial: Partial<BudgetShareChargeLine> & Pick<BudgetShareChargeLine, "id" | "remaining">): BudgetShareChargeLine {
  return {
    expenseTransactionId: 1,
    owedByUserId: null,
    owedByLabel: "Alex",
    amount: partial.remaining,
    paidAmount: 0,
    status: "open",
    merchant: "Dinner",
    expenseDate: "2026-09-13",
    expenseAmount: 80,
    ...partial,
  };
}

describe("groupOpenShareTotals", () => {
  it("groups by person and general separately", () => {
    const rows = groupOpenShareTotals([
      charge({ id: 1, owedByLabel: "Alex", remaining: 20 }),
      charge({ id: 2, owedByLabel: "Alex", remaining: 15, merchant: "Uber" }),
      charge({ id: 3, owedByLabel: GENERAL_SHARE_LABEL, remaining: 10 }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ label: "Alex", total: 35, chargeCount: 2 });
    expect(rows[1]).toMatchObject({ label: "To be repaid", total: 10, chargeCount: 1 });
  });
});
