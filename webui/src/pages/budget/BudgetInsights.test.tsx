import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BudgetTransactionListItem } from "../../api";
import BudgetInsights from "./BudgetInsights";

let nextId = 1;
function expense(merchant: string | null, amount: number): BudgetTransactionListItem {
  return {
    id: nextId++,
    type: "expense",
    amount,
    amountInput: null,
    categoryId: null,
    categoryName: null,
    spentByUserId: "u1",
    spentByMemberLabel: "Matt",
    accountId: null,
    transferToAccountId: null,
    transferToAmount: null,
    note: null,
    receiptUrl: null,
    merchant,
    transactionDate: "2026-10-05",
    clearedAt: null,
    isPending: false,
    currency: "USD",
    exchangeRateToHome: 1,
    tags: [],
    splits: [],
    shareSummary: null,
  };
}

/** 7 merchants with distinct descending totals, plus one income row that must be ignored. */
const sevenMerchants = [
  expense("Alpha", 90),
  expense("Bravo", 80),
  expense("Charlie", 70),
  expense("Delta", 60),
  expense("Echo", 50),
  expense("Foxtrot", 40),
  expense("Golf", 30),
  { ...expense(null, 999), type: "income" },
];

function renderInsights(transactions: BudgetTransactionListItem[], onViewMerchant?: (m: string) => void) {
  return render(
    <BudgetInsights
      envelopes={[]}
      transactions={transactions}
      notifications={[]}
      month="2026-10"
      onViewMerchant={onViewMerchant}
    />
  );
}

describe("BudgetInsights top merchants", () => {
  afterEach(() => cleanup());

  it("caps the inline list at the top 5 and offers the full ranking", () => {
    renderInsights(sevenMerchants);
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Echo")).toBeInTheDocument();
    expect(screen.queryByText("Foxtrot")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "See all 7 merchants" })).toBeInTheDocument();
  });

  it("hides the expand button when there is nothing beyond the top 5", () => {
    renderInsights(sevenMerchants.slice(0, 5));
    expect(screen.getByText("Echo")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /see all/i })).not.toBeInTheDocument();
  });

  it("opens the full ranking descending in the shared sheet", () => {
    renderInsights(sevenMerchants);
    fireEvent.click(screen.getByRole("button", { name: "See all 7 merchants" }));
    const dialog = screen.getByRole("dialog");
    const rows = within(dialog)
      .getByLabelText("All merchants by spend")
      .querySelectorAll("button");
    expect([...rows].map((r) => r.textContent)).toEqual([
      "Alpha$90.00",
      "Bravo$80.00",
      "Charlie$70.00",
      "Delta$60.00",
      "Echo$50.00",
      "Foxtrot$40.00",
      "Golf$30.00",
    ]);
  });

  it("navigates to the ledger from a popup row and closes the sheet", () => {
    const onViewMerchant = vi.fn();
    renderInsights(sevenMerchants, onViewMerchant);
    fireEvent.click(screen.getByRole("button", { name: "See all 7 merchants" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByText("Golf"));
    expect(onViewMerchant).toHaveBeenCalledWith("Golf");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows no merchant section or affordance without expenses", () => {
    renderInsights([expense(null, 999), { ...expense("Ghost", 50), type: "income" }]);
    expect(screen.queryByText("Top merchants")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /see all/i })).not.toBeInTheDocument();
  });
});
