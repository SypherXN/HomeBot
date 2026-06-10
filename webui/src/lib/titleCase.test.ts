import { describe, expect, it } from "vitest";
import { titleCase } from "./titleCase";

describe("titleCase", () => {
  it("capitalizes each word", () => {
    expect(titleCase("breakfast")).toBe("Breakfast");
    expect(titleCase("Plan & dinner")).toBe("Plan & Dinner");
    expect(titleCase("active shopping items")).toBe("Active Shopping Items");
  });

  it("preserves existing capitals and numbers", () => {
    expect(titleCase("AWS")).toBe("AWS");
    expect(titleCase("401k savings")).toBe("401k Savings");
  });

  it("handles empty input", () => {
    expect(titleCase("")).toBe("");
  });
});
