import { memberPickerLabel } from "./memberDisplay";
import { isGeneralShareLabel } from "./budgetShares";

export type SharePersonMember = {
  userId: string;
  username: string;
  displayName: string;
};

export type SharePersonChoice = {
  kind: "member" | "guest" | "custom";
  userId: string;
  label: string;
};

/** Distinct typed names, skipping blanks and household member labels. */
export function uniqueGuestNames(labels: string[], memberLabels: string[] = []): string[] {
  const members = new Set(memberLabels.map((s) => s.trim().toLowerCase()).filter(Boolean));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of labels) {
    const label = raw.trim();
    if (!label) continue;
    const key = label.toLowerCase();
    if (members.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
}

export function guestNamesFromCharges(
  charges: { owedByUserId?: string | null; owedByLabel: string }[]
): string[] {
  return uniqueGuestNames(
    charges
      .filter((c) => !c.owedByUserId && !isGeneralShareLabel(c.owedByLabel))
      .map((c) => c.owedByLabel)
  );
}

/**
 * Household members, previously typed guests, and an explicit "use this name"
 * row when the query is not already a known person.
 */
export function sharePersonChoices(
  members: SharePersonMember[],
  guests: string[],
  query: string
): SharePersonChoice[] {
  const q = query.trim().toLowerCase();
  const allMemberLabels = members.map((m) => memberPickerLabel(m));
  const memberChoices: SharePersonChoice[] = [];
  for (const m of members) {
    const label = memberPickerLabel(m);
    const hay = `${label} ${m.username} ${m.displayName}`.toLowerCase();
    if (q && !hay.includes(q)) continue;
    memberChoices.push({ kind: "member", userId: m.userId, label });
  }

  const guestChoices: SharePersonChoice[] = uniqueGuestNames(guests, allMemberLabels)
    .filter((label) => !q || label.toLowerCase().includes(q))
    .map((label) => ({ kind: "guest" as const, userId: "", label }));

  const exactMatch =
    Boolean(q) &&
    [...memberChoices, ...guestChoices].some((c) => c.label.toLowerCase() === q);
  const custom: SharePersonChoice[] =
    q && !exactMatch ? [{ kind: "custom", userId: "", label: query.trim() }] : [];

  return [...custom, ...memberChoices, ...guestChoices];
}

export function sharePersonChoiceCaption(choice: SharePersonChoice): string {
  if (choice.kind === "custom") return "Not in household";
  if (choice.kind === "guest") return "Saved name";
  return "Household";
}
