import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { DiscordGuildRosterState } from "../../hooks/useDiscordGuildRoster";
import type { BudgetAccount } from "../../api";
import BudgetFiltersPanel, { type BudgetFilters } from "./BudgetFiltersPanel";

const roster: DiscordGuildRosterState = {
  loading: false,
  error: null,
  data: { available: true, reason: null, guildId: "g", members: [] },
};

const accounts: BudgetAccount[] = [
  { id: 1, name: "Everyday Checking", accountType: "checking", currency: "USD", creditLimit: null, currentBalance: 0 },
  { id: 2, name: "Rewards Card", accountType: "credit", currency: "USD", creditLimit: 1000, currentBalance: 0 },
];

const EMPTY: BudgetFilters = {
  merchant: "",
  noteContains: "",
  amountMin: "",
  amountMax: "",
  tag: "",
  accountId: "",
};

afterEach(cleanup);

it("picks one account and reports it through onFiltersChange", () => {
  let selected: string | undefined;
  function Harness() {
    const [filters, setFilters] = useState<BudgetFilters>(EMPTY);
    return (
      <BudgetFiltersPanel
        token=""
        roster={roster}
        spenderFilter=""
        onSpenderFilter={() => {}}
        categoryFilter=""
        onCategoryFilter={() => {}}
        categories={[]}
        accounts={accounts}
        filters={filters}
        onFiltersChange={(f) => {
          selected = f.accountId;
          setFilters(f);
        }}
        allTags={[]}
        onApply={() => {}}
        onClear={() => {}}
      />
    );
  }

  render(<Harness />);
  const select = screen
    .getAllByRole("combobox")
    .find((el) => el.textContent?.includes("All accounts")) as HTMLSelectElement;
  expect(Array.from(select.options).map((o) => o.textContent)).toEqual([
    "All accounts",
    "Everyday Checking",
    "Rewards Card",
  ]);

  fireEvent.change(select, { target: { value: "2" } });
  expect(select).toHaveValue("2");
  expect(selected).toBe("2");
});
