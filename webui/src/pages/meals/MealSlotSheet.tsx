import { useEffect, useState } from "react";
import Sheet from "../../components/Sheet";
import { titleCase } from "../../lib/titleCase";
import type { MealRecipe } from "../../api";

export type SlotAssignTarget = {
  date: string;
  slot: string;
  /** Preselect a recipe (e.g. from the recipe detail sheet). */
  recipeId?: number;
};

type Props = {
  target: SlotAssignTarget | null;
  recipes: MealRecipe[];
  canActor: boolean;
  onClose: () => void;
  onAssign: (input: {
    planDate: string;
    mealSlot: string;
    recipeId?: number;
    customLabel?: string;
    notes?: string;
    addToCalendar?: boolean;
  }) => Promise<void>;
};

/** Mealime-style "what's for {slot}?" picker: recipe list, custom label, notes, surprise me. */
export default function MealSlotSheet({ target, recipes, canActor, onClose, onAssign }: Props) {
  const [recipeId, setRecipeId] = useState("");
  const [customLabel, setCustomLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [addToCalendar, setAddToCalendar] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!target) return;
    setRecipeId(target.recipeId != null ? String(target.recipeId) : "");
    setCustomLabel("");
    setNotes("");
    setBusy(false);
  }, [target]);

  if (!target) return null;

  const prettyDate = new Date(`${target.date}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  async function save() {
    const rid = recipeId ? Number.parseInt(recipeId, 10) : undefined;
    const label = customLabel.trim();
    if (rid == null && !label) return;
    setBusy(true);
    try {
      await onAssign({
        planDate: target!.date,
        mealSlot: target!.slot,
        recipeId: rid,
        customLabel: rid == null ? label : undefined,
        notes: notes.trim() || undefined,
        addToCalendar: addToCalendar && canActor,
      });
      onClose();
    } finally {
      setBusy(false);
    }
  }

  function surprise() {
    if (recipes.length === 0) return;
    const pick = recipes[Math.floor(Math.random() * recipes.length)];
    setRecipeId(String(pick.id));
    setCustomLabel("");
  }

  return (
    <Sheet
      open={target != null}
      title={`${titleCase(target.slot)} · ${prettyDate}`}
      onClose={onClose}
    >
      <div className="space-y-3">
        {recipes.length > 0 && (
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs text-slate-400">Pick a recipe</span>
              <button
                type="button"
                onClick={surprise}
                className="rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:border-amber-600 hover:text-amber-300"
              >
                🎲 Surprise me
              </button>
            </div>
            <ul className="max-h-56 space-y-1 overflow-y-auto">
              {recipes.map((r) => {
                const on = recipeId === String(r.id);
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setRecipeId(on ? "" : String(r.id));
                        if (!on) setCustomLabel("");
                      }}
                      className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm ${
                        on
                          ? "border-blue-600 bg-blue-950/40 text-blue-100"
                          : "border-slate-700 bg-slate-900/40 text-slate-200 hover:border-slate-600"
                      }`}
                    >
                      <span className="min-w-0 truncate">{r.name}</span>
                      <span className="shrink-0 text-xs text-slate-500">
                        {r.servings > 0 ? `serves ${r.servings} · ` : ""}
                        {r.ingredients.length} ing.
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div>
          <span className="mb-1 block text-xs text-slate-400">
            {recipes.length > 0 ? "Or something else" : "What's the meal?"}
          </span>
          <input
            value={customLabel}
            onChange={(e) => {
              setCustomLabel(e.target.value);
              if (e.target.value.trim()) setRecipeId("");
            }}
            placeholder="e.g. Takeout, Leftovers, Pizza night"
            className="w-full hb-input px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
          />
        </div>

        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          className="w-full hb-input px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
        />

        {canActor && (
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={addToCalendar}
              onChange={(e) => setAddToCalendar(e.target.checked)}
              className="h-4 w-4 rounded border-slate-600"
            />
            Also add to calendar
          </label>
        )}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            disabled={busy || (!recipeId && !customLabel.trim())}
            onClick={() => void save()}
            className="rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-2 text-sm font-medium text-white hover:from-blue-500 hover:to-blue-600 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Add to plan"}
          </button>
          <button type="button" onClick={onClose} className="rounded-lg hb-btn-soft px-4 py-2 text-sm text-slate-300">
            Cancel
          </button>
        </div>
      </div>
    </Sheet>
  );
}
