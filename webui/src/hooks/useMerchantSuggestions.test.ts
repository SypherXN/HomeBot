import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getBudgetCategorizeRules, getBudgetMerchants, type BudgetMerchant } from "../api";
import { useMerchantSuggestions } from "./useMerchantSuggestions";

vi.mock("../api", () => ({ getBudgetCategorizeRules: vi.fn(), getBudgetMerchants: vi.fn() }));

const history: BudgetMerchant[] = [
  { merchant: "H-E-B", categoryId: 7, categoryName: "Groceries" },
  { merchant: "Costco", categoryId: 8, categoryName: "Household" },
];

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getBudgetMerchants).mockResolvedValue(history);
  vi.mocked(getBudgetCategorizeRules).mockResolvedValue({ rules: [] });
});
afterEach(cleanup);

it("uses full merchant history and changes categories without stale lookups", async () => {
  const { result, rerender } = renderHook(({ name }) => useMerchantSuggestions("test-session", name), {
    initialProps: { name: "h" },
  });
  await waitFor(() => expect(result.current.merchants).toEqual(["H-E-B", "Costco"]));
  expect(result.current.suggestion).toBeNull();
  rerender({ name: " h-e-b " });
  expect(result.current.suggestion).toEqual({ categoryId: 7, categoryName: "Groceries", source: "last" });
  rerender({ name: "Costco" });
  expect(result.current.suggestion?.categoryId).toBe(8);
  rerender({ name: "H-E-B" });
  expect(result.current.suggestion?.categoryId).toBe(7);
  expect(getBudgetMerchants).toHaveBeenCalledTimes(1);
});

it("ignores note rules and nonexistent rule merchants, but prefers active merchant rules", async () => {
  vi.mocked(getBudgetCategorizeRules).mockResolvedValue({ rules: [
    { id: 1, matchField: "note", matchContains: "Costco", categoryId: 1, categoryName: "Wrong", priority: 100, isActive: true },
    { id: 2, matchField: "merchant", matchContains: "Never used", categoryId: 2, categoryName: "Other", priority: 10, isActive: true },
    { id: 3, matchField: "merchant", matchContains: "cost", categoryId: 9, categoryName: "Bulk", priority: 0, isActive: true },
  ] });
  const { result } = renderHook(() => useMerchantSuggestions("test-session", "Costco"));
  await waitFor(() => expect(result.current.suggestion?.source).toBe("rule"));
  expect(result.current.suggestion?.categoryId).toBe(9);
  expect(result.current.merchants).toEqual(["H-E-B", "Costco"]);
});

it("hides previous-session history and ignores cancelled responses", async () => {
  let resolveOld!: (rows: BudgetMerchant[]) => void;
  vi.mocked(getBudgetMerchants).mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; }));
  const { result, rerender } = renderHook(({ auth }) => useMerchantSuggestions(auth, "Costco"), {
    initialProps: { auth: "old-session" },
  });
  rerender({ auth: "new-session" });
  await waitFor(() => expect(result.current.merchants).toEqual(["H-E-B", "Costco"]));
  resolveOld([{ merchant: "Old private merchant", categoryId: 1, categoryName: "Old" }]);
  await waitFor(() => expect(result.current.checking).toBe(false));
  expect(result.current.merchants).toEqual(["H-E-B", "Costco"]);
  rerender({ auth: "" });
  expect(result.current.merchants).toEqual([]);
  expect(result.current.suggestion).toBeNull();
});
