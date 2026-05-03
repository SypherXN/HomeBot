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
  opts?: { tag?: string; sort?: BuyListSort }
) {
  const q = new URLSearchParams({ page: String(page) });
  if (opts?.tag) q.set("tag", opts.tag);
  if (opts?.sort && opts.sort !== "id") q.set("sort", opts.sort);
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
  hasInstanceOverride?: boolean;
  /** IANA / Windows id for the event row (recurrence expansion used this zone). */
  timeZoneId?: string;
};

export type CalendarItemDetail = {
  title: string;
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
  windowTimeZone?: string
) {
  const q = new URLSearchParams({ from: fromYmd, to: toYmd });
  if (userFilter) q.set("userFilter", userFilter);
  if (windowTimeZone?.trim()) q.set("timeZone", windowTimeZone.trim());
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

export function deleteWishlistItem(token: string, actorUserId: string, id: number) {
  const path = mergeQuery(`/api/wishlist/items/${id}`, { actorUserId });
  return apiJson<unknown>(path, { token, method: "DELETE" });
}

export function deleteWishlistCompleted(token: string) {
  return apiJson<unknown>("/api/wishlist/items/completed", { token, method: "DELETE" });
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
    description?: string;
    notes?: string;
    link?: string;
    timezone?: string;
  }
) {
  return apiJson<unknown>(`/api/calendar/items/${id}`, { token, method: "PATCH", body });
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
