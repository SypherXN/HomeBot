import { describe, expect, it } from "vitest";
import { isIncomeLikeType } from "./budgetMoney";

describe("isIncomeLikeType", () => {
  it("treats reimbursements like income", () => {
    expect(isIncomeLikeType("income")).toBe(true);
    expect(isIncomeLikeType("reimbursement")).toBe(true);
    expect(isIncomeLikeType("expense")).toBe(false);
  });
});
