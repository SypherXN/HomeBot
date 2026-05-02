import { useCallback, useEffect, useState } from "react";
import { getBuyTagCatalog, getHealth, getMeta } from "../api";

export type ApiConnectionStatus =
  | { phase: "checking" }
  | { phase: "down"; detail: string }
  | { phase: "up"; auth: "none" | "ok" | "bad" };

/**
 * Polls public health/meta and, when a bearer token is set, probes an authenticated catalog read.
 */
export function useApiConnectionStatus(token: string) {
  const [status, setStatus] = useState<ApiConnectionStatus>({ phase: "checking" });
  const tok = token.trim();

  const run = useCallback(async () => {
    setStatus({ phase: "checking" });
    try {
      await getHealth();
      await getMeta();
    } catch (e) {
      setStatus({
        phase: "down",
        detail: e instanceof Error ? e.message : String(e),
      });
      return;
    }
    if (!tok) {
      setStatus({ phase: "up", auth: "none" });
      return;
    }
    try {
      await getBuyTagCatalog(tok);
      setStatus({ phase: "up", auth: "ok" });
    } catch {
      setStatus({ phase: "up", auth: "bad" });
    }
  }, [tok]);

  useEffect(() => {
    void run();
    const id = window.setInterval(() => void run(), 45_000);
    const onFocus = () => void run();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [run]);

  return { status, refresh: run };
}
