import type { BudgetShareChargeLine } from "../api";
import { formatShareOwedByLabel, isGeneralShareLabel } from "./budgetShares";

export type SharePersonTotal = {
  key: string;
  label: string;
  total: number;
  chargeCount: number;
};

function personKey(c: BudgetShareChargeLine): string {
  if (isGeneralShareLabel(c.owedByLabel)) return "__general__";
  if (c.owedByUserId) return `u:${c.owedByUserId}`;
  return `n:${c.owedByLabel.trim().toLowerCase()}`;
}

/** Open charges grouped by person (or general "to be repaid"), highest balance first. */
export function groupOpenShareTotals(open: BudgetShareChargeLine[]): SharePersonTotal[] {
  const map = new Map<string, SharePersonTotal>();
  for (const c of open) {
    if (c.remaining <= 0.005) continue;
    const key = personKey(c);
    const label = formatShareOwedByLabel(c.owedByLabel);
    const cur = map.get(key) ?? { key, label, total: 0, chargeCount: 0 };
    cur.total += c.remaining;
    cur.chargeCount += 1;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}
