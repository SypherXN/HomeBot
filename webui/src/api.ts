import {
  AUTH_ACCESS_REFRESHED_EVENT,
  AUTH_STORAGE_REFRESH,
  AUTH_STORAGE_TOKEN,
  type AuthAccessRefreshedDetail,
} from "./auth/storageKeys";
import { getApiBaseUrl } from "./apiBaseUrl";

/**
 * Digit-only Discord snowflake for JSON bodies where the API uses Snowflake*JsonConverter on ulong.
 * Preserves full 64-bit ids (unlike JSON numbers in JavaScript).
 */
function jsonSnowflakeDigits(value: string | undefined): string | undefined {
  if (value == null) return undefined;
  const t = value.trim();
  if (!/^\d+$/.test(t) || t === "0") return undefined;
  return t;
}

export type ApiJsonOptions = {
  token?: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  /** @internal */ _authRetry?: boolean;
};

function mergeQuery(path: string, query: Record<string, string>): string {
  const qm = path.indexOf("?");
  const base = qm >= 0 ? path.slice(0, qm) : path;
  const existing = qm >= 0 ? path.slice(qm + 1) : "";
  const sp = new URLSearchParams(existing);
  for (const [k, v] of Object.entries(query)) {
    sp.set(k, v);
  }
  const s = sp.toString();
  return s ? `${base}?${s}` : base;
}

/** Parses `Retry-After` as delay-seconds (RFC 7231) or HTTP-date. */
function parseRetryAfterSeconds(retryAfter: string | null): number | undefined {
  if (retryAfter == null) return undefined;
  const t = retryAfter.trim();
  if (!t) return undefined;
  if (/^\d+$/.test(t)) {
    const sec = parseInt(t, 10);
    return Number.isFinite(sec) ? sec : undefined;
  }
  const ms = Date.parse(t);
  if (!Number.isNaN(ms)) {
    return Math.max(0, Math.ceil((ms - Date.now()) / 1000));
  }
  return undefined;
}

async function trySilentRefreshOnce(): Promise<string | null> {
  const rt = localStorage.getItem(AUTH_STORAGE_REFRESH)?.trim();
  if (!rt) return null;
  try {
    const r = await postAuthRefresh(rt);
    localStorage.setItem(AUTH_STORAGE_TOKEN, r.accessToken);
    localStorage.setItem(AUTH_STORAGE_REFRESH, r.refreshToken);
    window.dispatchEvent(
      new CustomEvent<AuthAccessRefreshedDetail>(AUTH_ACCESS_REFRESHED_EVENT, {
        detail: { accessToken: r.accessToken, refreshToken: r.refreshToken },
      })
    );
    return r.accessToken;
  } catch {
    return null;
  }
}

function rateLimitUserMessage(retryAfterSec: number | undefined): string {
  if (retryAfterSec === undefined) {
    return "Too many requests. Please wait a bit and try again.";
  }
  if (retryAfterSec <= 0) {
    return "Too many requests. Please try again in a moment.";
  }
  if (retryAfterSec === 1) {
    return "Too many requests. Try again in about 1 second.";
  }
  return `Too many requests. Try again in about ${retryAfterSec} seconds.`;
}

/**
 * All JSON calls to the HomeBot API. Pass Discord snowflakes as strings to avoid precision loss.
 */
export async function apiJson<T>(path: string, options: ApiJsonOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }
  const method = options.method ?? "GET";
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });

  if (
    response.status === 401 &&
    options.token &&
    !options._authRetry &&
    path.startsWith("/api/") &&
    !path.startsWith("/api/auth/")
  ) {
    const newTok = await trySilentRefreshOnce();
    if (newTok) {
      return apiJson<T>(path, { ...options, token: newTok, _authRetry: true });
    }
  }

  if (!response.ok) {
    const body = await response.text();
    if (response.status === 429) {
      const sec = parseRetryAfterSeconds(response.headers.get("Retry-After"));
      throw new Error(rateLimitUserMessage(sec));
    }
    throw new Error(`${response.status} ${response.statusText}: ${body}`);
  }

  const ct = response.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) {
    return undefined as T;
  }

  const text = await response.text();
  if (!text) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
}

export {
  getDefaultApiBaseUrl,
  getApiBaseUrl,
  isApiBaseInferred,
  resetApiBaseUrlToDefault,
  setApiBaseUrl,
  subscribeApiBaseUrl,
} from "./apiBaseUrl";

export function getHealth() {
  return apiJson<unknown>("/api/health");
}

export function getMeta() {
  return apiJson<unknown>("/api/meta");
}

export type DiscordGuildMember = {
  userId: string;
  displayName: string;
  username: string;
};

export type DiscordGuildMembersResponse = {
  available: boolean;
  reason: string | null;
  guildId: string | null;
  members: DiscordGuildMember[];
};

/** Guild members for the configured DISCORD_GUILD_ID (requires Discord gateway connected). */
export function getDiscordGuildMembers(token: string, signal?: AbortSignal) {
  return apiJson<DiscordGuildMembersResponse>("/api/discord/guild/members", { token, signal });
}

/** One active buy row from GET /api/buy/items (camelCase from ASP.NET JSON). */
export type BuyListItem = {
  id: number;
  name: string;
  quantity: string;
  store: string;
  assignedTo?: string | null;
  assignedToMemberLabel?: string | null;
  tags: string[];
  notes: string;
  createdAt?: string | null;
  purchasedBy?: string | null;
  purchasedByMemberLabel?: string | null;
};

export type PagedBuyList = {
  items: BuyListItem[];
  page: number;
  pageSize: number;
  totalCount: number;
  hasNext: boolean;
  hasPrev: boolean;
};

export type BuyListSort = "id" | "name" | "store" | "assigned" | "created" | "tags";

export type BuyTagCatalogResponse = {
  tags: string[];
  catalogEnforced: boolean;
};

/** Allowed buy tags (empty = free-form tags still accepted on writes). */
export function getBuyTagCatalog(token: string) {
  return apiJson<BuyTagCatalogResponse>("/api/buy/tags", { token });
}

/** Replace allowed buy tags (letters, digits, hyphen, underscore; max 48 tags). */
export function putBuyTagCatalog(token: string, tags: string[]) {
  return apiJson<{ ok: boolean; tags: string[] }>("/api/buy/tags", {
    token,
    method: "PUT",
    body: { tags },
  });
}

/** Active items only (`Status = active`); paginated by server page size. */
export function getBuyItems(
  token: string,
  page = 0,
  opts?: { tag?: string; sort?: BuyListSort; assignedTo?: string; store?: string }
) {
  const q = new URLSearchParams({ page: String(page) });
  if (opts?.tag) q.set("tag", opts.tag);
  if (opts?.sort && opts.sort !== "id") q.set("sort", opts.sort);
  if (opts?.assignedTo) {
    const a = jsonSnowflakeDigits(opts.assignedTo) ?? opts.assignedTo;
    q.set("assignedTo", a);
  }
  if (opts?.store?.trim()) q.set("store", opts.store.trim());
  return apiJson<PagedBuyList>(`/api/buy/items?${q.toString()}`, { token });
}

/** @deprecated alias — same as {@link getBuyItems} */
export function getBuy(token: string, page = 0) {
  return getBuyItems(token, page);
}

export type WishlistListItem = {
  id: number;
  name: string;
  owner: string;
  ownerMemberLabel: string;
  price: string;
  link: string;
  description: string;
  notes: string;
  priority: string;
  tags: string[];
  purchasedBy?: string | null;
  purchasedByMemberLabel?: string | null;
};

export type PagedWishlistList = {
  items: WishlistListItem[];
  page: number;
  pageSize: number;
  totalCount: number;
  hasNext: boolean;
  hasPrev: boolean;
};

export type WishlistListSort = "id" | "name" | "owner" | "tags" | "priority" | "price";

export type WishlistTagCatalogResponse = {
  tags: string[];
  catalogEnforced: boolean;
};

export type WishlistOwnerRow = {
  userId: string;
  label: string;
};

export function getWishlistTagCatalog(token: string) {
  return apiJson<WishlistTagCatalogResponse>("/api/wishlist/tags", { token });
}

export function putWishlistTagCatalog(token: string, tags: string[]) {
  return apiJson<{ ok: boolean; tags: string[] }>("/api/wishlist/tags", {
    token,
    method: "PUT",
    body: { tags },
  });
}

export function getWishlistOwners(token: string) {
  return apiJson<{ owners: WishlistOwnerRow[] }>("/api/wishlist/owners", { token });
}

export function getWishlistItems(
  token: string,
  page = 0,
  opts?: { owner?: string; tag?: string; sort?: WishlistListSort }
) {
  const q = new URLSearchParams({ page: String(page) });
  if (opts?.owner) q.set("owner", opts.owner);
  if (opts?.tag) q.set("tag", opts.tag);
  if (opts?.sort && opts.sort !== "id") q.set("sort", opts.sort);
  return apiJson<PagedWishlistList>(`/api/wishlist/items?${q.toString()}`, { token });
}

export function getWishlist(token: string, page = 0) {
  return getWishlistItems(token, page);
}

export function getWishlistItem(token: string, id: number) {
  return apiJson<unknown>(`/api/wishlist/items/${id}`, { token });
}

export type MoneyTransactionListItem = {
  id: number;
  name: string;
  amount: number;
  paidBy: string;
  paidByMemberLabel: string;
  owedBy: string;
  owedByMemberLabel: string;
  type: string;
  description?: string;
  notes?: string;
};

export type PagedMoneyTransactions = {
  items: MoneyTransactionListItem[];
  page: number;
  pageSize: number;
  totalCount: number;
  hasNext: boolean;
  hasPrev: boolean;
};

export type MoneySummary = {
  user1Id: string;
  user2Id: string;
  user1Name: string;
  user1MemberLabel: string;
  user2Name: string;
  user2MemberLabel: string;
  balance: number;
};

export function getMoneyTransactions(token: string, page = 0) {
  return apiJson<PagedMoneyTransactions>(`/api/money/transactions?page=${page}`, { token });
}

export function getMoneySummary(token: string, user1: string, user2: string, name1 = "", name2 = "") {
  const q = new URLSearchParams({ user1, user2 });
  if (name1) q.set("name1", name1);
  if (name2) q.set("name2", name2);
  return apiJson<MoneySummary>(`/api/money/summary?${q.toString()}`, { token });
}

export type MoneyBalanceEntry = {
  otherUserId: string;
  otherMemberLabel: string;
  balance: number;
};

export type MoneyBalances = {
  userId: string;
  memberLabel: string;
  balances: MoneyBalanceEntry[];
};

export function getMoneyBalances(token: string, userId: string) {
  return apiJson<MoneyBalances>(`/api/money/balances?userId=${encodeURIComponent(userId)}`, { token });
}

export type SearchHit = {
  domain: string;
  id: number;
  title: string;
  subtitle?: string | null;
  path: string;
};

export type SearchResult = {
  query: string;
  buy: SearchHit[];
  wishlist: SearchHit[];
  budget: SearchHit[];
  calendar: SearchHit[];
};

export function getSearch(token: string, q: string, limit = 5) {
  const sp = new URLSearchParams({ q, limit: String(limit) });
  return apiJson<SearchResult>(`/api/search?${sp.toString()}`, { token });
}

export type BuyRecurringItem = {
  id: number;
  name: string;
  quantity?: string | null;
  store?: string | null;
  assignedTo?: string | null;
  tags?: string | null;
  notes?: string | null;
  cadence: string;
  nextDueDate: string;
  isActive: boolean;
};

export function getBuyRecurring(token: string) {
  return apiJson<{ items: BuyRecurringItem[] }>("/api/buy/recurring", { token });
}

export function postBuyRecurring(
  token: string,
  actorUserId: string,
  body: {
    name: string;
    quantity?: string;
    store?: string;
    assignedTo?: string;
    cadence?: string;
    nextDueDate?: string;
  }
) {
  return apiJson<{ ok: boolean; id: number }>(
    mergeQuery("/api/buy/recurring", { actorUserId }),
    { token, method: "POST", body }
  );
}

export function deleteBuyRecurring(token: string, id: number) {
  return apiJson<{ ok: boolean }>(`/api/buy/recurring/${id}`, { token, method: "DELETE" });
}

export type BudgetCategorizeRule = {
  id: number;
  matchField: string;
  matchContains: string;
  categoryId: number;
  categoryName: string;
  priority: number;
  isActive: boolean;
};

export function getBudgetCategorizeRules(token: string) {
  return apiJson<{ rules: BudgetCategorizeRule[] }>("/api/budget/categorize-rules", { token });
}

export function postBudgetCategorizeRule(
  token: string,
  body: { matchField?: string; matchContains: string; categoryId: number; priority?: number }
) {
  return apiJson<{ ok: boolean; id: number }>("/api/budget/categorize-rules", {
    token,
    method: "POST",
    body,
  });
}

export function deleteBudgetCategorizeRule(token: string, id: number) {
  return apiJson<{ ok: boolean }>(`/api/budget/categorize-rules/${id}`, { token, method: "DELETE" });
}

export type WebUserAdminRow = {
  username: string;
  discordUserId: string;
  isActive: boolean;
  isAdmin: boolean;
  createdAt?: string | null;
};

export type WebInviteStatus = {
  envTokenConfigured: boolean;
  dbTokenActive: boolean;
  createdAt?: string | null;
  label?: string | null;
};

export function getAdminUsers(token: string) {
  return apiJson<{ users: WebUserAdminRow[] }>("/api/admin/users", { token });
}

export function getAdminInviteStatus(token: string) {
  return apiJson<WebInviteStatus>("/api/admin/invite-status", { token });
}

export function postAdminInviteRotate(token: string, label?: string) {
  const path = label ? `/api/admin/invite/rotate?label=${encodeURIComponent(label)}` : "/api/admin/invite/rotate";
  return apiJson<{ ok: boolean; inviteToken: string; message: string; status: WebInviteStatus }>(path, {
    token,
    method: "POST",
  });
}

export function postAdminDeactivateUser(token: string, username: string) {
  return apiJson<{ ok: boolean }>(`/api/admin/users/${encodeURIComponent(username)}/deactivate`, {
    token,
    method: "POST",
  });
}

export function patchAdminResetPassword(token: string, username: string, newPassword: string) {
  return apiJson<{ ok: boolean }>(`/api/admin/users/${encodeURIComponent(username)}/password`, {
    token,
    method: "PATCH",
    body: { newPassword },
  });
}

export type HouseholdReport = {
  month: string;
  monthLabel: string;
  markdown: string;
  activeBuyItems: number;
  upcomingCalendarEvents: number;
};

export function getHouseholdReport(token: string, month?: string) {
  const q = month ? `?month=${encodeURIComponent(month)}` : "";
  return apiJson<HouseholdReport>(`/api/household/report${q}`, { token });
}

export type HouseholdAuditEntry = {
  id: number;
  category: string;
  action: string;
  actorUserId?: string | null;
  actorUsername?: string | null;
  detail?: string | null;
  createdAt: string;
};

export function getHouseholdAudit(token: string, limit = 100) {
  return apiJson<{ entries: HouseholdAuditEntry[] }>(`/api/audit/household?limit=${limit}`, { token });
}

export type NotificationPreferences = {
  discordUserId: string;
  budgetAlerts: boolean;
  calendarDm: boolean;
  weeklyDigest: boolean;
};

export function getNotificationPreferences(token: string) {
  return apiJson<NotificationPreferences>("/api/notifications/preferences", { token });
}

export function putNotificationPreferences(token: string, body: NotificationPreferences) {
  return apiJson<{ ok: boolean }>("/api/notifications/preferences", { token, method: "PUT", body });
}

export type OpsHealth = {
  service: string;
  uptimeSeconds: number;
  databaseBytes: number;
  databasePath: string;
  tableCounts: Record<string, number>;
  backups: Record<string, unknown>;
  googleCalendar?: unknown;
  workers: Record<string, unknown>;
};

export function getOpsHealth(token: string) {
  return apiJson<OpsHealth>("/api/ops/health", { token });
}

export type MealIngredient = { name: string; quantity?: string | null };
export type MealRecipe = {
  id: number;
  name: string;
  description?: string | null;
  ingredients: MealIngredient[];
  instructions?: string | null;
  servings: number;
  tags?: string | null;
};

export type MealPlanEntry = {
  id: number;
  planDate: string;
  mealSlot: string;
  recipeId?: number | null;
  recipeName?: string | null;
  customLabel?: string | null;
  notes?: string | null;
};

export function getMealRecipes(token: string) {
  return apiJson<{ recipes: MealRecipe[] }>("/api/meals/recipes", { token });
}

export function postMealRecipe(
  token: string,
  body: { name: string; description?: string; ingredients?: MealIngredient[]; instructions?: string; servings?: number }
) {
  return apiJson<{ ok: boolean; id: number }>("/api/meals/recipes", { token, method: "POST", body });
}

export function deleteMealRecipe(token: string, id: number) {
  return apiJson<{ ok: boolean }>(`/api/meals/recipes/${id}`, { token, method: "DELETE" });
}

export function getMealPlan(token: string, from: string, to: string) {
  return apiJson<{ entries: MealPlanEntry[] }>(
    `/api/meals/plan?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    { token }
  );
}

export function postMealPlanEntry(
  token: string,
  body: {
    planDate: string;
    mealSlot: string;
    recipeId?: number;
    customLabel?: string;
    notes?: string;
    addToCalendar?: boolean;
  },
  actorUserId?: string
) {
  const path =
    body.addToCalendar && actorUserId
      ? mergeQuery("/api/meals/plan", { actorUserId })
      : "/api/meals/plan";
  return apiJson<{ ok: boolean; id: number }>(path, {
    token,
    method: "POST",
    body,
  });
}

export function deleteMealPlanEntry(token: string, id: number) {
  return apiJson<{ ok: boolean }>(`/api/meals/plan/${id}`, { token, method: "DELETE" });
}

export function postMealPlanAddToBuy(token: string, planEntryId: number, actorUserId: string) {
  return apiJson<{ ok: boolean; added: number }>(
    mergeQuery(`/api/meals/plan/${planEntryId}/add-to-buy`, { actorUserId }),
    { token, method: "POST" }
  );
}

export type GoogleCalendarStatus = {
  configured: boolean;
  connected: boolean;
  connection?: {
    calendarId?: string;
    lastSyncAt?: string | null;
    lastSyncError?: string | null;
  } | null;
};

export type GoogleCalendarListItem = { id: string; summary: string; primary: boolean };

export function getGoogleCalendars(token: string) {
  return apiJson<{ calendars: GoogleCalendarListItem[] }>("/api/calendar/google/calendars", { token });
}

export function putGoogleCalendarPick(token: string, calendarId: string) {
  return apiJson<{ ok: boolean; calendarId: string }>("/api/calendar/google/calendar", {
    token,
    method: "PUT",
    body: { calendarId },
  });
}

export function getGoogleCalendarStatus(token: string) {
  return apiJson<GoogleCalendarStatus>("/api/calendar/google/status", { token });
}

export function getGoogleCalendarOAuthUrl(token: string) {
  return apiJson<{ url: string }>("/api/calendar/google/oauth/url", { token });
}

export function postGoogleCalendarDisconnect(token: string) {
  return apiJson<{ ok: boolean }>("/api/calendar/google/disconnect", { token, method: "POST" });
}

export function postGoogleCalendarSync(token: string) {
  return apiJson<{ ok: boolean }>("/api/calendar/google/sync", { token, method: "POST" });
}

export type PushPublicConfig = { configured: boolean; publicKey?: string | null };

export function getPushPublicConfig(token?: string) {
  return apiJson<PushPublicConfig>("/api/push/vapid-public-key", { token });
}

export function postPushSubscribe(
  token: string,
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } }
) {
  return apiJson<{ ok: boolean }>("/api/push/subscribe", { token, method: "POST", body: subscription });
}

export function postPushUnsubscribe(token: string, endpoint: string) {
  return apiJson<{ ok: boolean }>("/api/push/unsubscribe", {
    token,
    method: "POST",
    body: { endpoint },
  });
}

/**
 * One row from `GET /api/calendar/items` (paged) and `/today` / `/upcoming`.
 * `assignedTo` is a digit string from the API when set (safe for large snowflakes).
 */
export type CalendarListItem = {
  id: number;
  title: string;
  type: string;
  dateText: string;
  allDay: boolean;
  assignedTo?: string | null;
  assignedToMemberLabel?: string | null;
  reminderText: string;
  recurrenceText: string;
  hasLink: boolean;
  /** Present when this row is one recurrence occurrence (today/upcoming/range parity). */
  instanceStartUtc?: string | null;
};

export type PagedCalendarList = {
  items: CalendarListItem[];
  page: number;
  pageSize: number;
  totalCount: number;
  hasNext: boolean;
  hasPrev: boolean;
};

/**
 * One occurrence from `GET /api/calendar/range`. Recurring rows produce one entry per occurrence
 * sharing the parent `id`; build React keys as `${id}@${instanceStartUtc}` to disambiguate.
 */
export type CalendarRangeItem = {
  id: number;
  title: string;
  description?: string;
  notes?: string;
  type: string;
  allDay: boolean;
  assignedTo?: string | null;
  assignedToMemberLabel?: string | null;
  reminderText: string;
  recurrenceText: string;
  recurrence: string;
  hasLink: boolean;
  /** Canonical recurrence slot (API identity for per-instance actions). */
  instanceStartUtc: string;
  /** When set, use for layout/display time (per-instance time override). */
  displayInstanceStartUtc?: string | null;
  instanceEndUtc?: string | null;
  displayInstanceEndUtc?: string | null;
  isRecurringInstance: boolean;
  isInstanceCompleted?: boolean;
  /** Whole item/series completed — only present when range requested with includeCompleted. */
  isCompleted?: boolean;
  hasInstanceOverride?: boolean;
  /** IANA / Windows id for the event row (recurrence expansion used this zone). */
  timeZoneId?: string;
  /** True when this all-day row is a task due date (not a timed event). */
  isDueTask?: boolean;
};

export type CalendarItemDetail = {
  title: string;
  /** "event" or "task" — render due-date fields for tasks. */
  type?: string;
  description: string;
  notes: string;
  link: string;
  start: string;
  /** UTC storage `yyyy-MM-dd HH:mm` when an end exists for this detail context. */
  end?: string;
  allDay: boolean;
  reminder: string;
  timezone: string;
  recurrence?: string;
  assignedTo?: string | null;
  /** Echo when detail was requested for one recurrence slot. */
  instanceStartUtc?: string | null;
};

export type CalendarItemTypeFilter = "task" | "event";

export function getCalendarItems(
  token: string,
  page = 0,
  opts?: { type?: CalendarItemTypeFilter }
) {
  const q = new URLSearchParams({ page: String(page) });
  if (opts?.type) q.set("type", opts.type);
  return apiJson<PagedCalendarList>(`/api/calendar/items?${q.toString()}`, { token });
}

export function getCalendar(token: string, page = 0) {
  return getCalendarItems(token, page);
}

export function getCalendarToday(token: string, page = 0, userFilter?: string) {
  const q = new URLSearchParams({ page: String(page) });
  if (userFilter) q.set("userFilter", userFilter);
  return apiJson<PagedCalendarList>(`/api/calendar/today?${q.toString()}`, { token });
}

export function getCalendarUpcoming(token: string, page = 0, userFilter?: string) {
  const q = new URLSearchParams({ page: String(page) });
  if (userFilter) q.set("userFilter", userFilter);
  return apiJson<PagedCalendarList>(`/api/calendar/upcoming?${q.toString()}`, { token });
}

/**
 * Fetch events overlapping a calendar-day window. `from`/`to` are interpreted in `windowTimeZone`
 * (IANA or Windows id); omit to use the household Settings timezone on the server.
 */
export function getCalendarRange(
  token: string,
  fromYmd: string,
  toYmd: string,
  userFilter?: string,
  windowTimeZone?: string,
  includeCompleted?: boolean
) {
  const q = new URLSearchParams({ from: fromYmd, to: toYmd });
  if (userFilter) q.set("userFilter", userFilter);
  if (windowTimeZone?.trim()) q.set("timeZone", windowTimeZone.trim());
  if (includeCompleted) q.set("includeCompleted", "true");
  return apiJson<CalendarRangeItem[]>(`/api/calendar/range?${q.toString()}`, { token });
}

export function getCalendarItemDetail(token: string, id: number, opts?: { instanceStartUtc?: string }) {
  const q = new URLSearchParams();
  if (opts?.instanceStartUtc?.trim()) q.set("instanceStartUtc", opts.instanceStartUtc.trim());
  const suffix = q.toString() ? `?${q.toString()}` : "";
  return apiJson<CalendarItemDetail>(`/api/calendar/items/${id}${suffix}`, { token });
}

// ——— Mutations (require bearer token; most need actorUserId query) ———

export function postBuyItem(
  token: string,
  actorUserId: string,
  body: {
    name: string;
    quantity?: string;
    store?: string;
    assignedTo?: string;
    tags?: string;
    notes?: string;
  }
) {
  const path = mergeQuery("/api/buy/items", { actorUserId });
  const payload: Record<string, unknown> = { name: body.name };
  if (body.quantity != null) payload.quantity = body.quantity;
  if (body.store != null) payload.store = body.store;
  const assigned = jsonSnowflakeDigits(body.assignedTo);
  if (assigned !== undefined) payload.assignedTo = assigned;
  if (body.tags != null) payload.tags = body.tags;
  if (body.notes != null) payload.notes = body.notes;
  return apiJson<unknown>(path, { token, method: "POST", body: payload });
}

export function putBuyItem(
  token: string,
  id: number,
  body: {
    name?: string;
    quantity?: string;
    store?: string;
    assignedTo?: string | null;
    tags?: string;
    notes?: string;
  }
) {
  const payload: Record<string, unknown> = {};
  if (body.name != null) payload.name = body.name;
  if (body.quantity != null) payload.quantity = body.quantity;
  if (body.store != null) payload.store = body.store;
  if (body.tags != null) payload.tags = body.tags;
  if (body.notes != null) payload.notes = body.notes;
  if (body.assignedTo === null) payload.assignedTo = null;
  else {
    const a = jsonSnowflakeDigits(body.assignedTo ?? undefined);
    if (a !== undefined) payload.assignedTo = a;
  }
  return apiJson<unknown>(`/api/buy/items/${id}`, { token, method: "PUT", body: payload });
}

export function postBuyItemComplete(token: string, actorUserId: string, id: number) {
  const path = mergeQuery(`/api/buy/items/${id}/complete`, { actorUserId });
  return apiJson<unknown>(path, { token, method: "POST" });
}

export function deleteBuyItem(token: string, actorUserId: string, id: number) {
  const path = mergeQuery(`/api/buy/items/${id}`, { actorUserId });
  return apiJson<unknown>(path, { token, method: "DELETE" });
}

export function deleteBuyCompleted(token: string) {
  return apiJson<unknown>("/api/buy/items/completed", { token, method: "DELETE" });
}

export function getStaleBuyItems(token: string, days = 14, limit = 10) {
  const path = mergeQuery("/api/buy/stale", { days: String(days), limit: String(limit) });
  return apiJson<{ days: number; items: BuyListItem[] }>(path, { token });
}

export function postBuyBulkComplete(token: string, actorUserId: string, ids: number[]) {
  return apiJson<{ ok: boolean; count: number }>("/api/buy/items/bulk-complete", {
    token,
    method: "POST",
    body: { actorUserId, ids },
  });
}

export function postBuyBulkDelete(token: string, actorUserId: string, ids: number[]) {
  return apiJson<{ ok: boolean; count: number }>("/api/buy/items/bulk-delete", {
    token,
    method: "POST",
    body: { actorUserId, ids },
  });
}

export function postWishlistItem(
  token: string,
  actorUserId: string,
  body: {
    name: string;
    ownerUserId?: string;
    price?: string;
    link?: string;
    description?: string;
    notes?: string;
    priority?: string;
    tags?: string;
  }
) {
  const path = mergeQuery("/api/wishlist/items", { actorUserId });
  const payload: Record<string, unknown> = { name: body.name };
  if (body.price != null) payload.price = body.price;
  if (body.link != null) payload.link = body.link;
  if (body.description != null) payload.description = body.description;
  if (body.notes != null) payload.notes = body.notes;
  if (body.priority != null) payload.priority = body.priority;
  if (body.tags != null) payload.tags = body.tags;
  const owner = jsonSnowflakeDigits(body.ownerUserId);
  if (owner !== undefined) payload.ownerUserId = owner;
  return apiJson<unknown>(path, { token, method: "POST", body: payload });
}

export function putWishlistItem(
  token: string,
  id: number,
  body: {
    name?: string;
    ownerUserId?: string | null;
    price?: string;
    link?: string;
    description?: string;
    notes?: string;
    priority?: string;
    tags?: string;
  }
) {
  const payload: Record<string, unknown> = {};
  if (body.name != null) payload.name = body.name;
  if (body.price != null) payload.price = body.price;
  if (body.link != null) payload.link = body.link;
  if (body.description != null) payload.description = body.description;
  if (body.notes != null) payload.notes = body.notes;
  if (body.priority != null) payload.priority = body.priority;
  if (body.tags != null) payload.tags = body.tags;
  if (body.ownerUserId === null) payload.ownerUserId = null;
  else {
    const o = jsonSnowflakeDigits(body.ownerUserId ?? undefined);
    if (o !== undefined) payload.ownerUserId = o;
  }
  return apiJson<unknown>(`/api/wishlist/items/${id}`, { token, method: "PUT", body: payload });
}

export function postWishlistItemComplete(token: string, actorUserId: string, id: number) {
  const path = mergeQuery(`/api/wishlist/items/${id}/complete`, { actorUserId });
  return apiJson<unknown>(path, { token, method: "POST" });
}

export function postWishlistAddToBuy(token: string, actorUserId: string, id: number) {
  const path = mergeQuery(`/api/wishlist/items/${id}/add-to-buy`, { actorUserId });
  return apiJson<{ ok: boolean }>(path, { token, method: "POST" });
}

export function deleteWishlistItem(token: string, actorUserId: string, id: number) {
  const path = mergeQuery(`/api/wishlist/items/${id}`, { actorUserId });
  return apiJson<unknown>(path, { token, method: "DELETE" });
}

export function deleteWishlistCompleted(token: string) {
  return apiJson<unknown>("/api/wishlist/items/completed", { token, method: "DELETE" });
}

export function postWishlistBulkComplete(token: string, actorUserId: string, ids: number[]) {
  return apiJson<{ ok: boolean; count: number }>("/api/wishlist/items/bulk-complete", {
    token,
    method: "POST",
    body: { actorUserId, ids },
  });
}

export function postWishlistBulkDelete(token: string, actorUserId: string, ids: number[]) {
  return apiJson<{ ok: boolean; count: number }>("/api/wishlist/items/bulk-delete", {
    token,
    method: "POST",
    body: { actorUserId, ids },
  });
}

/** Digit-only Discord snowflakes as JSON strings (full 64-bit; avoids JS number rounding). */
function moneySnowflake(s: string, field: string): string {
  const t = s.trim();
  if (!/^\d+$/.test(t) || t === "0") {
    throw new Error(`${field} must be a non-zero numeric Discord user id.`);
  }
  return t;
}

export function postMoneyExpense(
  token: string,
  body: { name: string; amountInput: string; paidBy: string; owedBy: string }
) {
  const paidBy = moneySnowflake(body.paidBy, "paidBy");
  const owedBy = moneySnowflake(body.owedBy, "owedBy");
  return apiJson<unknown>("/api/money/expenses", {
    token,
    method: "POST",
    body: { name: body.name, amountInput: body.amountInput, paidBy, owedBy },
  });
}

export function postMoneyExpenseSplit(
  token: string,
  body: {
    name: string;
    amountInput: string;
    paidBy: string;
    owedBy: string;
    percent: number;
    description?: string;
    notes?: string;
  }
) {
  const paidBy = moneySnowflake(body.paidBy, "paidBy");
  const owedBy = moneySnowflake(body.owedBy, "owedBy");
  return apiJson<unknown>("/api/money/expenses/split", {
    token,
    method: "POST",
    body: {
      name: body.name,
      amountInput: body.amountInput,
      paidBy,
      owedBy,
      percent: body.percent,
      description: body.description,
      notes: body.notes,
    },
  });
}

export function postMoneyPayment(token: string, body: { amountInput: string; paidBy: string; receivedBy: string }) {
  const paidBy = moneySnowflake(body.paidBy, "paidBy");
  const receivedBy = moneySnowflake(body.receivedBy, "receivedBy");
  return apiJson<unknown>("/api/money/payments", {
    token,
    method: "POST",
    body: { amountInput: body.amountInput, paidBy, receivedBy },
  });
}

export function patchMoneyTransaction(
  token: string,
  id: number,
  body: { name?: string; description?: string; notes?: string; amountInput?: string }
) {
  return apiJson<unknown>(`/api/money/transactions/${id}`, { token, method: "PATCH", body });
}

export function deleteMoneyTransaction(token: string, actorUserId: string, id: number) {
  const path = mergeQuery(`/api/money/transactions/${id}`, { actorUserId });
  return apiJson<unknown>(path, { token, method: "DELETE" });
}

export function postCalendarItem(
  token: string,
  body: {
    title: string;
    start?: string;
    end?: string;
    allDay?: boolean;
    reminder?: string;
    /** Digit-only Discord snowflake; sent as a JSON string so 64-bit ids round-trip safely. */
    assignedToUserId?: string;
    assignToEveryone?: boolean;
    description?: string;
    notes?: string;
    link?: string;
    recurrence?: string;
    /** IANA or Windows id; wall times in start/end are interpreted in this zone. */
    timezone?: string;
  }
) {
  const payload: Record<string, unknown> = {
    title: body.title,
    allDay: body.allDay ?? false,
    assignToEveryone: body.assignToEveryone ?? false,
  };
  if (body.start != null) payload.start = body.start;
  if (body.end != null) payload.end = body.end;
  if (body.reminder != null) payload.reminder = body.reminder;
  if (body.description != null) payload.description = body.description;
  if (body.notes != null) payload.notes = body.notes;
  if (body.link != null) payload.link = body.link;
  if (body.recurrence != null) payload.recurrence = body.recurrence;
  if (body.timezone?.trim()) payload.timezone = body.timezone.trim();
  const trimmedAssignee = body.assignedToUserId?.trim();
  if (trimmedAssignee && /^\d+$/.test(trimmedAssignee) && trimmedAssignee !== "0") {
    payload.assignedToUserId = trimmedAssignee;
  }
  return apiJson<unknown>("/api/calendar/items", { token, method: "POST", body: payload });
}

export function patchCalendarItem(
  token: string,
  id: number,
  body: {
    title?: string;
    start?: string;
    end?: string;
    clearEnd?: boolean;
    description?: string;
    notes?: string;
    link?: string;
    timezone?: string;
    allDay?: boolean;
    reminder?: string;
    recurrence?: string;
    assignedToUserId?: string | null;
    clearAssignedTo?: boolean;
  }
) {
  const payload: Record<string, unknown> = { ...body };
  if (body.assignedToUserId !== undefined) {
    delete payload.assignedToUserId;
    if (body.clearAssignedTo) {
      payload.clearAssignedTo = true;
    } else if (body.assignedToUserId != null && body.assignedToUserId !== "") {
      const a = jsonSnowflakeDigits(body.assignedToUserId) ?? body.assignedToUserId;
      payload.assignedTo = a;
    } else if (body.assignedToUserId === null || body.assignedToUserId === "") {
      payload.clearAssignedTo = true;
    }
  }
  return apiJson<unknown>(`/api/calendar/items/${id}`, { token, method: "PATCH", body: payload });
}

export function postCalendarItemComplete(token: string, actorUserId: string, id: number) {
  const path = mergeQuery(`/api/calendar/items/${id}/complete`, { actorUserId });
  return apiJson<unknown>(path, { token, method: "POST" });
}

/** Hide one occurrence of a recurring item (same as range row `instanceStartUtc`). */
export function postCalendarOmitInstance(token: string, actorUserId: string, id: number, instanceStartUtc: string) {
  const path = mergeQuery(`/api/calendar/items/${id}/omit-instance`, { actorUserId });
  return apiJson<unknown>(path, {
    token,
    method: "POST",
    body: { instanceStartUtc },
  });
}

/** Mark one recurring occurrence complete (series stays active). */
export function postCalendarCompleteInstance(token: string, actorUserId: string, id: number, instanceStartUtc: string) {
  const path = mergeQuery(`/api/calendar/items/${id}/complete-instance`, { actorUserId });
  return apiJson<unknown>(path, {
    token,
    method: "POST",
    body: { instanceStartUtc },
  });
}

/** PATCH fields for a single recurrence occurrence (canonical `instanceStartUtc`). */
export function patchCalendarRecurringInstance(
  token: string,
  actorUserId: string,
  id: number,
  body: {
    instanceStartUtc: string;
    title?: string;
    description?: string;
    notes?: string;
    link?: string;
    overrideInstanceStartUtc?: string;
    overrideInstanceEndUtc?: string;
  }
) {
  const path = mergeQuery(`/api/calendar/items/${id}/instance`, { actorUserId });
  return apiJson<unknown>(path, { token, method: "PATCH", body });
}

/** Removes omit / complete-this-day / modify row for one occurrence (Undo restores it). */
export function deleteCalendarInstanceOverrides(
  token: string,
  actorUserId: string,
  id: number,
  instanceStartUtc: string
) {
  const path = mergeQuery(`/api/calendar/items/${id}/instance`, { actorUserId, instanceStartUtc });
  return apiJson<unknown>(path, { token, method: "DELETE" });
}

export function deleteCalendarItem(token: string, actorUserId: string, id: number) {
  const path = mergeQuery(`/api/calendar/items/${id}`, { actorUserId });
  return apiJson<unknown>(path, { token, method: "DELETE" });
}

export type UndoResponse = {
  undone: boolean;
  message?: string;
};

export function postUndo(token: string, actorUserId: string) {
  const path = mergeQuery("/api/undo", { actorUserId });
  return apiJson<UndoResponse>(path, { token, method: "POST" });
}

export type AuthLoginResponse = {
  accessToken: string;
  tokenType: string;
  expiresInSeconds: number;
  username: string;
  discordUserId: string;
  refreshToken: string;
  refreshExpiresInSeconds: number;
};

/** Web UI login (no bearer). */
export function postAuthLogin(username: string, password: string) {
  return apiJson<AuthLoginResponse>("/api/auth/login", {
    method: "POST",
    body: { username, password },
  });
}

/** Rotate session using a refresh token (no bearer). Uses raw fetch to avoid recursion with apiJson. */
export async function postAuthRefresh(refreshToken: string, signal?: AbortSignal): Promise<AuthLoginResponse> {
  const response = await fetch(`${getApiBaseUrl()}/api/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
    signal,
  });
  const body = await response.text();
  if (!response.ok) {
    if (response.status === 429) {
      const sec = parseRetryAfterSeconds(response.headers.get("Retry-After"));
      throw new Error(rateLimitUserMessage(sec));
    }
    throw new Error(`${response.status} ${response.statusText}: ${body}`);
  }
  return JSON.parse(body) as AuthLoginResponse;
}

/** Revokes the refresh session server-side (no bearer). */
export async function postAuthLogout(refreshToken: string, signal?: AbortSignal): Promise<void> {
  const response = await fetch(`${getApiBaseUrl()}/api/auth/logout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
    signal,
  });
  if (!response.ok) {
    const body = await response.text();
    if (response.status === 429) {
      const sec = parseRetryAfterSeconds(response.headers.get("Retry-After"));
      throw new Error(rateLimitUserMessage(sec));
    }
    throw new Error(`${response.status} ${response.statusText}: ${body}`);
  }
}

export type DiscordOAuthUrlResponse = {
  configured: boolean;
  authorizeUrl: string | null;
  reason?: string;
};

/** Whether Discord OAuth is configured and the browser URL to open (no bearer). */
export function getDiscordOAuthUrl(signal?: AbortSignal) {
  return apiJson<DiscordOAuthUrlResponse>("/api/auth/discord/oauth/url", { signal });
}

/** Exchange one-time code from `/oauth/callback` for the same payload as password login (no bearer). */
export function postDiscordOAuthConsume(code: string) {
  return apiJson<AuthLoginResponse>("/api/auth/discord/oauth/consume", {
    method: "POST",
    body: { code },
  });
}

export function postAuthBootstrap(body: {
  username: string;
  password: string;
  discordUserId: string;
  setupToken?: string;
}) {
  return apiJson<{ ok: boolean; message: string }>("/api/auth/bootstrap", { method: "POST", body });
}

export function postAuthRegister(body: {
  inviteToken: string;
  username: string;
  password: string;
  discordUserId: string;
}) {
  return apiJson<{ ok: boolean; message: string }>("/api/auth/register", { method: "POST", body });
}

export function postAuthDiscordStart(body: { intent: "bootstrap" | "register" }) {
  return apiJson<{
    sessionId: string;
    code: string;
    expiresAt: string;
    message: string;
  }>("/api/auth/discord/start", { method: "POST", body });
}

export type AuthDiscordStatus = {
  exists: boolean;
  discordVerified: boolean;
  consumed: boolean;
  expired: boolean;
  expiresAt: string | null;
};

export function getAuthDiscordStatus(sessionId: string, signal?: AbortSignal) {
  const path = mergeQuery("/api/auth/discord/status", { sessionId });
  return apiJson<AuthDiscordStatus>(path, { signal });
}

export function postAuthDiscordCompleteBootstrap(body: {
  sessionId: string;
  username: string;
  password: string;
}) {
  return apiJson<{ ok: boolean; message: string }>("/api/auth/discord/complete-bootstrap", {
    method: "POST",
    body,
  });
}

export function postAuthDiscordCompleteRegister(body: {
  sessionId: string;
  username: string;
  password: string;
}) {
  return apiJson<{ ok: boolean; message: string }>("/api/auth/discord/complete-register", {
    method: "POST",
    body,
  });
}

export type AuthMeResponse = {
  kind: "webUser" | "apiToken";
  username: string | null;
  discordUserId: string | null;
};

export function getAuthMe(token: string, signal?: AbortSignal) {
  return apiJson<AuthMeResponse>("/api/auth/me", { token, signal });
}

// ——— Budget ———

export type BudgetCategory = {
  id: number;
  name: string;
  color: string | null;
  icon: string | null;
  visibility: string;
  isTaxDeductible: boolean;
  sortOrder: number;
};

export type BudgetTransactionSplit = {
  id: number;
  categoryId: number | null;
  spentByUserId: string | null;
  amount: number;
};

export type BudgetSplitInput = {
  categoryId?: number | null;
  spentByUserId?: string | null;
  amount: number;
};

export type BudgetTransactionListItem = {
  id: number;
  type: string;
  amount: number;
  amountInput: string | null;
  categoryId: number | null;
  categoryName: string | null;
  spentByUserId: string;
  spentByMemberLabel: string;
  accountId: number | null;
  transferToAccountId: number | null;
  note: string | null;
  receiptUrl: string | null;
  merchant: string | null;
  transactionDate: string;
  clearedAt: string | null;
  isPending: boolean;
  currency: string;
  exchangeRateToHome: number;
  tags: string[];
  splits: BudgetTransactionSplit[];
};

export type PagedBudgetTransactions = {
  items: BudgetTransactionListItem[];
  page: number;
  pageSize: number;
  totalCount: number;
  hasNext: boolean;
  hasPrev: boolean;
};

export type BudgetSummarySlice = {
  key: string;
  label: string;
  total: number;
  percent: number;
};

export type BudgetMonthSummary = {
  month: string;
  totalIncome: number;
  totalExpenses: number;
  net: number;
};

export type BudgetEnvelope = {
  id: number;
  month: string;
  categoryId: number;
  categoryName: string;
  targetAmount: number;
  actualAmount: number;
  remaining: number;
  percentUsed: number;
  leaveAmount?: number;
};

export type BudgetGoal = {
  id: number;
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string | null;
  categoryId: number | null;
  percentComplete: number;
};

export type BudgetAccount = {
  id: number;
  name: string;
  accountType: string;
  currency: string;
  creditLimit: number | null;
  currentBalance: number;
  isActive?: boolean;
};

function budgetQuery(path: string, params: Record<string, string | undefined>): string {
  const q: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") q[k] = v;
  }
  return mergeQuery(path, q);
}

export function getBudgetCategories(token: string) {
  return apiJson<BudgetCategory[]>("/api/budget/categories", { token });
}

export type BudgetTransactionListOpts = {
  month?: string;
  spentByUserId?: string;
  categoryId?: string;
  accountId?: string;
  scope?: string;
  merchant?: string;
  noteContains?: string;
  amountMin?: string;
  amountMax?: string;
  tag?: string;
};

export function getBudgetTransactions(token: string, page: number, opts?: BudgetTransactionListOpts) {
  const path = budgetQuery("/api/budget/transactions", {
    page: String(page),
    month: opts?.month,
    spentByUserId: opts?.spentByUserId,
    categoryId: opts?.categoryId,
    accountId: opts?.accountId,
    scope: opts?.scope,
    merchant: opts?.merchant,
    noteContains: opts?.noteContains,
    amountMin: opts?.amountMin,
    amountMax: opts?.amountMax,
    tag: opts?.tag,
  });
  return apiJson<PagedBudgetTransactions>(path, { token });
}

export function getBudgetTags(token: string) {
  return apiJson<string[]>("/api/budget/tags", { token });
}

export function getBudgetSummaryMonth(
  token: string,
  month: string,
  opts?: { spentByUserId?: string; scope?: string }
) {
  const path = budgetQuery("/api/budget/summary/month", {
    month,
    spentByUserId: opts?.spentByUserId,
    scope: opts?.scope,
  });
  return apiJson<BudgetMonthSummary>(path, { token });
}

export function getBudgetSummaryByCategory(
  token: string,
  month: string,
  opts?: { spentByUserId?: string; scope?: string }
) {
  const path = budgetQuery("/api/budget/summary/by-category", {
    month,
    spentByUserId: opts?.spentByUserId,
    scope: opts?.scope,
  });
  return apiJson<BudgetSummarySlice[]>(path, { token });
}

export function getBudgetSummaryByUser(token: string, month: string, categoryId?: string) {
  const path = budgetQuery("/api/budget/summary/by-user", { month, categoryId });
  return apiJson<BudgetSummarySlice[]>(path, { token });
}

export function postBudgetCategory(
  token: string,
  actorUserId: string,
  body: { name: string; color?: string; visibility?: string; isTaxDeductible?: boolean }
) {
  const path = mergeQuery("/api/budget/categories", { actorUserId });
  return apiJson<{ id: number }>(path, { token, method: "POST", body });
}

export function patchBudgetCategory(
  token: string,
  actorUserId: string,
  id: number,
  body: { name: string; visibility?: string; isTaxDeductible?: boolean; color?: string }
) {
  const path = mergeQuery(`/api/budget/categories/${id}`, { actorUserId });
  return apiJson<unknown>(path, { token, method: "PATCH", body });
}

export function deleteBudgetCategory(token: string, actorUserId: string, id: number) {
  const path = mergeQuery(`/api/budget/categories/${id}`, { actorUserId });
  return apiJson<unknown>(path, { token, method: "DELETE" });
}

export function postBudgetTransaction(
  token: string,
  actorUserId: string,
  body: {
    type: string;
    amountInput: string;
    categoryId?: number;
    spentByUserId: string;
    transactionDate?: string;
    note?: string;
    receiptUrl?: string;
    merchant?: string;
    accountId?: number;
    tags?: string[];
    splits?: BudgetSplitInput[];
    currency?: string;
  }
) {
  const path = mergeQuery("/api/budget/transactions", { actorUserId });
  const spentBy = jsonSnowflakeDigits(body.spentByUserId) ?? body.spentByUserId;
  const splits = body.splits?.map((s) => ({
    ...s,
    spentByUserId: s.spentByUserId
      ? (jsonSnowflakeDigits(s.spentByUserId) ?? s.spentByUserId)
      : s.spentByUserId,
  }));
  return apiJson<{ id: number }>(path, {
    token,
    method: "POST",
    body: { ...body, spentByUserId: spentBy, splits },
  });
}

export function patchBudgetTransaction(
  token: string,
  actorUserId: string,
  id: number,
  body: {
    amountInput?: string;
    categoryId?: number;
    spentByUserId?: string;
    transactionDate?: string;
    note?: string;
    receiptUrl?: string | null;
    merchant?: string;
    isPending?: boolean;
    clearedAt?: string | null;
    tags?: string[];
    splits?: BudgetSplitInput[];
    accountId?: number;
  }
) {
  const path = mergeQuery(`/api/budget/transactions/${id}`, { actorUserId });
  const payload: Record<string, unknown> = { ...body };
  if (body.spentByUserId) {
    payload.spentByUserId = jsonSnowflakeDigits(body.spentByUserId) ?? body.spentByUserId;
  }
  if (body.splits) {
    payload.splits = body.splits.map((s) => ({
      ...s,
      spentByUserId: s.spentByUserId
        ? (jsonSnowflakeDigits(s.spentByUserId) ?? s.spentByUserId)
        : s.spentByUserId,
    }));
  }
  return apiJson<unknown>(path, { token, method: "PATCH", body: payload });
}

export function deleteBudgetTransaction(token: string, actorUserId: string, id: number) {
  const path = mergeQuery(`/api/budget/transactions/${id}`, { actorUserId });
  return apiJson<unknown>(path, { token, method: "DELETE" });
}

export async function postBudgetImportCsv(
  token: string,
  actorUserId: string,
  file: File,
  spentByUserId: string
): Promise<{ imported: number }> {
  const base = getApiBaseUrl().replace(/\/$/, "");
  const form = new FormData();
  form.append("file", file);
  form.append("spentByUserId", jsonSnowflakeDigits(spentByUserId) ?? spentByUserId);
  const res = await fetch(`${base}/api/budget/import.csv?actorUserId=${encodeURIComponent(actorUserId)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || `Import failed (${res.status})`);
  }
  return res.json() as Promise<{ imported: number }>;
}

export function getBudgetEnvelopes(token: string, month: string) {
  const path = budgetQuery("/api/budget/envelopes", { month });
  return apiJson<BudgetEnvelope[]>(path, { token });
}

export function putBudgetEnvelope(
  token: string,
  actorUserId: string,
  body: { month: string; categoryId: number; targetAmount: number; leaveAmount?: number }
) {
  const path = mergeQuery("/api/budget/envelopes", { actorUserId });
  return apiJson<unknown>(path, { token, method: "PUT", body });
}

export function postBudgetEnvelopesRoll(
  token: string,
  actorUserId: string,
  body: { fromMonth: string; toMonth: string; mode: "targets" | "remaining" }
) {
  const path = mergeQuery("/api/budget/envelopes/roll", { actorUserId });
  return apiJson<{ count: number }>(path, { token, method: "POST", body });
}

export type BudgetMonthNote = {
  month: string;
  note: string;
  closedAt?: string | null;
  closedBy?: string | null;
};

export function getBudgetMonthNote(token: string, month: string) {
  return apiJson<BudgetMonthNote>(`/api/budget/month-notes/${encodeURIComponent(month)}`, { token });
}

export function putBudgetMonthNote(
  token: string,
  actorUserId: string,
  body: { month: string; note: string; markClosed?: boolean }
) {
  const path = mergeQuery("/api/budget/month-notes", { actorUserId });
  return apiJson<unknown>(path, { token, method: "PUT", body });
}

export function postBudgetOpeningBalance(
  token: string,
  actorUserId: string,
  accountId: number,
  body: { amountInput: string; transactionDate?: string }
) {
  const path = mergeQuery(`/api/budget/accounts/${accountId}/opening-balance`, { actorUserId });
  return apiJson<{ id: number }>(path, { token, method: "POST", body });
}

export function getBudgetBillSkips(token: string, month: string) {
  return apiJson<{ billIds: number[] }>(budgetQuery("/api/budget/bills/skips", { month }), { token });
}

export function postBudgetBillSkip(token: string, actorUserId: string, billId: number, month: string) {
  const path = mergeQuery(`/api/budget/bills/${billId}/skip`, { actorUserId, month });
  return apiJson<{ ok: boolean }>(path, { token, method: "POST" });
}

export function deleteBudgetBillSkip(token: string, actorUserId: string, billId: number, month: string) {
  const path = mergeQuery(`/api/budget/bills/${billId}/skip`, { actorUserId, month });
  return apiJson<{ ok: boolean }>(path, { token, method: "DELETE" });
}

export function getBudgetGoals(token: string) {
  return apiJson<BudgetGoal[]>("/api/budget/goals", { token });
}

export function postBudgetGoal(
  token: string,
  actorUserId: string,
  body: {
    name: string;
    targetAmount: number;
    currentAmount?: number;
    targetDate?: string;
    categoryId?: number;
  }
) {
  const path = mergeQuery("/api/budget/goals", { actorUserId });
  return apiJson<{ id: number }>(path, { token, method: "POST", body });
}

export function patchBudgetGoal(
  token: string,
  actorUserId: string,
  id: number,
  body: {
    name?: string;
    targetAmount?: number;
    currentAmount?: number;
    targetDate?: string | null;
    categoryId?: number | null;
  }
) {
  const path = mergeQuery(`/api/budget/goals/${id}`, { actorUserId });
  return apiJson<unknown>(path, { token, method: "PATCH", body });
}

export function deleteBudgetGoal(token: string, actorUserId: string, id: number) {
  const path = mergeQuery(`/api/budget/goals/${id}`, { actorUserId });
  return apiJson<unknown>(path, { token, method: "DELETE" });
}

export function getBudgetAccounts(token: string, includeInactive = false) {
  const path = includeInactive
    ? "/api/budget/accounts?includeInactive=true"
    : "/api/budget/accounts";
  return apiJson<BudgetAccount[]>(path, { token });
}

export function patchBudgetAccount(
  token: string,
  actorUserId: string,
  id: number,
  body: { isActive: boolean }
) {
  const path = mergeQuery(`/api/budget/accounts/${id}`, { actorUserId });
  return apiJson<unknown>(path, { token, method: "PATCH", body });
}

/** Download calendar .ics for a date range (requires bearer token). */
export async function downloadCalendarIcs(
  token: string,
  from: string,
  to: string,
  timeZone: string,
  userFilter?: string
): Promise<void> {
  const q: Record<string, string> = { from, to, timeZone };
  if (userFilter) q.userFilter = userFilter;
  const path = mergeQuery("/api/calendar/export.ics", q);
  const url = `${getApiBaseUrl()}${path}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token.trim()}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Export failed (${res.status})`);
  }
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `homebot-calendar-${from}-to-${to}.ics`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function postBudgetAccount(
  token: string,
  actorUserId: string,
  body: { name: string; accountType?: string; currency?: string; creditLimit?: number }
) {
  const path = mergeQuery("/api/budget/accounts", { actorUserId });
  return apiJson<{ id: number }>(path, { token, method: "POST", body });
}

export function postBudgetTransfer(
  token: string,
  actorUserId: string,
  body: {
    amountInput: string;
    fromAccountId: number;
    toAccountId: number;
    transactionDate?: string;
    note?: string;
  }
) {
  const path = mergeQuery("/api/budget/transfers", { actorUserId });
  return apiJson<{ id: number }>(path, { token, method: "POST", body });
}

export type BudgetIncomePlan = {
  month: string;
  plannedAmount: number;
  allocatedEnvelopes: number;
  availableToBudget: number;
};

export type BudgetForecastCategory = {
  categoryId: number;
  categoryName: string;
  monthToDate: number;
  projectedMonthEnd: number;
  envelopeTarget: number | null;
};

export type BudgetTrendPoint = {
  month: string;
  key: string;
  label: string;
  total: number;
};

export type BudgetBill = {
  id: number;
  name: string;
  amountEstimate: number;
  dueDay: number;
  categoryId: number | null;
  calendarItemId: number | null;
  isActive: boolean;
};

export type BudgetRecurring = {
  id: number;
  amount: number;
  amountInput?: string | null;
  categoryId?: number | null;
  spentByUserId?: string;
  cadence: string;
  nextRunDate: string;
  note?: string | null;
  merchant?: string | null;
  type: string;
  isActive: boolean;
  accountId?: number | null;
};

export function getBudgetIncomePlan(token: string, month: string) {
  return apiJson<BudgetIncomePlan>(budgetQuery("/api/budget/income-plan", { month }), { token });
}

export function putBudgetIncomePlan(
  token: string,
  actorUserId: string,
  body: { month: string; plannedAmount: number }
) {
  const path = mergeQuery("/api/budget/income-plan", { actorUserId });
  return apiJson<unknown>(path, { token, method: "PUT", body });
}

export function getBudgetForecast(token: string, month: string) {
  return apiJson<BudgetForecastCategory[]>(budgetQuery("/api/budget/forecast", { month }), { token });
}

export function getBudgetTrends(token: string, months = 6, groupBy: "category" | "user" = "category") {
  const path = budgetQuery("/api/budget/trends", { months: String(months), groupBy });
  return apiJson<BudgetTrendPoint[]>(path, { token });
}

export function getBudgetBills(token: string) {
  return apiJson<BudgetBill[]>("/api/budget/bills", { token });
}

export function getBudgetRecurring(token: string) {
  return apiJson<BudgetRecurring[]>("/api/budget/recurring", { token });
}

export function postBudgetBill(
  token: string,
  actorUserId: string,
  body: {
    name: string;
    amountEstimate: number;
    dueDay: number;
    categoryId?: number;
    createCalendarReminder?: boolean;
  }
) {
  const path = mergeQuery("/api/budget/bills", { actorUserId });
  return apiJson<{ id: number; calendarItemId?: number | null }>(path, { token, method: "POST", body });
}

export function postBudgetBillCalendarReminder(token: string, actorUserId: string, billId: number) {
  const path = mergeQuery(`/api/budget/bills/${billId}/calendar-reminder`, { actorUserId });
  return apiJson<{ ok: boolean; calendarItemId: number }>(path, { token, method: "POST" });
}

export function patchBudgetBill(
  token: string,
  actorUserId: string,
  id: number,
  body: {
    name?: string;
    amountEstimate?: number;
    dueDay?: number;
    categoryId?: number;
    isActive?: boolean;
  }
) {
  const path = mergeQuery(`/api/budget/bills/${id}`, { actorUserId });
  return apiJson<unknown>(path, { token, method: "PATCH", body });
}

export function postBudgetBillPay(
  token: string,
  actorUserId: string,
  billId: number,
  body: { amountInput: string; spentByUserId?: string }
) {
  const path = mergeQuery(`/api/budget/bills/${billId}/pay`, { actorUserId });
  const spentBy = body.spentByUserId
    ? (jsonSnowflakeDigits(body.spentByUserId) ?? body.spentByUserId)
    : undefined;
  return apiJson<{ transactionId: number }>(path, {
    token,
    method: "POST",
    body: { amountInput: body.amountInput, spentByUserId: spentBy ?? "0" },
  });
}

export function postBudgetRecurring(
  token: string,
  actorUserId: string,
  body: {
    amountInput: string;
    spentByUserId: string;
    categoryId?: number;
    cadence?: string;
    nextRunDate?: string;
    type?: string;
    note?: string;
    merchant?: string;
  }
) {
  const path = mergeQuery("/api/budget/recurring", { actorUserId });
  const spentBy = jsonSnowflakeDigits(body.spentByUserId) ?? body.spentByUserId;
  return apiJson<{ id: number }>(path, { token, method: "POST", body: { ...body, spentByUserId: spentBy } });
}

export function patchBudgetRecurring(
  token: string,
  actorUserId: string,
  id: number,
  body: {
    amountInput?: string;
    spentByUserId?: string;
    categoryId?: number;
    cadence?: string;
    nextRunDate?: string;
    type?: string;
    isActive?: boolean;
  }
) {
  const path = mergeQuery(`/api/budget/recurring/${id}`, { actorUserId });
  const payload = { ...body };
  if (body.spentByUserId) {
    payload.spentByUserId = jsonSnowflakeDigits(body.spentByUserId) ?? body.spentByUserId;
  }
  return apiJson<unknown>(path, { token, method: "PATCH", body: payload });
}

export type BudgetAuditEntry = {
  id: number;
  entityType: string;
  entityId: number;
  actorUserId: string;
  action: string;
  dataJson: string | null;
  createdAt: string;
};

export type BudgetNotificationItem = {
  key: string;
  kind: string;
  message: string;
};

export type BudgetTaxSummaryLine = {
  categoryId: number;
  categoryName: string;
  total: number;
};

export type BudgetExchangeRate = {
  id: number;
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  effectiveDate: string;
};

export function getBudgetAudit(token: string, limit = 50) {
  return apiJson<BudgetAuditEntry[]>(budgetQuery("/api/budget/audit", { limit: String(limit) }), { token });
}

export function getBudgetNotifications(token: string) {
  return apiJson<BudgetNotificationItem[]>("/api/budget/notifications", { token });
}

export function getBudgetNotificationCount(token: string) {
  return apiJson<{ count: number }>("/api/budget/notifications/count", { token });
}

export function postBudgetNotificationDismiss(token: string, actorUserId: string, key: string) {
  const path = mergeQuery("/api/budget/notifications/dismiss", { actorUserId });
  return apiJson<{ ok: boolean }>(path, { token, method: "POST", body: { key } });
}

export type HouseholdSettingsResponse = { settings: Record<string, string> };
export type HouseholdChannelBindingsResponse = { bindings: Record<string, string> };

export function getHouseholdSettings(token: string) {
  return apiJson<HouseholdSettingsResponse>("/api/household/settings", { token });
}

export function getHouseholdChannelBindings(token: string) {
  return apiJson<HouseholdChannelBindingsResponse>("/api/household/channel-bindings", { token });
}

export function putHouseholdSetting(token: string, body: { key: string; value: string }) {
  return apiJson<{ ok: boolean; key: string; value: string }>("/api/household/settings", {
    token,
    method: "PUT",
    body,
  });
}

export function putHouseholdChannelBinding(token: string, body: { feature: string; channelId: string }) {
  return apiJson<{ ok: boolean; feature: string; channelId: string }>("/api/household/channel-bindings", {
    token,
    method: "PUT",
    body: { feature: body.feature, channelId: body.channelId },
  });
}

export async function postCalendarImportIcs(token: string, actorUserId: string, file: File) {
  const base = getApiBaseUrl().replace(/\/$/, "");
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(
    `${base}/api/calendar/import.ics?actorUserId=${encodeURIComponent(actorUserId)}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Import failed (${res.status})`);
  }
  return res.json() as Promise<{ imported: number; parsed: number }>;
}

export function getBudgetTaxSummary(token: string, year: number) {
  return apiJson<BudgetTaxSummaryLine[]>(budgetQuery("/api/budget/tax-summary", { year: String(year) }), {
    token,
  });
}

export function getBudgetExchangeRates(token: string) {
  return apiJson<BudgetExchangeRate[]>("/api/budget/exchange-rates", { token });
}

export function putBudgetExchangeRate(
  token: string,
  actorUserId: string,
  body: { fromCurrency: string; toCurrency: string; rate: number; effectiveDate?: string }
) {
  const path = mergeQuery("/api/budget/exchange-rates", { actorUserId });
  return apiJson<unknown>(path, { token, method: "PUT", body });
}

export async function downloadBudgetCsv(token: string, from?: string, to?: string) {
  const path = budgetQuery("/api/budget/export.csv", { from, to });
  const base = getApiBaseUrl().replace(/\/$/, "");
  const res = await fetch(`${base}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Export failed (${res.status})`);
  return res.text();
}
