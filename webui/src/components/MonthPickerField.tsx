import { formatMonthLong } from "../lib/budgetMoney";
import { Icon } from "./icons";

type Props = {
  id?: string;
  value: string;
  onChange: (month: string) => void;
  "aria-label"?: string;
};

/**
 * Native `type="month"` with a painted label. Chromium’s inner datetime-edit
 * will not vertically center “August 2026” in a fixed-height field.
 */
export default function MonthPickerField({ id, value, onChange, "aria-label": ariaLabel }: Props) {
  const label = formatMonthLong(value);
  return (
    <div className="relative box-border h-full w-[12rem] min-w-[12rem] hb-input focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-400/25">
      <span
        aria-hidden
        className="pointer-events-none flex h-full items-center justify-center px-3 text-sm leading-none text-slate-100"
      >
        {label}
      </span>
      <Icon
        name="calendar"
        className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300"
      />
      <input
        id={id}
        type="month"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel ?? `Month, ${label}`}
        className="absolute inset-0 z-10 cursor-pointer opacity-0"
      />
    </div>
  );
}
