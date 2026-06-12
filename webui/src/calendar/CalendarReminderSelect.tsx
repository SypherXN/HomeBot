import { useMemo } from "react";
import {
  CALENDAR_REMINDER_OPTIONS,
  isPresetReminder,
  reminderOptionLabel,
  reminderRawToToken,
} from "../lib/calendarReminder";

type Props = {
  value: string;
  onChange: (token: string) => void;
  className?: string;
  disabled?: boolean;
};

/** Dropdown for calendar reminder offsets (API tokens: 10m, 2h, 1d, …). */
export default function CalendarReminderSelect({ value, onChange, className = "", disabled = false }: Props) {
  const token = useMemo(() => reminderRawToToken(value), [value]);
  const showLegacy = token !== "" && !isPresetReminder(token);

  return (
    <select
      value={token}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={`hb-input px-3 py-2 text-sm text-slate-100 ${className}`.trim()}
    >
      {CALENDAR_REMINDER_OPTIONS.map(({ value: v, label }) => (
        <option key={v || "none"} value={v}>
          {label}
        </option>
      ))}
      {showLegacy ? (
        <option value={token}>{reminderOptionLabel(token)} (saved)</option>
      ) : null}
    </select>
  );
}
