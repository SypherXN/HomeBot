import { describe, expect, it } from "vitest";
import { isPresetReminder, reminderOptionLabel, reminderRawToToken } from "./calendarReminder";

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

describe("reminderOptionLabel", () => {
  it("uses preset labels", () => {
    expect(reminderOptionLabel("10m")).toBe("10 minutes before");
  });

  it("falls back for custom offsets", () => {
    expect(reminderOptionLabel("45m")).toBe("45m before");
  });
});

describe("isPresetReminder", () => {
  it("knows preset tokens", () => {
    expect(isPresetReminder("10m")).toBe(true);
    expect(isPresetReminder("45m")).toBe(false);
  });
});
