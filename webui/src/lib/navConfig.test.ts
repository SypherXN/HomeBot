import { describe, expect, it } from "vitest";
import {
  buildMobileTabItems,
  buildMoreItems,
  buildNavGroups,
  isNavPathHidden,
  navPageIdForPath,
} from "./navConfig";

describe("navConfig", () => {
  it("maps budget subroutes to the budget page", () => {
    expect(navPageIdForPath("/budget/accounts/3")).toBe("budget");
  });

  it("filters hidden pages from nav groups", () => {
    const groups = buildNavGroups(new Set(["meals", "money"]));
    const labels = groups.flatMap((g) => g.items.map((i) => i.label));
    expect(labels).toContain("Buy");
    expect(labels).not.toContain("Meals");
    expect(labels).not.toContain("Money");
    expect(labels).toContain("Settings");
  });

  it("drops hidden mobile tabs", () => {
    const tabs = buildMobileTabItems(new Set(["budget"]));
    expect(tabs.map((t) => t.label)).toEqual(["Home", "Buy", "Calendar"]);
  });

  it("puts non-tab visible pages in more", () => {
    const tabs = buildMobileTabItems(new Set());
    const more = buildMoreItems(new Set(), tabs).map((i) => i.label);
    expect(more).toContain("Wishlist");
    expect(more).toContain("Money");
    expect(more).not.toContain("Buy");
  });

  it("detects hidden paths", () => {
    expect(isNavPathHidden(new Set(["calendar"]), "/calendar")).toBe(true);
    expect(isNavPathHidden(new Set(["calendar"]), "/settings")).toBe(false);
  });
});
