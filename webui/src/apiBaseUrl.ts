const STORAGE_KEY = "homebot_webui_api_base_url";

function viteDefault(): string {
  return (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() || "http://localhost:5050";
}

function normalize(url: string): string {
  const t = url.trim().replace(/\/+$/, "");
  return t.length > 0 ? t : viteDefault();
}

const listeners = new Set<() => void>();

function emit(): void {
  for (const cb of listeners) cb();
}

/**
 * When the SPA is served by Vite from a normal host, assume the API is the same host on port 5050
 * (HomeBot default). Matches: default dev/preview ports, optional {@link VITE_DEV_CLIENT_PORT}, or any
 * port while `import.meta.env.DEV` is true (e.g. `vite --port 3000`). For preview on a non-default port,
 * set `VITE_DEV_CLIENT_PORT` in `.env` to match. Skips GitHub Pages.
 */
function inferSameHostApiBase(): string | null {
  if (typeof window === "undefined") return null;
  const host = window.location.hostname;
  if (host.endsWith("github.io")) return null;

  const port = window.location.port;
  const configuredClient = (import.meta.env.VITE_DEV_CLIENT_PORT as string | undefined)?.trim();
  const defaultVitePorts = port === "5173" || port === "4173";
  const matchesConfigured = Boolean(configuredClient && port === configuredClient);
  const viteDevAnyPort = import.meta.env.DEV === true;

  if (!defaultVitePorts && !matchesConfigured && !viteDevAnyPort) return null;

  return `${window.location.protocol}//${host}:5050`;
}

/** Base URL when the user has not saved an override in localStorage. */
function resolvedDefaultBase(): string {
  return inferSameHostApiBase() ?? viteDefault();
}

function readStoredOverride(): string | null {
  if (typeof localStorage === "undefined") return null;
  const saved = localStorage.getItem(STORAGE_KEY)?.trim();
  return saved ? normalize(saved) : null;
}

let current = readStoredOverride() ?? resolvedDefaultBase();

/** Current API origin (no trailing slash), for fetch() and display. */
export function getApiBaseUrl(): string {
  return current;
}

/**
 * Persists in localStorage and notifies subscribers (connection badge, etc.).
 * Pass the same URL you would put in VITE_API_BASE_URL (e.g. http://192.168.1.5:5050 for LAN).
 */
export function setApiBaseUrl(url: string): void {
  current = normalize(url);
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(STORAGE_KEY, current);
  }
  emit();
}

/** Clears the saved override and reapplies the automatic / build-time default. */
export function resetApiBaseUrlToDefault(): void {
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(STORAGE_KEY);
  }
  current = resolvedDefaultBase();
  emit();
}

export function subscribeApiBaseUrl(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** True when API URL is inferred from the page URL (Vite dev, preview, or `VITE_DEV_CLIENT_PORT`). */
export function isApiBaseInferred(): boolean {
  return readStoredOverride() === null && inferSameHostApiBase() !== null;
}
