import { describe, expect, it } from "vitest";
import { humanizeBudgetTxType, groupBudgetTransactionsByDay } from "./budgetLedger";
import type { BudgetTransactionListItem } from "../api";

function tx(partial: Partial<BudgetTransactionListItem> & Pick<BudgetTransactionListItem, "id">): BudgetTransactionListItem {
  return {
    type: "expense",
    amount: 10,
    amountInput: "10",
    categoryId: null,
    categoryName: null,
    spentByUserId: "1",
    spentByMemberLabel: "a",
    accountId: null,
    transferToAccountId: null,
    transferToAmount: null,
    note: null,
    receiptUrl: null,
    merchant: null,
    transactionDate: "2026-09-13",
    clearedAt: null,
    isPending: false,
    currency: "USD",
    exchangeRateToHome: 1,
    tags: [],
    splits: [],
    ...partial,
  };
}

describe("humanizeBudgetTxType", () => {
  it("turns underscored types into labels", () => {
    expect(humanizeBudgetTxType("opening_balance")).toBe("Opening Balance");
    expect(humanizeBudgetTxType("transfer")).toBe("Transfer");
    expect(humanizeBudgetTxType("reimbursement")).toBe("Reimbursement");
  });
});

describe("groupBudgetTransactionsByDay", () => {
  it("groups by calendar day and sums expenses", () => {
    const groups = groupBudgetTransactionsByDay([
      tx({ id: 1, amount: 20, transactionDate: "2026-09-13" }),
      tx({ id: 2, type: "income", amount: 50, transactionDate: "2026-09-13" }),
      tx({ id: 3, amount: 5, transactionDate: "2026-09-12" }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].day).toBe("2026-09-13");
    expect(groups[0].spent).toBe(20);
    expect(groups[0].rows).toHaveLength(2);
  });
});
