import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { validActorId } from "../lib/validation";
import { titleCase } from "../lib/titleCase";
import {
  deleteMealPlanEntry,
  deleteMealRecipe,
  getMealPlan,
  getMealRecipes,
  postMealPlanEntry,
  postMealPlanAddToBuy,
  postMealRecipe,
  type MealIngredient,
  type MealPlanEntry,
  type MealRecipe,
} from "../api";
import MealSlotSheet, { type SlotAssignTarget } from "./meals/MealSlotSheet";
import RecipeSheet from "./meals/RecipeSheet";
import RecipeCreateSheet from "./meals/RecipeCreateSheet";

const SLOTS = [
  { id: "breakfast", icon: "🍳" },
  { id: "lunch", icon: "🥪" },
  { id: "dinner", icon: "🍽️" },
] as const;

function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function weekDays(weekOffset: number): Date[] {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() + weekOffset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

export default function MealPlanPage() {
  const { token, actorUserId } = useAuth();
  const tok = token.trim();
  const actor = actorUserId.trim();
  const canAuth = tok.length > 0;
  const canActor = canAuth && validActorId(actor);

  const [weekOffset, setWeekOffset] = useState(0);
  const days = useMemo(() => weekDays(weekOffset), [weekOffset]);
  const range = useMemo(() => ({ from: fmt(days[0]), to: fmt(days[6]) }), [days]);
  const todayStr = fmt(new Date());

  const [recipes, setRecipes] = useState<MealRecipe[]>([]);
  const [entries, setEntries] = useState<MealPlanEntry[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const [assignTarget, setAssignTarget] = useState<SlotAssignTarget | null>(null);
  const [viewRecipe, setViewRecipe] = useState<MealRecipe | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [recipeQuery, setRecipeQuery] = useState("");
  const [busyEntryId, setBusyEntryId] = useState<number | null>(null);
  const [recipeBusy, setRecipeBusy] = useState(false);
  const [shopBusy, setShopBusy] = useState(false);
  const [copyBusy, setCopyBusy] = useState(false);

  const load = useCallback(async () => {
    if (!canAuth) return;
    setErr(null);
    setLoading(true);
    try {
      const [r, p] = await Promise.all([getMealRecipes(tok), getMealPlan(tok, range.from, range.to)]);
      setRecipes(r.recipes);
      setEntries(p.entries);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [canAuth, tok, range.from, range.to]);

  useEffect(() => {
    void load();
  }, [load]);

  function showBanner(kind: "ok" | "err", text: string) {
    setBanner({ kind, text });
    window.setTimeout(() => setBanner(null), 5000);
  }

  const entriesByKey = useMemo(() => {
    const map = new Map<string, MealPlanEntry[]>();
    for (const e of entries) {
      const key = `${e.planDate}|${e.mealSlot}`;
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    }
    return map;
  }, [entries]);

  const filteredRecipes = useMemo(() => {
    const q = recipeQuery.trim().toLowerCase();
    if (!q) return recipes;
    return recipes.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.ingredients.some((i) => i.name.toLowerCase().includes(q)) ||
        (r.tags ?? "").toLowerCase().includes(q)
    );
  }, [recipes, recipeQuery]);

  const plannedRecipeEntries = entries.filter((e) => e.recipeId != null);

  async function handleAssign(input: {
    planDate: string;
    mealSlot: string;
    recipeId?: number;
    customLabel?: string;
    notes?: string;
    addToCalendar?: boolean;
  }) {
    await postMealPlanEntry(tok, input, canActor ? actor : undefined);
    await load();
  }

  async function handleCreateRecipe(input: {
    name: string;
    description?: string;
    ingredients?: MealIngredient[];
    instructions?: string;
    servings?: number;
  }) {
    await postMealRecipe(tok, input);
    showBanner("ok", `Saved “${input.name}”.`);
    await load();
  }

  async function handleDeleteRecipe(recipe: MealRecipe) {
    setRecipeBusy(true);
    try {
      await deleteMealRecipe(tok, recipe.id);
      setViewRecipe(null);
      showBanner("ok", `Deleted “${recipe.name}”.`);
      await load();
    } catch (e) {
      showBanner("err", e instanceof Error ? e.message : String(e));
    } finally {
      setRecipeBusy(false);
    }
  }

  async function handleRemoveEntry(entry: MealPlanEntry) {
    setBusyEntryId(entry.id);
    try {
      await deleteMealPlanEntry(tok, entry.id);
      await load();
    } finally {
      setBusyEntryId(null);
    }
  }

  async function handleEntryToBuy(entry: MealPlanEntry) {
    if (!canActor) return;
    setBusyEntryId(entry.id);
    try {
      const r = await postMealPlanAddToBuy(tok, entry.id, actor);
      showBanner("ok", `Added ${r.added} ingredient(s) to the buy list.`);
    } catch (e) {
      showBanner("err", e instanceof Error ? e.message : String(e));
    } finally {
      setBusyEntryId(null);
    }
  }

  async function handleWeekToBuy() {
    if (!canActor || plannedRecipeEntries.length === 0) return;
    setShopBusy(true);
    try {
      let added = 0;
      for (const e of plannedRecipeEntries) {
        const r = await postMealPlanAddToBuy(tok, e.id, actor);
        added += r.added;
      }
      showBanner("ok", `Added ${added} ingredient(s) from ${plannedRecipeEntries.length} meal(s) to the buy list.`);
    } catch (e) {
      showBanner("err", e instanceof Error ? e.message : String(e));
    } finally {
      setShopBusy(false);
    }
  }

  async function handleCopyLastWeek() {
    setCopyBusy(true);
    try {
      const prev = weekDays(weekOffset - 1);
      const prevEntries = (await getMealPlan(tok, fmt(prev[0]), fmt(prev[6]))).entries;
      if (prevEntries.length === 0) {
        showBanner("err", "Nothing planned last week to copy.");
        return;
      }
      for (const e of prevEntries) {
        const d = new Date(`${e.planDate}T12:00:00`);
        d.setDate(d.getDate() + 7);
        await postMealPlanEntry(
          tok,
          {
            planDate: fmt(d),
            mealSlot: e.mealSlot,
            recipeId: e.recipeId ?? undefined,
            customLabel: e.customLabel ?? undefined,
            notes: e.notes ?? undefined,
          },
          canActor ? actor : undefined
        );
      }
      showBanner("ok", `Copied ${prevEntries.length} meal(s) from last week.`);
      await load();
    } catch (e) {
      showBanner("err", e instanceof Error ? e.message : String(e));
    } finally {
      setCopyBusy(false);
    }
  }

  function planRecipe(recipe: MealRecipe) {
    setViewRecipe(null);
    setAssignTarget({ date: todayStr, slot: "dinner", recipeId: recipe.id });
  }

  const weekLabel =
    weekOffset === 0
      ? "This week"
      : weekOffset === 1
        ? "Next week"
        : weekOffset === -1
          ? "Last week"
          : null;

  return (
    <div className="mx-auto min-w-0 max-w-6xl space-y-4 px-1 pb-10 sm:px-2">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Meals</h1>
          <p className="mt-1 text-sm text-slate-400">
            Plan the week, then send ingredients straight to the{" "}
            <Link to="/buy" className="text-blue-400 hover:underline">
              buy list
            </Link>
            .
          </p>
        </div>
      </header>

      {!canAuth && (
        <p className="rounded-lg border border-amber-700/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">
          Sign in via{" "}
          <Link to="/settings" className="font-medium underline">
            Settings
          </Link>{" "}
          to plan meals.
        </p>
      )}

      {banner && (
        <div
          role="status"
          className={`rounded-lg border px-4 py-3 text-sm ${
            banner.kind === "ok"
              ? "border-emerald-800/60 bg-emerald-950/50 text-emerald-100"
              : "border-red-800/60 bg-red-950/40 text-red-100"
          }`}
        >
          {banner.text}
        </div>
      )}

      {err && (
        <p className="rounded-lg border border-red-800/50 bg-red-950/30 px-3 py-2 text-sm text-red-200">{err}</p>
      )}

      {canAuth && (
        <>
          {/* Week nav + week-level actions */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setWeekOffset((o) => o - 1)}
                aria-label="Previous week"
                className="flex h-9 w-9 items-center justify-center rounded-lg hb-btn-soft text-slate-300"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={() => setWeekOffset(0)}
                disabled={weekOffset === 0}
                className="rounded-lg hb-btn-soft px-3 py-1.5 text-xs font-medium text-slate-200 disabled:opacity-40"
              >
                {weekLabel ?? "This week"}
              </button>
              <button
                type="button"
                onClick={() => setWeekOffset((o) => o + 1)}
                aria-label="Next week"
                className="flex h-9 w-9 items-center justify-center rounded-lg hb-btn-soft text-slate-300"
              >
                ›
              </button>
            </div>
            <span className="text-xs text-slate-500">
              {days[0].toLocaleDateString(undefined, { month: "short", day: "numeric" })} –{" "}
              {days[6].toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              {weekLabel && weekOffset !== 0 ? ` · ${weekLabel}` : ""}
            </span>
            <span className="flex-1" />
            <button
              type="button"
              disabled={copyBusy || loading}
              onClick={() => void handleCopyLastWeek()}
              title="Repeat last week's plan in this week"
              className="rounded-lg hb-btn-soft px-3 py-1.5 text-xs text-slate-300 hover:text-slate-100 disabled:opacity-50"
            >
              {copyBusy ? "Copying…" : "⧉ Copy last week"}
            </button>
            {canActor && (
              <button
                type="button"
                disabled={shopBusy || plannedRecipeEntries.length === 0}
                onClick={() => void handleWeekToBuy()}
                title="Add ingredients from every planned recipe to the buy list"
                className="rounded-lg border border-emerald-800/70 bg-emerald-950/30 px-3 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-950/60 disabled:opacity-50"
              >
                {shopBusy ? "Adding…" : `🛒 Shop this week (${plannedRecipeEntries.length})`}
              </button>
            )}
          </div>

          {/* Weekly grid */}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            {days.map((day) => {
              const dateStr = fmt(day);
              const isToday = dateStr === todayStr;
              return (
                <section
                  key={dateStr}
                  aria-label={day.toLocaleDateString(undefined, { weekday: "long" })}
                  className={`rounded-xl border p-2 ${
                    isToday ? "border-blue-700/60 bg-blue-950/20" : "border-slate-800 bg-slate-950/40"
                  }`}
                >
                  <header className="mb-2 flex items-baseline justify-between px-1">
                    <span
                      className={`text-xs font-semibold uppercase tracking-wide ${
                        isToday ? "text-blue-300" : "text-slate-400"
                      }`}
                    >
                      {day.toLocaleDateString(undefined, { weekday: "short" })}
                    </span>
                    <span className={`text-xs ${isToday ? "font-semibold text-blue-300" : "text-slate-500"}`}>
                      {day.getDate()}
                      {isToday && " · today"}
                    </span>
                  </header>
                  <div className="space-y-1.5">
                    {SLOTS.map(({ id: slot, icon }) => {
                      const slotEntries = entriesByKey.get(`${dateStr}|${slot}`) ?? [];
                      return (
                        <div key={slot} className="space-y-1">
                          {slotEntries.map((entry) => (
                            <div
                              key={entry.id}
                              className="group rounded-lg border border-slate-700/80 bg-slate-900/70 px-2 py-1.5"
                            >
                              <div className="flex items-start justify-between gap-1">
                                <button
                                  type="button"
                                  onClick={() => setAssignTarget({ date: dateStr, slot })}
                                  className="min-w-0 flex-1 text-left"
                                  title={`${titleCase(slot)}`}
                                >
                                  <span className="mr-1 text-xs" aria-hidden>
                                    {icon}
                                  </span>
                                  <span className="break-words text-xs font-medium text-slate-100">
                                    {entry.recipeName ?? entry.customLabel ?? "—"}
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  aria-label="Remove from plan"
                                  disabled={busyEntryId === entry.id}
                                  onClick={() => void handleRemoveEntry(entry)}
                                  className="shrink-0 rounded px-1 text-xs text-slate-500 hover:text-red-300 disabled:opacity-40"
                                >
                                  ×
                                </button>
                              </div>
                              {canActor && entry.recipeId != null && (
                                <button
                                  type="button"
                                  disabled={busyEntryId === entry.id}
                                  onClick={() => void handleEntryToBuy(entry)}
                                  className="mt-0.5 text-[11px] text-emerald-400/90 hover:text-emerald-300 disabled:opacity-40"
                                >
                                  + ingredients to buy
                                </button>
                              )}
                            </div>
                          ))}
                          {slotEntries.length === 0 && (
                            <button
                              type="button"
                              onClick={() => setAssignTarget({ date: dateStr, slot })}
                              className="w-full rounded-lg border border-dashed border-slate-700/70 px-2 py-1.5 text-left text-[11px] text-slate-600 transition-colors hover:border-blue-700/60 hover:text-slate-400"
                            >
                              <span className="mr-1" aria-hidden>
                                {icon}
                              </span>
                              {titleCase(slot)} +
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>

          {/* Recipe box */}
          <section className="pt-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-white">Recipe box</h2>
              <span className="text-xs text-slate-500">{recipes.length} recipe{recipes.length === 1 ? "" : "s"}</span>
              <span className="flex-1" />
              <input
                value={recipeQuery}
                onChange={(e) => setRecipeQuery(e.target.value)}
                placeholder="Search recipes or ingredients…"
                aria-label="Search recipes"
                className="w-full hb-input px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 sm:w-64"
              />
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 px-3 py-2 text-sm font-medium text-white hover:from-blue-500 hover:to-blue-600"
              >
                + New recipe
              </button>
            </div>

            {recipes.length === 0 && !loading && (
              <p className="rounded-xl border border-dashed border-slate-700 bg-slate-900/30 px-4 py-8 text-center text-sm text-slate-400">
                No recipes yet — add your first one to start planning.
              </p>
            )}

            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {filteredRecipes.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setViewRecipe(r)}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950/40 p-3 text-left transition-colors hover:border-blue-800/60"
                  >
                    <p className="font-medium text-slate-100">{r.name}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {r.servings > 0 ? `serves ${r.servings} · ` : ""}
                      {r.ingredients.length} ingredient{r.ingredients.length === 1 ? "" : "s"}
                      {r.instructions ? " · instructions" : ""}
                    </p>
                    {r.description && <p className="mt-1 line-clamp-2 text-xs text-slate-400">{r.description}</p>}
                  </button>
                </li>
              ))}
              {filteredRecipes.length === 0 && recipes.length > 0 && (
                <li className="col-span-full py-4 text-center text-sm text-slate-500">
                  No recipes match “{recipeQuery}”.
                </li>
              )}
            </ul>
          </section>
        </>
      )}

      <MealSlotSheet
        target={assignTarget}
        recipes={recipes}
        canActor={canActor}
        onClose={() => setAssignTarget(null)}
        onAssign={handleAssign}
      />
      <RecipeSheet
        recipe={viewRecipe}
        canActor={canActor}
        busy={recipeBusy}
        onClose={() => setViewRecipe(null)}
        onPlan={planRecipe}
        onDelete={(r) => void handleDeleteRecipe(r)}
      />
      <RecipeCreateSheet open={createOpen} onClose={() => setCreateOpen(false)} onCreate={handleCreateRecipe} />
    </div>
  );
}
