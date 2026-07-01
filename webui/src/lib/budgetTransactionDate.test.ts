import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  currentBudgetMonth,
  defaultTransactionDateForMonth,
  todayBudgetDate,
} from "./budgetTransactionDate";

describe("budgetTransactionDate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-10T12:00:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("currentBudgetMonth returns YYYY-MM", () => {
    expect(currentBudgetMonth()).toBe("2026-04");
  });

  it("todayBudgetDate returns local YYYY-MM-DD", () => {
    expect(todayBudgetDate()).toBe("2026-04-10");
  });

  it("defaults to today when viewing the current month", () => {
    expect(defaultTransactionDateForMonth("2026-04")).toBe("2026-04-10");
  });

  it("defaults to first of month when viewing a different month", () => {
    expect(defaultTransactionDateForMonth("2026-03")).toBe("2026-03-01");
    expect(defaultTransactionDateForMonth("2025-12")).toBe("2025-12-01");
  });
});
