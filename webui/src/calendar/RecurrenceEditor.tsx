import {
  type RecurrenceEditorState,
  type RecurrencePreset,
} from "../lib/recurrenceEditor";

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

type Props = {
  value: RecurrenceEditorState;
  onChange: (next: RecurrenceEditorState) => void;
  inputClass: string;
  idPrefix?: string;
};

/** Recurrence editor: preset + weekly day checkboxes + optional end (never / on date / after N). */
export default function RecurrenceEditor({ value, onChange, inputClass, idPrefix = "rec" }: Props) {
  function setPreset(preset: RecurrencePreset) {
    onChange({ ...value, preset });
  }
  function toggleDay(day: number) {
    const has = value.weeklyDays.includes(day);
    const next = has ? value.weeklyDays.filter((d) => d !== day) : [...value.weeklyDays, day].sort((a, b) => a - b);
    if (next.length === 0) return; // keep at least one day
    onChange({ ...value, weeklyDays: next });
  }

  return (
    <div className="space-y-2.5">
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block min-w-0">
          <span className="mb-1 block text-xs font-medium text-slate-400">Recurrence</span>
          <select
            value={value.preset}
            onChange={(e) => setPreset(e.target.value as RecurrencePreset)}
            className={inputClass}
          >
            <option value="">None</option>
            <option value="daily">Daily</option>
            <option value="weekdays">Every weekday</option>
            <option value="weekly">Weekly</option>
            <option value="biweekly">Every 2 weeks</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Annual</option>
          </select>
        </label>
        {value.preset !== "" && (
          <label className="block min-w-0">
            <span className="mb-1 block text-xs font-medium text-slate-400">Ends</span>
            <select
              value={value.endKind}
              onChange={(e) => onChange({ ...value, endKind: e.target.value as RecurrenceEditorState["endKind"] })}
              className={inputClass}
            >
              <option value="never">Never</option>
              <option value="until">On date…</option>
              <option value="count">After N times…</option>
            </select>
          </label>
        )}
      </div>

      {value.preset === "weekly" && (
        <div>
          <span className="mb-1.5 block text-xs font-medium text-slate-400">On days</span>
          <div className="flex flex-wrap gap-1.5">
            {DAY_LABELS.map((lbl, day) => {
              const active = value.weeklyDays.includes(day);
              return (
                <button
                  key={`${idPrefix}-d${day}`}
                  type="button"
                  onClick={() => toggleDay(day)}
                  aria-pressed={active}
                  className={`h-8 w-8 rounded-md text-xs font-semibold transition-colors ${
                    active
                      ? "bg-blue-600 text-white"
                      : "border border-slate-700 bg-slate-900 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {lbl}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {value.preset !== "" && value.endKind === "until" && (
        <label className="block min-w-0">
          <span className="mb-1 block text-xs font-medium text-slate-400">Until date</span>
          <input
            type="date"
            value={value.untilDate}
            onChange={(e) => onChange({ ...value, untilDate: e.target.value })}
            className={inputClass}
          />
        </label>
      )}
      {value.preset !== "" && value.endKind === "count" && (
        <label className="block min-w-0">
          <span className="mb-1 block text-xs font-medium text-slate-400">Number of occurrences</span>
          <input
            type="number"
            min={1}
            inputMode="numeric"
            value={value.count}
            onChange={(e) => onChange({ ...value, count: e.target.value })}
            className={inputClass}
          />
        </label>
      )}
    </div>
  );
}
