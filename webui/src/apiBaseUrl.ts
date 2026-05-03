const STORAGE_KEY = "homebot_webui_api_base_url";

function viteDefault(): string {
  return (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() || "http://localhost:5050";
}

function normalize(url: string): string {
  const t = url.trim().replace(/\/+$/, "");
  return t.length > 0 ? t : viteDefault();
}

let current = viteDefault();

const listeners = new Set<() => void>();

function emit(): void {
  for (const cb of listeners) cb();
}

function loadFromStorage(): void {
  if (typeof localStorage === "undefined") return;
  const saved = localStorage.getItem(STORAGE_KEY)?.trim();
  if (saved) current = normalize(saved);
}

loadFromStorage();

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

/** Restore build-time default and clear the override. */
export function resetApiBaseUrlToDefault(): void {
  current = viteDefault();
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(STORAGE_KEY);
  }
  emit();
}

export function subscribeApiBaseUrl(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
