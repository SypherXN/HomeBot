const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() || "http://localhost:5050";

export type ApiClientOptions = {
  token?: string;
};

async function request<T>(path: string, options: ApiClientOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, { headers });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${body}`);
  }

  return response.json() as Promise<T>;
}

export function getApiBaseUrl(): string {
  return API_BASE_URL;
}

export function getHealth() {
  return request("/api/health");
}

export function getMeta() {
  return request("/api/meta");
}

export function getBuy(token: string, page = 0) {
  return request(`/api/buy?page=${page}`, { token });
}

export function getWishlist(token: string, page = 0) {
  return request(`/api/wishlist?page=${page}`, { token });
}

export function getMoneyTransactions(token: string, page = 0) {
  return request(`/api/money/transactions?page=${page}`, { token });
}

export function getCalendar(token: string, page = 0) {
  return request(`/api/calendar?page=${page}`, { token });
}
