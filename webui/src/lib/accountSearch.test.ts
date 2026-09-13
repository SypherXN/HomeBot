import { describe, expect, it } from "vitest";
import type { BudgetAccount } from "../api";
import { filterAccounts } from "./accountSearch";

function acc(partial: Partial<BudgetAccount> & Pick<BudgetAccount, "id" | "name">): BudgetAccount {
  return {
    accountType: "checking",
    currency: "USD",
    creditLimit: null,
    currentBalance: 0,
    ...partial,
  };
}

describe("filterAccounts", () => {
  const list = [
    acc({ id: 1, name: "Joint Checking (Capital One)", accountType: "checking" }),
    acc({ id: 2, name: "Matthew Savings (Capital One)", accountType: "savings" }),
    acc({ id: 3, name: "Cisy Sapphire Preferred (Chase)", accountType: "credit" }),
    acc({ id: 4, name: "Mimi Checking (Wells Fargo)", accountType: "checking" }),
  ];

  it("returns all accounts when the query is empty", () => {
    expect(filterAccounts(list, "  ").map((a) => a.id)).toEqual([1, 2, 3, 4]);
  });

  it("matches name fragments case-insensitively", () => {
    expect(filterAccounts(list, "cisy").map((a) => a.id)).toEqual([3]);
    expect(filterAccounts(list, "CAPITAL").map((a) => a.id)).toEqual([1, 2]);
  });

  it("matches account type", () => {
    expect(filterAccounts(list, "savings").map((a) => a.id)).toEqual([2]);
    expect(filterAccounts(list, "credit").map((a) => a.id)).toEqual([3]);
  });
});
