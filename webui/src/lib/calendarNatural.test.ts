import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { parseNaturalCreate } from "./calendarNatural";

const ZONE = "UTC";
const now = DateTime.now().setZone(ZONE);

describe("parseNaturalCreate", () => {
  it("parses a weekday + time + duration", () => {
    const r = parseNaturalCreate("dentist thursday 3pm 1h", ZONE);
    expect(r).not.toBeNull();
    expect(r!.title).toBe("dentist");
    expect(r!.startTime).toBe("15:00");
    expect(r!.endTime).toBe("16:00");
    expect(r!.ymd).toBeDefined();
    const d = DateTime.fromISO(r!.ymd!, { zone: ZONE });
    expect(d.weekday).toBe(4); // Thursday
    expect(d >= now.startOf("day")).toBe(true);
  });

  it("parses today with a 24h time", () => {
    const r = parseNaturalCreate("call mom today 18:30", ZONE);
    expect(r!.title).toBe("call mom");
    expect(r!.ymd).toBe(now.toISODate());
    expect(r!.startTime).toBe("18:30");
    expect(r!.endTime).toBeUndefined();
  });

  it("parses tomorrow and noon", () => {
    const r = parseNaturalCreate("lunch with sam tomorrow noon", ZONE);
    expect(r!.title).toBe("lunch with sam");
    expect(r!.ymd).toBe(now.plus({ days: 1 }).toISODate());
    expect(r!.startTime).toBe("12:00");
  });

  it("parses a month + day and rolls into the future", () => {
    const r = parseNaturalCreate("mom birthday august 12", ZONE);
    expect(r!.title).toBe("mom birthday");
    const d = DateTime.fromISO(r!.ymd!, { zone: ZONE });
    expect(d.month).toBe(8);
    expect(d.day).toBe(12);
    expect(d >= now.startOf("day")).toBe(true);
  });

  it("parses next <weekday> as the following week", () => {
    const r = parseNaturalCreate("review next monday 9am", ZONE);
    const d = DateTime.fromISO(r!.ymd!, { zone: ZONE });
    expect(d.weekday).toBe(1);
    expect(d > now.plus({ days: 6 }).startOf("day")).toBe(true);
    expect(r!.startTime).toBe("09:00");
  });

  it("returns null when no title remains", () => {
    expect(parseNaturalCreate("thursday 3pm", ZONE)).toBeNull();
    expect(parseNaturalCreate("", ZONE)).toBeNull();
  });

  it("keeps unrecognized words in the title", () => {
    const r = parseNaturalCreate("water the plants today", ZONE);
    expect(r!.title).toBe("water the plants");
  });
});
