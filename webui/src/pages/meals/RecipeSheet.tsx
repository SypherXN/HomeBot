import Sheet from "../../components/Sheet";
import type { MealRecipe } from "../../api";

type Props = {
  recipe: MealRecipe | null;
  canActor: boolean;
  busy: boolean;
  onClose: () => void;
  onPlan: (recipe: MealRecipe) => void;
  onDelete: (recipe: MealRecipe) => void;
};

/** Paprika-style recipe card detail: description, ingredients, instructions, plan/delete actions. */
export default function RecipeSheet({ recipe, canActor, busy, onClose, onPlan, onDelete }: Props) {
  if (!recipe) return null;

  return (
    <Sheet open={recipe != null} title={recipe.name} onClose={onClose}>
      <div className="space-y-4">
        {(recipe.servings > 0 || recipe.description) && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            {recipe.servings > 0 && (
              <span className="rounded-full border border-slate-700 px-2 py-0.5">serves {recipe.servings}</span>
            )}
            <span className="rounded-full border border-slate-700 px-2 py-0.5">
              {recipe.ingredients.length} ingredient{recipe.ingredients.length === 1 ? "" : "s"}
            </span>
          </div>
        )}

        {recipe.description && <p className="text-sm text-slate-300">{recipe.description}</p>}

        {recipe.ingredients.length > 0 && (
          <div>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Ingredients</h3>
            <ul className="space-y-1 text-sm text-slate-200">
              {recipe.ingredients.map((ing, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-slate-600">•</span>
                  <span>
                    {ing.quantity && ing.quantity !== "1" ? (
                      <span className="font-medium text-slate-300">{ing.quantity} </span>
                    ) : null}
                    {ing.name}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {recipe.instructions && (
          <div>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Instructions</h3>
            <p className="whitespace-pre-wrap text-sm text-slate-300">{recipe.instructions}</p>
          </div>
        )}

        {canActor && (
          <div className="flex flex-wrap gap-2 border-t border-slate-800 pt-3">
            <button
              type="button"
              onClick={() => onPlan(recipe)}
              className="rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-2 text-sm font-medium text-white hover:from-blue-500 hover:to-blue-600"
            >
              Plan this meal
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onDelete(recipe)}
              className="rounded-lg border border-red-800/70 bg-red-950/30 px-4 py-2 text-sm text-red-200 hover:bg-red-950/60 disabled:opacity-50"
            >
              {busy ? "…" : "Delete recipe"}
            </button>
          </div>
        )}
      </div>
    </Sheet>
  );
}
