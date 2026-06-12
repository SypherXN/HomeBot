export type ReminderUnit = "m" | "h" | "d";

export type ReminderParts = {
  amount: string;
  unit: ReminderUnit;
};

export const REMINDER_UNIT_OPTIONS: { value: ReminderUnit; label: string }[] = [
  { value: "m", label: "Minutes" },
  { value: "h", label: "Hours" },
  { value: "d", label: "Days" },
];

/** DB stores seconds; API writes accept shorthand tokens (10m, 2h, 1d). */
export function reminderRawToToken(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  if (/^\d+(m|h|d)$/i.test(trimmed)) return trimmed.toLowerCase();

  const seconds = Number(trimmed);
  if (!Number.isFinite(seconds) || seconds <= 0) return "";

  const days = Math.floor(seconds / 86_400);
  if (days >= 1) return `${days}d`;
  const hours = Math.floor(seconds / 3_600);
  if (hours >= 1) return `${hours}h`;
  const minutes = Math.floor(seconds / 60);
  if (minutes >= 1) return `${minutes}m`;
  return "";
}

export function reminderTokenToParts(token: string): ReminderParts {
  const normalized = reminderRawToToken(token);
  if (!normalized) return { amount: "", unit: "m" };

  const match = /^(\d+)(m|h|d)$/.exec(normalized);
  if (!match) return { amount: "", unit: "m" };

  return {
    amount: match[1],
    unit: match[2] as ReminderUnit,
  };
}

export function reminderPartsToToken(parts: ReminderParts): string {
  const amount = parts.amount.trim();
  if (!amount || !/^\d+$/.test(amount) || Number(amount) <= 0) return "";
  return `${amount}${parts.unit}`;
}
