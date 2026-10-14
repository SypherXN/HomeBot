import { useEffect, useMemo, useState } from "react";
import { getBudgetCategorizeRules, getBudgetMerchants, type BudgetCategorizeRule, type BudgetMerchant } from "../api";

export type MerchantSuggestion = {
  categoryId: number;
  categoryName: string;
  /** rule = categorize rule matched; last = most recent transaction for that merchant. */
  source: "rule" | "last";
};

type State = {
  loadedFor: string;
  rules: BudgetCategorizeRule[];
  history: BudgetMerchant[];
};

/**
 * Merchant intelligence for the add flows:
 * - typeahead of previously seen merchants
 * - category suggestion from categorize rules, falling back to the last
 *   transaction with a matching merchant.
 */
export function useMerchantSuggestions(token: string, merchant: string) {
  const tok = token.trim();
  const [state, setState] = useState<State>({ loadedFor: "", rules: [], history: [] });

  useEffect(() => {
    if (!tok) return;
    let cancelled = false;
    void (async () => {
      const [rulesRes, history] = await Promise.all([
        getBudgetCategorizeRules(tok).catch(() => ({ rules: [] as BudgetCategorizeRule[] })),
        getBudgetMerchants(tok).catch(() => [] as BudgetMerchant[]),
      ]);
      if (cancelled) return;
      setState({
        loadedFor: tok,
        rules: rulesRes.rules.filter((r) => r.isActive && r.matchField === "merchant").sort((a, b) => b.priority - a.priority),
        history,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [tok]);

  const merchants = useMemo(
    () => state.loadedFor === tok && tok ? state.history.map((entry) => entry.merchant) : [],
    [state, tok]
  );

  const suggestion = useMemo((): MerchantSuggestion | null => {
    if (!tok || state.loadedFor !== tok) return null;
    const m = merchant.trim().toLowerCase();
    if (m.length < 2) return null;
    for (const r of state.rules) {
      const needle = r.matchContains.trim().toLowerCase();
      if (needle && m.includes(needle)) {
        return { categoryId: r.categoryId, categoryName: r.categoryName, source: "rule" };
      }
    }
    const hit = state.history.find((entry) => entry.merchant.trim().toLowerCase() === m);
    return hit?.categoryId != null && hit.categoryName
      ? { categoryId: hit.categoryId, categoryName: hit.categoryName, source: "last" }
      : null;
  }, [merchant, state, tok]);

  return { merchants, suggestion, checking: Boolean(tok) && state.loadedFor !== tok };
}
