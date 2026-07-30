import { useEffect, useMemo, useRef, useState } from "react";
import { getBudgetCategorizeRules, getBudgetTransactions, type BudgetCategorizeRule } from "../api";

export type MerchantSuggestion = {
  categoryId: number;
  categoryName: string;
  /** rule = categorize rule matched; last = most recent transaction for that merchant. */
  source: "rule" | "last";
};

type State = {
  rules: BudgetCategorizeRule[];
  /** Distinct merchant names from recent history + rule tokens (for datalist). */
  merchants: string[];
};

/**
 * Merchant intelligence for the add flows:
 * - datalist of previously seen merchants
 * - category suggestion from categorize rules, falling back to the last
 *   transaction with a matching merchant.
 */
export function useMerchantSuggestions(token: string, merchant: string) {
  const tok = token.trim();
  const [state, setState] = useState<State>({ rules: [], merchants: [] });
  const [suggestion, setSuggestion] = useState<MerchantSuggestion | null>(null);
  const [checking, setChecking] = useState(false);
  const lastLookupKey = useRef("");

  useEffect(() => {
    if (!tok) return;
    let cancelled = false;
    void (async () => {
      const [rulesRes, recent] = await Promise.all([
        getBudgetCategorizeRules(tok).catch(() => ({ rules: [] as BudgetCategorizeRule[] })),
        getBudgetTransactions(tok, 0, {}).catch(() => null),
      ]);
      if (cancelled) return;
      const merchants = new Set<string>();
      for (const t of recent?.items ?? []) {
        if (t.merchant?.trim()) merchants.add(t.merchant.trim());
      }
      for (const r of rulesRes.rules) {
        if (r.isActive && r.matchContains.trim()) merchants.add(r.matchContains.trim());
      }
      setState({
        rules: [...rulesRes.rules.filter((r) => r.isActive)].sort((a, b) => b.priority - a.priority),
        merchants: [...merchants].sort((a, b) => a.localeCompare(b)).slice(0, 60),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [tok]);

  const ruleMatch = useMemo((): MerchantSuggestion | null => {
    const m = merchant.trim().toLowerCase();
    if (m.length < 2) return null;
    for (const r of state.rules) {
      const needle = r.matchContains.trim().toLowerCase();
      if (needle && m.includes(needle)) {
        return { categoryId: r.categoryId, categoryName: r.categoryName, source: "rule" };
      }
    }
    return null;
  }, [merchant, state.rules]);

  useEffect(() => {
    if (ruleMatch) {
      setSuggestion(ruleMatch);
      setChecking(false);
      return;
    }
    const m = merchant.trim();
    if (!tok || m.length < 3) {
      setSuggestion(null);
      setChecking(false);
      return;
    }
    const key = `${tok}:${m.toLowerCase()}`;
    if (lastLookupKey.current === key) return;
    setChecking(true);
    const handle = setTimeout(() => {
      void (async () => {
        try {
          const res = await getBudgetTransactions(tok, 0, { merchant: m });
          const hit = res.items.find((t) => t.categoryId != null && t.categoryName);
          lastLookupKey.current = key;
          setSuggestion(
            hit && hit.categoryId != null && hit.categoryName
              ? { categoryId: hit.categoryId, categoryName: hit.categoryName, source: "last" }
              : null
          );
        } catch {
          setSuggestion(null);
        } finally {
          setChecking(false);
        }
      })();
    }, 350);
    return () => clearTimeout(handle);
  }, [tok, merchant, ruleMatch]);

  return { merchants: state.merchants, suggestion, checking };
}
