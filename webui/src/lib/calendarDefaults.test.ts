import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { defaultEndTimeForSlot, defaultStartTimeForDate, minutesToHm } from "./calendarDefaults";

describe("defaultStartTimeForDate", () => {
  it("returns 09:00 for a date that is not today", () => {
    const other = DateTime.now().plus({ days: 3 }).toISODate()!;
    expect(defaultStartTimeForDate(other, "UTC")).toBe("09:00");
  });

  it("returns the next full hour when the date is today", () => {
    const today = DateTime.now().setZone("UTC").toISODate()!;
    const expected = DateTime.now().setZone("UTC").plus({ hours: 1 }).startOf("hour");
    const got = defaultStartTimeForDate(today, "UTC");
    if (expected.toISODate() === today) {
      expect(got).toBe(expected.toFormat("HH:mm"));
    } else {
      expect(got).toBe("23:00");
    }
  });

  it("produces a valid HH:mm wall time", () => {
    const today = DateTime.now().toISODate()!;
    expect(defaultStartTimeForDate(today, "America/Los_Angeles")).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe("minutesToHm", () => {
  it("formats hours and minutes", () => {
    expect(minutesToHm(0)).toBe("00:00");
    expect(minutesToHm(570)).toBe("09:30");
    expect(minutesToHm(1410)).toBe("23:30");
  });
});

describe("defaultEndTimeForSlot", () => {
  it("is one hour after the start", () => {
    expect(defaultEndTimeForSlot(840)).toBe("15:00");
  });

  it("is undefined when the end would cross midnight", () => {
    expect(defaultEndTimeForSlot(1410)).toBeUndefined();
  });
});
