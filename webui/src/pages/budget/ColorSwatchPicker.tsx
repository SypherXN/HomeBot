const PRESETS = [
  "#3b82f6",
  "#06b6d4",
  "#8b5cf6",
  "#f59e0b",
  "#ef4444",
  "#10b981",
  "#ec4899",
  "#f97316",
  "#14b8a6",
  "#64748b",
];

type Props = {
  value: string;
  onChange: (hex: string) => void;
  label?: string;
};

/** Compact preset + native color picker used on budget categories, accounts, goals, and bills. */
export default function ColorSwatchPicker({ value, onChange, label = "Color" }: Props) {
  const native = value && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value) ? value : "#64748b";
  return (
    <div>
      <p className="mb-1 text-xs text-slate-500">{label}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {PRESETS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={c}
            title={c}
            onClick={() => onChange(c)}
            className={`h-6 w-6 rounded-full border ${
              value.toLowerCase() === c ? "ring-2 ring-white ring-offset-1 ring-offset-slate-900" : "border-slate-700"
            }`}
            style={{ backgroundColor: c }}
          />
        ))}
        <input
          type="color"
          aria-label="Custom color"
          value={native}
          onChange={(e) => onChange(e.target.value)}
          className="h-6 w-6 cursor-pointer rounded border border-slate-700 bg-transparent p-0"
        />
        {value ? (
          <button type="button" className="text-xs text-slate-400 hover:text-slate-200" onClick={() => onChange("")}>
            Clear
          </button>
        ) : null}
      </div>
    </div>
  );
}
