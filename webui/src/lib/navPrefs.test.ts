import { beforeEach, describe, expect, it } from "vitest";
import { loadHiddenNavPages, saveHiddenNavPages } from "./navPrefs";

describe("navPrefs", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to all pages visible", () => {
    expect(loadHiddenNavPages().size).toBe(0);
  });

  it("persists hidden page ids", () => {
    saveHiddenNavPages(new Set(["meals", "money"]));
    expect(loadHiddenNavPages()).toEqual(new Set(["meals", "money"]));
  });

  it("ignores unknown ids", () => {
    localStorage.setItem("homebot-nav-hidden", JSON.stringify(["meals", "not-a-page"]));
    expect(loadHiddenNavPages()).toEqual(new Set(["meals"]));
  });
});
