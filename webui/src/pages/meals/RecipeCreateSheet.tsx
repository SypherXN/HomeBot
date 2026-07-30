import { useState } from "react";
import Sheet from "../../components/Sheet";
import type { MealIngredient } from "../../api";
import { parseIngredientLines } from "./mealUtils";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreate: (input: {
    name: string;
    description?: string;
    ingredients?: MealIngredient[];
    instructions?: string;
    servings?: number;
  }) => Promise<void>;
};

/** Create-a-recipe sheet: name, servings, description, ingredients, instructions. */
export default function RecipeCreateSheet({ open, onClose, onCreate }: Props) {
  const [name, setName] = useState("");
  const [servings, setServings] = useState("");
  const [description, setDescription] = useState("");
  const [ingredientsText, setIngredientsText] = useState("");
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);

  function reset() {
    setName("");
    setServings("");
    setDescription("");
    setIngredientsText("");
    setInstructions("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await onCreate({
        name: name.trim(),
        description: description.trim() || undefined,
        ingredients: parseIngredientLines(ingredientsText),
        instructions: instructions.trim() || undefined,
        servings: servings ? Math.max(0, Number.parseInt(servings, 10) || 0) : undefined,
      });
      reset();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} title="New recipe" onClose={onClose}>
      <form onSubmit={(e) => void submit(e)} className="space-y-3">
        <div className="grid grid-cols-[1fr_6rem] gap-3">
          <label className="block text-xs text-slate-400">
            Name
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Chicken tacos"
              className="mt-1 w-full hb-input px-3 py-2 text-slate-100 placeholder:text-slate-500"
            />
          </label>
          <label className="block text-xs text-slate-400">
            Serves
            <input
              value={servings}
              onChange={(e) => setServings(e.target.value.replace(/\D/g, "").slice(0, 3))}
              inputMode="numeric"
              placeholder="4"
              className="mt-1 w-full hb-input px-3 py-2 text-slate-100 placeholder:text-slate-500"
            />
          </label>
        </div>
        <label className="block text-xs text-slate-400">
          Description (optional)
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Weeknight favorite"
            className="mt-1 w-full hb-input px-3 py-2 text-slate-100 placeholder:text-slate-500"
          />
        </label>
        <label className="block text-xs text-slate-400">
          Ingredients — one per line, quantity first
          <textarea
            value={ingredientsText}
            onChange={(e) => setIngredientsText(e.target.value)}
            placeholder={"2 cups rice\n1 lb chicken\nsalsa"}
            rows={5}
            className="mt-1 w-full resize-y hb-input px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
          />
        </label>
        <label className="block text-xs text-slate-400">
          Instructions (optional)
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={3}
            className="mt-1 w-full resize-y hb-input px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
          />
        </label>
        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-2 text-sm font-medium text-white hover:from-blue-500 hover:to-blue-600 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save recipe"}
          </button>
          <button type="button" onClick={onClose} className="rounded-lg hb-btn-soft px-4 py-2 text-sm text-slate-300">
            Cancel
          </button>
        </div>
      </form>
    </Sheet>
  );
}
