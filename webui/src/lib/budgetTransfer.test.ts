import { describe, expect, it } from "vitest";
import {
  formatTransferLedgerAmount,
  transferBonusLabel,
  transferReceivedAmount,
} from "./budgetTransfer";

describe("budgetTransfer", () => {
  it("uses the destination amount when it differs from what was paid", () => {
    expect(transferReceivedAmount({ amount: 80, transferToAmount: 100 })).toBe(100);
    expect(transferReceivedAmount({ amount: 80, transferToAmount: null })).toBe(80);
  });

  it("labels a gift-card bonus without treating it as income", () => {
    expect(transferBonusLabel(80, 100, (n) => n.toFixed(2))).toBe("Bonus $20.00 — not counted as income");
    expect(formatTransferLedgerAmount(80, 100, (n) => n.toFixed(2))).toBe("80.00 → 100.00");
    expect(formatTransferLedgerAmount(80, 80, (n) => n.toFixed(2))).toBe("80.00");
  });
});
