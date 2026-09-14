import { describe, expect, it } from "vitest";
import {
  guestNamesFromCharges,
  sharePersonChoiceCaption,
  sharePersonChoices,
  uniqueGuestNames,
} from "./sharePerson";

const members = [
  { userId: "1", username: "sypher", displayName: "Matt" },
  { userId: "2", username: "cisy", displayName: "Cisy" },
];

describe("sharePersonChoices", () => {
  it("lists household members when the query is empty", () => {
    const rows = sharePersonChoices(members, ["Alex"], "");
    expect(rows.map((r) => r.label)).toEqual(["sypher", "cisy", "Alex"]);
    expect(rows.map((r) => r.kind)).toEqual(["member", "member", "guest"]);
  });

  it("offers a typed name that is not in the household", () => {
    const rows = sharePersonChoices(members, [], "Jordan");
    expect(rows[0]).toEqual({ kind: "custom", userId: "", label: "Jordan" });
    expect(sharePersonChoiceCaption(rows[0])).toBe("Not in household");
    expect(rows.some((r) => r.kind === "member")).toBe(false);
  });

  it("does not duplicate a typed name that already matches a member", () => {
    const rows = sharePersonChoices(members, [], "sypher");
    expect(rows.filter((r) => r.kind === "custom")).toHaveLength(0);
    expect(rows[0]).toMatchObject({ kind: "member", userId: "1", label: "sypher" });
  });

  it("filters members and guests by the query", () => {
    const rows = sharePersonChoices(members, ["Alex", "Sam"], "al");
    expect(rows.map((r) => r.label)).toEqual(["al", "Alex"]);
    expect(rows[0].kind).toBe("custom");
    expect(rows[1].kind).toBe("guest");
  });
});

describe("uniqueGuestNames", () => {
  it("drops blanks, duplicates, and household labels", () => {
    expect(uniqueGuestNames([" Alex ", "alex", "sypher", ""], ["sypher"])).toEqual(["Alex"]);
  });
});

describe("guestNamesFromCharges", () => {
  it("keeps labels that are not tied to a Discord user id", () => {
    expect(
      guestNamesFromCharges([
        { owedByUserId: "1", owedByLabel: "sypher" },
        { owedByUserId: null, owedByLabel: "Jordan" },
        { owedByUserId: "", owedByLabel: "  Pat  " },
      ])
    ).toEqual(["Jordan", "Pat"]);
  });
});
