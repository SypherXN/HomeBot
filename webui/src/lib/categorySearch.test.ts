import { describe, expect, it } from "vitest";
import type { BudgetCategory } from "../api";
import { filterCategories } from "./categorySearch";

function cat(partial: Partial<BudgetCategory> & Pick<BudgetCategory, "id" | "name">): BudgetCategory {
  return {
    color: null,
    icon: null,
    visibility: "household",
    isTaxDeductible: false,
    sortOrder: 0,
    ...partial,
  };
}

describe("filterCategories", () => {
  const list = [
    cat({ id: 1, name: "Food" }),
    cat({ id: 2, name: "Transportation" }),
    cat({ id: 3, name: "Grocery" }),
  ];

  it("returns all categories when the query is empty", () => {
    expect(filterCategories(list, "  ").map((c) => c.id)).toEqual([1, 2, 3]);
  });

  it("matches name fragments case-insensitively", () => {
    expect(filterCategories(list, "gro").map((c) => c.id)).toEqual([3]);
    expect(filterCategories(list, "FOOD").map((c) => c.id)).toEqual([1]);
  });
});
