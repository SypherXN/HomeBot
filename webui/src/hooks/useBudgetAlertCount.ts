import { useCallback, useEffect, useState } from "react";
import { getBudgetNotificationCount } from "../api";

/** Polls pending budget notification count for header badge (lightweight endpoint). */
export function useBudgetAlertCount(token: string) {
  const tok = token.trim();
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!tok) {
      setCount(0);
      return;
    }
    try {
      const res = await getBudgetNotificationCount(tok);
      setCount(res.count);
    } catch {
      setCount(0);
    }
  }, [tok]);

  useEffect(() => {
    void refresh();
    if (!tok) return;
    const onVis = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    const onAlertsChanged = () => void refresh();
    window.addEventListener("homebot-budget-alerts-changed", onAlertsChanged);
    const id = window.setInterval(() => void refresh(), 5 * 60 * 1000);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("homebot-budget-alerts-changed", onAlertsChanged);
      window.clearInterval(id);
    };
  }, [refresh, tok]);

  return { count, refresh };
}
