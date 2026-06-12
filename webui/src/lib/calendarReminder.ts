/** Preset reminder offsets accepted by the API (ReminderParser). */
export const CALENDAR_REMINDER_OPTIONS = [
  { value: "", label: "None" },
  { value: "5m", label: "5 minutes before" },
  { value: "10m", label: "10 minutes before" },
  { value: "15m", label: "15 minutes before" },
  { value: "30m", label: "30 minutes before" },
  { value: "1h", label: "1 hour before" },
  { value: "2h", label: "2 hours before" },
  { value: "4h", label: "4 hours before" },
  { value: "1d", label: "1 day before" },
] as const;

const PRESET_VALUES = new Set<string>(
  CALENDAR_REMINDER_OPTIONS.map((o) => o.value).filter((v) => v !== "")
);

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

export function reminderOptionLabel(token: string): string {
  const preset = CALENDAR_REMINDER_OPTIONS.find((o) => o.value === token);
  if (preset) return preset.label;
  if (!token) return "None";
  return `${token} before`;
}

export function isPresetReminder(token: string): boolean {
  return PRESET_VALUES.has(token);
}
