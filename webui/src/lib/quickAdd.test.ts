import { describe, expect, it } from "vitest";
import { parseQuickAdd } from "./quickAdd";

const NOW = new Date(2026, 6, 28, 10, 0, 0); // Tue Jul 28 2026, 10:00 local

describe("parseQuickAdd", () => {
  it("routes bare text to the buy list", () => {
    expect(parseQuickAdd("paper towels", NOW)).toEqual({ kind: "buy", name: "paper towels", store: undefined });
  });

  it("parses a @store suffix", () => {
    expect(parseQuickAdd("milk @costco", NOW)).toEqual({ kind: "buy", name: "milk", store: "costco" });
    expect(parseQuickAdd("buy milk @costco", NOW)).toEqual({ kind: "buy", name: "milk", store: "costco" });
  });

  it("parses tasks", () => {
    expect(parseQuickAdd("task water the plants", NOW)).toEqual({ kind: "task", title: "water the plants" });
    expect(parseQuickAdd("todo: call dentist", NOW)).toEqual({ kind: "task", title: "call dentist" });
  });

  it("parses wishlist items", () => {
    expect(parseQuickAdd("wish standing desk", NOW)).toEqual({ kind: "wishlist", name: "standing desk" });
  });

  it("parses events with date words and 12h times", () => {
    expect(parseQuickAdd("event dinner tomorrow 6pm", NOW)).toEqual({
      kind: "event",
      title: "dinner",
      date: "2026-07-29",
      time: "18:00",
    });
    expect(parseQuickAdd("event dentist today 2:30pm", NOW)).toEqual({
      kind: "event",
      title: "dentist",
      date: "2026-07-28",
      time: "14:30",
    });
    expect(parseQuickAdd("event sync 09:00", NOW)).toEqual({
      kind: "event",
      title: "sync",
      date: "2026-07-28",
      time: "09:00",
    });
  });

  it("defaults event time to 09:00", () => {
    expect(parseQuickAdd("event birthday tomorrow", NOW)).toEqual({
      kind: "event",
      title: "birthday",
      date: "2026-07-29",
      time: "09:00",
    });
  });

  it("parses expenses with $ or spent keyword", () => {
    expect(parseQuickAdd("$12.50 chipotle", NOW)).toEqual({
      kind: "expense",
      amount: "12.50",
      merchant: "chipotle",
    });
    expect(parseQuickAdd("spent 12 on groceries", NOW)).toEqual({
      kind: "expense",
      amount: "12",
      merchant: "groceries",
    });
  });

  it("returns null for empty or prefix-only input", () => {
    expect(parseQuickAdd("", NOW)).toBeNull();
    expect(parseQuickAdd("   ", NOW)).toBeNull();
    expect(parseQuickAdd("task", NOW)).toBeNull();
    expect(parseQuickAdd("event 6pm", NOW)).toBeNull();
  });
});
