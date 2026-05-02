import { CALENDAR_TIME_ZONE_OPTIONS } from "../calendar/timeZoneOptions";
import { effectiveTimeZone } from "../calendar/calendarZoned";

type Props = {
  id?: string;
  /** Stored value: "" means browser default. */
  value: string;
  onChange: (zoneId: string) => void;
  disabled?: boolean;
  className?: string;
};

export default function TimeZoneSelect({ id, value, onChange, disabled, className }: Props) {
  const browser = effectiveTimeZone("");
  return (
    <select
      id={id}
      disabled={disabled}
      value={value.trim() === "" ? "" : value}
      onChange={(e) => onChange(e.target.value)}
      className={
        className ??
        "h-9 max-w-[220px] truncate rounded-md border border-slate-700 bg-slate-950 px-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
      }
    >
      <option value="">Browser ({browser})</option>
      {CALENDAR_TIME_ZONE_OPTIONS.map((z) => (
        <option key={z.id} value={z.id}>
          {z.label} ({z.id})
        </option>
      ))}
    </select>
  );
}
