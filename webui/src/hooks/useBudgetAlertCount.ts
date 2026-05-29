import { useCallback, useEffect, useState } from "react";
import { getBudgetNotifications } from "../api";

/** Polls pending budget notifications for header badge. */
export function useBudgetAlertCount(token: string) {
  const tok = token.trim();
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!tok) {
      setCount(0);
      return;
    }
    try {
      const items = await getBudgetNotifications(tok);
      setCount(items.length);
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
    const id = window.setInterval(() => void refresh(), 5 * 60 * 1000);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(id);
    };
  }, [refresh, tok]);

  return count;
}
