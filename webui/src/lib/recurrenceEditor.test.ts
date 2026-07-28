import { describe, expect, it } from "vitest";
import {
  emptyRecurrence,
  formatRecurrence,
  parseRecurrence,
} from "./recurrenceEditor";

describe("recurrenceEditor round-trip", () => {
  it("empty preset serializes to empty string", () => {
    expect(formatRecurrence(emptyRecurrence())).toBe("");
    expect(parseRecurrence("").preset).toBe("");
  });

  it("simple presets round-trip", () => {
    for (const raw of ["daily", "monthly", "yearly", "biweekly"]) {
      expect(formatRecurrence(parseRecurrence(raw))).toBe(raw);
    }
  });

  it("weekdays preset parses to the weekdays shortcut", () => {
    const s = parseRecurrence("weekly:MO,TU,WE,TH,FR");
    expect(s.preset).toBe("weekdays");
    expect(formatRecurrence(s)).toBe("weekly:MO,TU,WE,TH,FR");
  });

  it("custom weekly days round-trip sorted Monday-first", () => {
    const s = parseRecurrence("weekly:SU,WE,MO");
    expect(s.preset).toBe("weekly");
    expect(s.weeklyDays).toEqual([0, 1, 3]);
    expect(formatRecurrence(s)).toBe("weekly:MO,WE,SU");
  });

  it("until bound round-trips", () => {
    const s = parseRecurrence("daily;UNTIL=20260416");
    expect(s.preset).toBe("daily");
    expect(s.endKind).toBe("until");
    expect(s.untilDate).toBe("2026-04-16");
    expect(formatRecurrence(s)).toBe("daily;UNTIL=20260416");
  });

  it("count bound round-trips", () => {
    const s = parseRecurrence("weekly:MO,WE;COUNT=5");
    expect(s.endKind).toBe("count");
    expect(s.count).toBe("5");
    expect(formatRecurrence(s)).toBe("weekly:MO,WE;COUNT=5");
  });

  it("biweekly with until", () => {
    const s = parseRecurrence("biweekly;UNTIL=20261231");
    expect(s.preset).toBe("biweekly");
    expect(formatRecurrence(s)).toBe("biweekly;UNTIL=20261231");
  });

  it("annual maps to yearly", () => {
    const s = parseRecurrence("annual");
    expect(s.preset).toBe("yearly");
  });
});
