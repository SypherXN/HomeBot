import type { DiscordGuildMember, DiscordGuildMembersResponse } from "../api";

const OPAQUE_MEMBER_LABEL = /^member-(\d+)$/;

/** True when the API sent the opaque `member-{snowflake}` placeholder. */
export function isOpaqueMemberLabel(label: string | null | undefined): boolean {
  return OPAQUE_MEMBER_LABEL.test((label ?? "").trim());
}

/** Digit snowflake from a `member-{id}` household label, if present. */
export function snowflakeFromMemberLabel(label: string | null | undefined): string | null {
  const m = OPAQUE_MEMBER_LABEL.exec((label ?? "").trim());
  return m?.[1] ?? null;
}

/**
 * Exact Discord user id for roster lookup. Prefer the `member-{id}` label when
 * present (JSON numbers cannot represent every snowflake), then a digit string id.
 */
export function memberSnowflake(
  userId?: string | number | null,
  memberLabel?: string | null
): string {
  const fromLabel = snowflakeFromMemberLabel(memberLabel);
  if (fromLabel) return fromLabel;
  if (typeof userId === "string") {
    const t = userId.trim();
    if (/^\d+$/.test(t) && t !== "0") return t;
  }
  if (typeof userId === "number" && Number.isFinite(userId) && userId > 0) {
    return String(Math.trunc(userId));
  }
  return "";
}

function memberFromRoster(
  roster: DiscordGuildMembersResponse | null | undefined,
  id: string
): DiscordGuildMember | undefined {
  if (!id || !roster?.available || !roster.members.length) return undefined;
  return roster.members.find((m) => m.userId === id);
}

/** Discord username from the guild roster, or null if that person is not cached. */
export function lookupMemberUsername(
  roster: DiscordGuildMembersResponse | null | undefined,
  userId?: string | number | null,
  memberLabel?: string | null
): string | null {
  const id = memberSnowflake(userId, memberLabel);
  if (!id) return null;
  const mem = memberFromRoster(roster, id);
  const username = mem?.username?.trim();
  if (username) return username;
  const display = mem?.displayName?.trim();
  return display || null;
}

/**
 * Label for lists and badges: Discord username when the roster has it,
 * otherwise a non-opaque fallback, otherwise `member-{id}`.
 */
export function memberUsername(
  roster: DiscordGuildMembersResponse | null | undefined,
  userId?: string | number | null,
  memberLabel?: string | null
): string {
  const lookedUp = lookupMemberUsername(roster, userId, memberLabel);
  if (lookedUp) return lookedUp;
  const fallback = (memberLabel ?? "").trim();
  if (fallback && !isOpaqueMemberLabel(fallback)) return fallback;
  const id = memberSnowflake(userId, memberLabel);
  if (fallback) return fallback;
  return id ? `member-${id}` : "";
}

/** Option text in member pickers: Discord username (unique, readable). */
export function memberPickerLabel(m: Pick<DiscordGuildMember, "username" | "displayName" | "userId">): string {
  const username = m.username.trim();
  if (username) return username;
  const display = m.displayName.trim();
  if (display) return display;
  return m.userId;
}
