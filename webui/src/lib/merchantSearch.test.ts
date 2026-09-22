import { describe, expect, it } from "vitest";
import { filterMerchants } from "./merchantSearch";

describe("filterMerchants", () => {
  const list = ["Costco", "DoorDash", "Coffee Shop", "costco gas"];

  it("returns nothing until the user types", () => {
    expect(filterMerchants(list, "  ")).toEqual([]);
  });

  it("matches fragments case-insensitively and caps the list", () => {
    expect(filterMerchants(list, "cos")).toEqual(["Costco", "costco gas"]);
    expect(filterMerchants(["A", "B", "C", "D"], "a", 1)).toEqual(["A"]);
  });

  it("skips blanks and duplicate names", () => {
    expect(filterMerchants(["", "  ", "Costco", "costco"], "cost")).toEqual(["Costco"]);
  });
});
