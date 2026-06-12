import { describe, expect, it } from "vitest";
import {
  reminderPartsToToken,
  reminderRawToToken,
  reminderTokenToParts,
} from "./calendarReminder";

describe("reminderRawToToken", () => {
  it("passes through shorthand tokens", () => {
    expect(reminderRawToToken("2h")).toBe("2h");
    expect(reminderRawToToken(" 1D ")).toBe("1d");
  });

  it("converts stored seconds to shorthand", () => {
    expect(reminderRawToToken("600")).toBe("10m");
    expect(reminderRawToToken("7200")).toBe("2h");
    expect(reminderRawToToken("86400")).toBe("1d");
  });

  it("returns empty for blank or invalid", () => {
    expect(reminderRawToToken("")).toBe("");
    expect(reminderRawToToken("nope")).toBe("");
  });
});

describe("reminderTokenToParts", () => {
  it("splits tokens into amount and unit", () => {
    expect(reminderTokenToParts("10m")).toEqual({ amount: "10", unit: "m" });
    expect(reminderTokenToParts("2h")).toEqual({ amount: "2", unit: "h" });
    expect(reminderTokenToParts("1d")).toEqual({ amount: "1", unit: "d" });
  });

  it("normalizes stored seconds before splitting", () => {
    expect(reminderTokenToParts("600")).toEqual({ amount: "10", unit: "m" });
  });

  it("returns empty amount for no reminder", () => {
    expect(reminderTokenToParts("")).toEqual({ amount: "", unit: "m" });
  });
});

describe("reminderPartsToToken", () => {
  it("builds API tokens from fields", () => {
    expect(reminderPartsToToken({ amount: "15", unit: "m" })).toBe("15m");
    expect(reminderPartsToToken({ amount: "3", unit: "h" })).toBe("3h");
    expect(reminderPartsToToken({ amount: "2", unit: "d" })).toBe("2d");
  });

  it("returns empty when amount is blank or zero", () => {
    expect(reminderPartsToToken({ amount: "", unit: "h" })).toBe("");
    expect(reminderPartsToToken({ amount: "0", unit: "h" })).toBe("");
  });
});
