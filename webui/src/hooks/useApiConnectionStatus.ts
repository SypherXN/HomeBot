import { useCallback, useEffect, useState } from "react";
import { getApiBaseUrl, getBuyTagCatalog, getHealth, getMeta, subscribeApiBaseUrl } from "../api";

export type ApiConnectionStatus =
  | { phase: "checking" }
  | { phase: "offline" }
  | { phase: "down"; detail: string }
  | { phase: "up"; auth: "none" | "ok" | "bad" };

function looksLikeNetworkFailure(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("failed to fetch") ||
    m.includes("networkerror") ||
    m.includes("network request failed") ||
    m.includes("load failed") ||
    m.includes("fetch failed")
  );
}

/**
 * Polls public health/meta and, when a bearer token is set, probes an authenticated catalog read.
 */
export function useApiConnectionStatus(token: string) {
  const [status, setStatus] = useState<ApiConnectionStatus>({ phase: "checking" });
  const [apiBase, setApiBase] = useState(() => getApiBaseUrl());
  const tok = token.trim();

  useEffect(() => subscribeApiBaseUrl(() => setApiBase(getApiBaseUrl())), []);

  const run = useCallback(async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setStatus({ phase: "offline" });
      return;
    }
    setStatus({ phase: "checking" });
    try {
      await getHealth();
      await getMeta();
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      const tip = looksLikeNetworkFailure(detail)
        ? "\n\nTip: Check Settings → API server URL, LAN/firewall, and that HomeBot is running (e.g. port 5050)."
        : "";
      setStatus({ phase: "down", detail: detail + tip });
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
  }, [tok, apiBase]);

  useEffect(() => {
    void run();
    const id = window.setInterval(() => void run(), 45_000);

    const onFocus = () => void run();

    /** Mobile browsers often restore the tab without firing `window` focus; visibility is reliable. */
    const onVisibility = () => {
      if (document.visibilityState === "visible") void run();
    };

    const onOnline = () => void run();

    const onOffline = () => {
      setStatus({ phase: "offline" });
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [run]);

  return { status, refresh: run };
}
