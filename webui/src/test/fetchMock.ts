export type RecordedFetch = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
};

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const emptyPage = { items: [], totalCount: 0, page: 0, pageSize: 10 };

const budgetMonthSummary = {
  month: "2026-07",
  totalIncome: 0,
  totalExpenses: 0,
  net: 0,
};

/** Minimal router for HomeBot API paths used in systems tests. */
export function createHomeBotFetchMock(
  onCall?: (call: RecordedFetch) => void
): typeof fetch & { calls: RecordedFetch[] } {
  const calls: RecordedFetch[] = [];

  const handler = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? "GET").toUpperCase();
    const headers: Record<string, string> = {};
    if (init?.headers instanceof Headers) {
      init.headers.forEach((v, k) => {
        headers[k] = v;
      });
    } else if (init?.headers && typeof init.headers === "object") {
      Object.assign(headers, init.headers as Record<string, string>);
    }
    const body =
      typeof init?.body === "string" ? init.body : undefined;
    const record = { url, method, headers, body };
    calls.push(record);
    onCall?.(record);

    if (url.includes("/api/health")) {
      return jsonResponse({ status: "ok" });
    }
    if (url.includes("/api/meta")) {
      return jsonResponse({
        features: ["buy", "wishlist", "money", "budget", "calendar", "undo"],
      });
    }
    if (url.includes("/api/discord/guild/members")) {
      return jsonResponse({ available: false, members: [], reason: "test", guildId: null });
    }
    if (url.includes("/api/wishlist/owners")) {
      return jsonResponse({ owners: [] });
    }
    if (url.includes("/api/buy/tags")) {
      return jsonResponse({ tags: [], catalogEnforced: false });
    }
    if (url.includes("/api/wishlist/tags")) {
      return jsonResponse({ tags: [], catalogEnforced: false });
    }
    if (url.includes("/api/budget/notifications/count")) {
      return jsonResponse({ count: 0 });
    }
    if (url.includes("/api/budget/notifications")) {
      return jsonResponse([]);
    }
    if (url.includes("/api/household/settings")) {
      return jsonResponse({ settings: { page_size: "10", timezone: "UTC" } });
    }
    if (url.includes("/api/household/channel-bindings")) {
      return jsonResponse({ bindings: {} });
    }
    if (url.includes("/api/push/vapid-public-key")) {
      return jsonResponse({ configured: false, publicKey: null });
    }
    if (url.includes("/api/push/")) {
      return jsonResponse({ ok: true });
    }
    if (url.includes("/api/meals/")) {
      return jsonResponse({ recipes: [], entries: [] });
    }
    if (url.includes("/api/audit/household")) {
      return jsonResponse({ entries: [] });
    }
    if (url.includes("/api/notifications/preferences")) {
      return jsonResponse({ discordUserId: "0", budgetAlerts: true, calendarDm: true, weeklyDigest: true });
    }
    if (url.includes("/api/ops/")) {
      return jsonResponse({ service: "homebot-api", uptimeSeconds: 1, databaseBytes: 0, tableCounts: {} });
    }
    if (url.includes("/api/calendar/google/calendars")) {
      return jsonResponse({ calendars: [{ id: "primary", summary: "Primary", primary: true }] });
    }
    if (url.includes("/api/calendar/google/")) {
      return jsonResponse({ configured: false, connected: false });
    }
    if (url.includes("/api/search")) {
      return jsonResponse({ query: "", buy: [], wishlist: [], budget: [], calendar: [] });
    }
    if (url.includes("/api/money/balances")) {
      return jsonResponse({ userId: "0", memberLabel: "", balances: [] });
    }
    if (url.includes("/api/buy/recurring")) {
      return jsonResponse({ items: [] });
    }
    if (url.includes("/api/admin/")) {
      return jsonResponse({ users: [], ok: true, envTokenConfigured: false, dbTokenActive: false });
    }
    if (url.includes("/api/household/report")) {
      return jsonResponse({ month: "2026-01", monthLabel: "January 2026", markdown: "", activeBuyItems: 0, upcomingCalendarEvents: 0 });
    }
    if (url.includes("/api/budget/categorize-rules")) {
      return jsonResponse({ rules: [] });
    }
    if (url.includes("/api/calendar/range")) {
      return jsonResponse([]);
    }
    if (url.includes("/api/calendar/today") || url.includes("/api/calendar/upcoming")) {
      return jsonResponse(emptyPage);
    }
    if (url.includes("/api/buy/stale")) {
      return jsonResponse({ days: 14, items: [] });
    }
    if (url.includes("/api/buy/items") || (url.includes("/api/buy") && !url.includes("/api/buy/recurring"))) {
      return jsonResponse(emptyPage);
    }
    if (url.includes("/api/wishlist")) {
      return jsonResponse(emptyPage);
    }
    if (url.includes("/api/money/summary")) {
      return jsonResponse({ balance: 0, user1Name: "", user2Name: "", transactions: [] });
    }
    if (url.includes("/api/money")) {
      return jsonResponse(emptyPage);
    }
    if (url.includes("/api/budget/summary/month")) {
      return jsonResponse(budgetMonthSummary);
    }
    if (url.includes("/api/budget/summary/by-category")) {
      return jsonResponse([]);
    }
    if (url.includes("/api/budget/summary/by-user")) {
      return jsonResponse([]);
    }
    if (url.includes("/api/budget/envelopes")) return jsonResponse([]);
    if (url.includes("/api/budget/categories")) return jsonResponse([]);
    if (url.includes("/api/budget/accounts")) return jsonResponse([]);
    if (url.includes("/api/budget/transactions")) {
      return jsonResponse({ items: [], totalCount: 0, page: 0, pageSize: 25 });
    }
    if (url.includes("/api/budget/goals")) return jsonResponse([]);
    if (url.includes("/api/budget/bills")) return jsonResponse([]);
    if (url.includes("/api/budget/recurring")) return jsonResponse([]);
    if (url.includes("/api/budget/trends")) return jsonResponse([]);
    if (url.includes("/api/budget/tags")) return jsonResponse([]);
    if (url.includes("/api/budget/audit")) return jsonResponse([]);
    if (url.includes("/api/budget/tax-summary")) return jsonResponse([]);
    if (url.includes("/api/budget/exchange-rates")) return jsonResponse([]);
    if (url.includes("/api/budget/income-plan")) {
      return jsonResponse({
        month: "2026-07",
        plannedAmount: 0,
        allocatedEnvelopes: 0,
        availableToBudget: 0,
      });
    }
    if (url.includes("/api/budget/forecast")) return jsonResponse([]);
    if (url.includes("/api/calendar/items")) {
      return jsonResponse(emptyPage);
    }
    if (method === "POST" || method === "PUT" || method === "PATCH") {
      return jsonResponse({ ok: true, id: 1 }, 201);
    }
    if (method === "DELETE") {
      return jsonResponse({ ok: true });
    }

    return jsonResponse({}, 404);
  }) as typeof fetch & { calls: RecordedFetch[] };

  handler.calls = calls;
  return handler;
}

export function getCalls(mock: typeof fetch): RecordedFetch[] {
  return (mock as typeof fetch & { calls: RecordedFetch[] }).calls;
}
