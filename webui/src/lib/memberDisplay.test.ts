import { describe, expect, it } from "vitest";
import type { DiscordGuildMembersResponse } from "../api";
import {
  isOpaqueMemberLabel,
  lookupMemberUsername,
  memberPickerLabel,
  memberSnowflake,
  memberUsername,
  snowflakeFromMemberLabel,
} from "./memberDisplay";

const roster: DiscordGuildMembersResponse = {
  available: true,
  reason: null,
  guildId: "1",
  members: [
    { userId: "100001", displayName: "Matt", username: "sypher" },
    { userId: "100002", displayName: "Alex", username: "" },
  ],
};

describe("memberDisplay", () => {
  it("parses member-{id} labels", () => {
    expect(isOpaqueMemberLabel("member-9007199254740991")).toBe(true);
    expect(snowflakeFromMemberLabel("member-9007199254740991")).toBe("9007199254740991");
    expect(isOpaqueMemberLabel("sypher")).toBe(false);
    expect(snowflakeFromMemberLabel("sypher")).toBeNull();
  });

  it("prefers the label snowflake over a possibly rounded JSON number", () => {
    expect(memberSnowflake(9007199254740991, "member-9007199254740993")).toBe("9007199254740993");
    expect(memberSnowflake("100001", "member-100001")).toBe("100001");
  });

  it("resolves Discord username from the roster", () => {
    expect(lookupMemberUsername(roster, "100001", "member-100001")).toBe("sypher");
    expect(memberUsername(roster, "100001", "member-100001")).toBe("sypher");
  });

  it("falls back to display name when username is empty", () => {
    expect(memberUsername(roster, "100002", "member-100002")).toBe("Alex");
  });

  it("keeps member-{id} when the roster does not have that user", () => {
    expect(memberUsername(roster, "100009", "member-100009")).toBe("member-100009");
    expect(memberUsername(null, "100001", "member-100001")).toBe("member-100001");
  });

  it("uses a non-opaque fallback when Discord is offline", () => {
    expect(memberUsername(null, "100001", "Alex")).toBe("Alex");
  });

  it("picker label is the Discord username", () => {
    expect(memberPickerLabel({ userId: "1", displayName: "Matt", username: "sypher" })).toBe("sypher");
    expect(memberPickerLabel({ userId: "1", displayName: "Matt", username: "" })).toBe("Matt");
  });
});
