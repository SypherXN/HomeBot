/** Local preferences for Budget density + Simple/Full mode. */

export type BudgetMode = "simple" | "full";
export type BudgetDensity = "comfortable" | "compact";

const MODE_KEY = "homebot-budget-mode";
const DENSITY_KEY = "homebot-budget-density";

export function loadBudgetMode(): BudgetMode {
  try {
    return localStorage.getItem(MODE_KEY) === "simple" ? "simple" : "full";
  } catch {
    return "full";
  }
}

export function saveBudgetMode(mode: BudgetMode) {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    /* ignore */
  }
}

export function loadBudgetDensity(): BudgetDensity {
  try {
    return localStorage.getItem(DENSITY_KEY) === "compact" ? "compact" : "comfortable";
  } catch {
    return "comfortable";
  }
}

export function saveBudgetDensity(d: BudgetDensity) {
  try {
    localStorage.setItem(DENSITY_KEY, d);
  } catch {
    /* ignore */
  }
}
