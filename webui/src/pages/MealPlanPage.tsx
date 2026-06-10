import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { validActorId } from "../lib/validation";
import {
  deleteMealPlanEntry,
  deleteMealRecipe,
  getMealPlan,
  getMealRecipes,
  postMealPlanEntry,
  postMealPlanAddToBuy,
  postMealRecipe,
  type MealPlanEntry,
  type MealRecipe,
} from "../api";
import { titleCase } from "../lib/titleCase";

function weekRange(base: Date): { from: string; to: string } {
  const day = base.getDay();
  const start = new Date(base);
  start.setDate(base.getDate() - day);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { from: fmt(start), to: fmt(end) };
}

export default function MealPlanPage() {
  const { token, actorUserId } = useAuth();
  const tok = token.trim();
  const actor = actorUserId.trim();
  const canAuth = tok.length > 0;
  const canActor = canAuth && validActorId(actor);

  const range = useMemo(() => weekRange(new Date()), []);
  const [recipes, setRecipes] = useState<MealRecipe[]>([]);
  const [entries, setEntries] = useState<MealPlanEntry[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const [recipeName, setRecipeName] = useState("");
  const [ingredientsText, setIngredientsText] = useState("");
  const [planDate, setPlanDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [planSlot, setPlanSlot] = useState("dinner");
  const [planRecipeId, setPlanRecipeId] = useState("");
  const [addToCalendar, setAddToCalendar] = useState(true);

  const load = useCallback(async () => {
    if (!canAuth) return;
    setErr(null);
    try {
      const [r, p] = await Promise.all([
        getMealRecipes(tok),
        getMealPlan(tok, range.from, range.to),
      ]);
      setRecipes(r.recipes);
      setEntries(p.entries);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [canAuth, tok, range.from, range.to]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addRecipe() {
    if (!recipeName.trim()) return;
    const ingredients = ingredientsText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(/\s+/);
        if (parts.length >= 2) return { name: parts.slice(1).join(" "), quantity: parts[0] };
        return { name: line, quantity: "1" };
      });
    await postMealRecipe(tok, { name: recipeName.trim(), ingredients });
    setRecipeName("");
    setIngredientsText("");
    await load();
  }

  async function addPlanEntry() {
    await postMealPlanEntry(
      tok,
      {
        planDate,
        mealSlot: planSlot,
        recipeId: planRecipeId ? parseInt(planRecipeId, 10) : undefined,
        addToCalendar: addToCalendar && canActor,
      },
      canActor ? actor : undefined
    );
    await load();
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-white">Meal planning</h1>
        <p className="mt-1 text-sm text-slate-400">
          Recipes, weekly plan, and one-click add ingredients to the{" "}
          <Link to="/buy" className="text-blue-400 hover:underline">
            buy list
          </Link>
          .
        </p>
      </div>

      {!canAuth && (
        <p className="text-sm text-amber-200">
          Sign in via <Link to="/settings" className="underline">Settings</Link>.
        </p>
      )}

      {err ? <p className="text-sm text-red-300">{err}</p> : null}

      {canAuth && (
        <>
          <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <h2 className="text-lg font-semibold text-white">Recipes</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-300">
              {recipes.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-white">{r.name}</span>
                  <span className="text-xs text-slate-500">{r.ingredients.length} ingredients</span>
                  <button
                    type="button"
                    className="text-xs text-red-400 hover:underline"
                    onClick={() => void deleteMealRecipe(tok, r.id).then(load)}
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-4 space-y-2">
              <input
                value={recipeName}
                onChange={(e) => setRecipeName(e.target.value)}
                placeholder="Recipe name"
                className="w-full rounded border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100"
              />
              <textarea
                value={ingredientsText}
                onChange={(e) => setIngredientsText(e.target.value)}
                placeholder={"Ingredients (one per line, optional qty first)\ne.g. 2 cups milk\nonions"}
                rows={4}
                className="w-full rounded border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              />
              <button
                type="button"
                onClick={() => void addRecipe()}
                className="rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700"
              >
                Add recipe
              </button>
            </div>
          </section>

          <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <h2 className="text-lg font-semibold text-white">
              Plan ({range.from} → {range.to})
            </h2>
            <ul className="mt-3 space-y-2 text-sm">
              {entries.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-2 rounded border border-slate-700 px-3 py-2">
                  <span className="text-slate-400">{e.planDate}</span>
                  <span className="text-slate-200">{titleCase(e.mealSlot)}</span>
                  <span className="text-white">{e.recipeName ?? e.customLabel ?? "—"}</span>
                  {canActor && e.recipeId ? (
                    <button
                      type="button"
                      className="text-xs text-emerald-400 hover:underline"
                      onClick={() => void postMealPlanAddToBuy(tok, e.id, actor).then(load)}
                    >
                      Add to buy list
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="text-xs text-red-400 hover:underline"
                    onClick={() => void deleteMealPlanEntry(tok, e.id).then(load)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              <input
                type="date"
                value={planDate}
                onChange={(e) => setPlanDate(e.target.value)}
                className="rounded border border-slate-600 bg-slate-950 px-2 py-2 text-slate-100"
              />
              <select
                value={planSlot}
                onChange={(e) => setPlanSlot(e.target.value)}
                className="rounded border border-slate-600 bg-slate-950 px-2 py-2 text-slate-100"
              >
                <option value="breakfast">Breakfast</option>
                <option value="lunch">Lunch</option>
                <option value="dinner">Dinner</option>
              </select>
              <select
                value={planRecipeId}
                onChange={(e) => setPlanRecipeId(e.target.value)}
                className="min-w-[10rem] rounded border border-slate-600 bg-slate-950 px-2 py-2 text-slate-100"
              >
                <option value="">Recipe…</option>
                {recipes.map((r) => (
                  <option key={r.id} value={String(r.id)}>
                    {r.name}
                  </option>
                ))}
              </select>
              {canActor ? (
                <label className="flex items-center gap-2 text-xs text-slate-400">
                  <input
                    type="checkbox"
                    checked={addToCalendar}
                    onChange={(e) => setAddToCalendar(e.target.checked)}
                  />
                  Add to calendar
                </label>
              ) : null}
              <button
                type="button"
                onClick={() => void addPlanEntry()}
                className="rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-sm text-white"
              >
                Add to plan
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
