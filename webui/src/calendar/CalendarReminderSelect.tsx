import { useEffect, useState } from "react";
import {
  REMINDER_UNIT_OPTIONS,
  reminderPartsToToken,
  reminderTokenToParts,
  type ReminderParts,
  type ReminderUnit,
} from "../lib/calendarReminder";

type Props = {
  value: string;
  onChange: (token: string) => void;
  className?: string;
  disabled?: boolean;
};

/** Amount + unit fields for calendar reminder offsets (API tokens: 10m, 2h, 1d, …). */
export default function CalendarReminderSelect({ value, onChange, className = "", disabled = false }: Props) {
  const [parts, setParts] = useState<ReminderParts>(() => reminderTokenToParts(value));

  useEffect(() => {
    setParts(reminderTokenToParts(value));
  }, [value]);

  const emit = (next: ReminderParts) => {
    setParts(next);
    onChange(reminderPartsToToken(next));
  };

  const fieldClass = "hb-input min-w-0 px-3 py-2 text-sm text-slate-100";

  return (
    <div className={`grid grid-cols-[minmax(4rem,1fr)_minmax(6.5rem,1.2fr)] gap-2 ${className}`.trim()}>
      <input
        type="number"
        min={1}
        inputMode="numeric"
        disabled={disabled}
        value={parts.amount}
        placeholder="—"
        aria-label="Reminder amount"
        onChange={(e) => {
          const v = e.target.value;
          if (v === "" || /^\d+$/.test(v)) emit({ ...parts, amount: v });
        }}
        className={fieldClass}
      />
      <select
        disabled={disabled}
        value={parts.unit}
        aria-label="Reminder unit"
        onChange={(e) => emit({ ...parts, unit: e.target.value as ReminderUnit })}
        className={fieldClass}
      >
        {REMINDER_UNIT_OPTIONS.map(({ value: v, label }) => (
          <option key={v} value={v}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}
