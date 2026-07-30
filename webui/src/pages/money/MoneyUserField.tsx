export type MoneyUserOption = { value: string; label: string };

type Props = {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  rosterOptions: MoneyUserOption[];
  canActor: boolean;
  onPickActor: () => void;
};

/** Person picker: roster dropdown when available, numeric id input otherwise. */
export default function MoneyUserField({ id, label, value, onChange, rosterOptions, canActor, onPickActor }: Props) {
  const knownValues = new Set(rosterOptions.map((o) => o.value));
  const showExtraOption = value.length > 0 && !knownValues.has(value);

  if (rosterOptions.length > 0) {
    return (
      <div>
        <label htmlFor={id} className="mb-1 block text-xs font-medium text-slate-400">
          {label}
        </label>
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 w-full hb-input px-3 text-sm text-slate-100"
        >
          <option value="">Select…</option>
          {rosterOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
          {showExtraOption && <option value={value}>Other ({value})</option>}
        </select>
        {canActor && (
          <button type="button" className="mt-1 text-xs text-blue-400 hover:underline" onClick={onPickActor}>
            Me
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-slate-400">
        {label} (user id)
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value.trim())}
        inputMode="numeric"
        placeholder="Discord user id"
        className="w-full hb-input px-3 py-2.5 text-sm text-slate-100"
      />
      {canActor && (
        <button type="button" className="mt-1 text-xs text-blue-400 hover:underline" onClick={onPickActor}>
          Fill with me
        </button>
      )}
    </div>
  );
}
