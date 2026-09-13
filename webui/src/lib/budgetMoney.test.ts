import { describe, expect, it } from "vitest";
import { isDepositAccount, isIncomeLikeType } from "./budgetMoney";

describe("isDepositAccount", () => {
  it("allows checking and savings", () => {
    expect(isDepositAccount("checking")).toBe(true);
    expect(isDepositAccount("savings")).toBe(true);
    expect(isDepositAccount("Checking")).toBe(true);
  });

  it("rejects credit and cash", () => {
    expect(isDepositAccount("credit")).toBe(false);
    expect(isDepositAccount("cash")).toBe(false);
    expect(isDepositAccount("")).toBe(false);
  });
});

describe("isIncomeLikeType", () => {
  it("treats reimbursements like income for deposit accounts", () => {
    expect(isIncomeLikeType("income")).toBe(true);
    expect(isIncomeLikeType("reimbursement")).toBe(true);
    expect(isIncomeLikeType("expense")).toBe(false);
  });
});
