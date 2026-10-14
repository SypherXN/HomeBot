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

  it("matches from the first letter and ranks prefixes before fragments", () => {
    expect(filterMerchants(["The Coffee Shop", "Costco", "Coffee Shop"], "c", 2)).toEqual(["Costco", "Coffee Shop"]);
  });

  it("ignores punctuation and accents while keeping the saved spelling", () => {
    expect(filterMerchants(["H-E-B", "HEB", "Café"], "heb")).toEqual(["H-E-B"]);
    expect(filterMerchants(["Café"], "cafe")).toEqual(["Café"]);
    expect(filterMerchants(list, "---")).toEqual([]);
  });
});
