import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteBuyItem,
  getBudgetAccounts,
  getBudgetCategories,
  getBudgetNotifications,
  getBudgetNotificationCount,
  getBuy,
  getBuyStoreCatalog,
  getCalendarRange,
  getHealth,
  getMeta,
  getMoneySummary,
  getMoneyTransactions,
  getWishlist,
  patchBudgetTransaction,
  postBudgetTransaction,
  postBuyItem,
  postCalendarItem,
  postMoneyExpenseSplit,
  postMoneyPayment,
  postUndo,
  postWishlistItem,
  putBuyStoreCatalog,
} from "./api";
import { createHomeBotFetchMock, getCalls } from "./test/fetchMock";

const TOKEN = "test-bearer";
const ACTOR = "300001";

describe("API client — all subsystems", () => {
  let fetchMock: ReturnType<typeof createHomeBotFetchMock>;

  beforeEach(() => {
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost:5050");
    fetchMock = createHomeBotFetchMock();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  function lastCall() {
    const calls = getCalls(fetchMock);
    return calls[calls.length - 1]!;
  }

  it("reads public health and meta without auth header", async () => {
    await getHealth();
    await getMeta();
    const healthCall = getCalls(fetchMock)[0]!;
    expect(healthCall.url).toContain("/api/health");
    expect(healthCall.headers.Authorization).toBeUndefined();
    expect(lastCall().url).toContain("/api/meta");
  });

  it("buy: POST includes actorUserId and snowflake-safe assignedTo", async () => {
    await postBuyItem(TOKEN, ACTOR, {
      name: "Milk",
      assignedTo: "9007199254740991",
    });
    const call = lastCall();
    expect(call.method).toBe("POST");
    expect(call.url).toContain("/api/buy/items");
    expect(call.url).toContain(`actorUserId=${ACTOR}`);
    const body = JSON.parse(call.body ?? "{}") as { assignedTo?: string };
    expect(body.assignedTo).toBe("9007199254740991");
    expect(typeof body.assignedTo).toBe("string");

    await getBuy(TOKEN, 0);
    expect(lastCall().url).toContain("/api/buy/items");
  });

  it("buy: store catalog GET and PUT", async () => {
    await getBuyStoreCatalog(TOKEN);
    expect(lastCall().url).toContain("/api/buy/stores");
    expect(lastCall().method).toBe("GET");

    await putBuyStoreCatalog(TOKEN, ["Costco", "Trader Joe's"]);
    expect(lastCall().url).toContain("/api/buy/stores");
    expect(lastCall().method).toBe("PUT");
    const body = JSON.parse(lastCall().body ?? "{}") as { stores?: string[] };
    expect(body.stores).toEqual(["Costco", "Trader Joe's"]);
  });

  it("wishlist: POST sends owner as digit string", async () => {
    await postWishlistItem(TOKEN, ACTOR, { name: "Book", ownerUserId: ACTOR });
    const body = JSON.parse(lastCall().body ?? "{}") as { ownerUserId?: string };
    expect(body.ownerUserId).toBe(ACTOR);
    await getWishlist(TOKEN);
    expect(lastCall().url).toContain("/api/wishlist/items");
  });

  it("money: split and payment use string snowflakes", async () => {
    await postMoneyExpenseSplit(TOKEN, {
      name: "Groceries",
      amountInput: "50",
      paidBy: ACTOR,
      owedBy: "300002",
      percent: 50,
    });
    let body = JSON.parse(lastCall().body ?? "{}") as { paidBy?: string; owedBy?: string };
    expect(body.paidBy).toBe(ACTOR);
    expect(body.owedBy).toBe("300002");

    await postMoneyPayment(TOKEN, {
      amountInput: "10",
      paidBy: "300002",
      receivedBy: ACTOR,
    });
    body = JSON.parse(lastCall().body ?? "{}") as {
      paidBy?: string;
      owedBy?: string;
      receivedBy?: string;
    };
    expect(body.paidBy).toBe("300002");
    expect(body.receivedBy).toBe(ACTOR);

    await getMoneyTransactions(TOKEN);
    expect(lastCall().url).toContain("/api/money/transactions");

    await getMoneySummary(TOKEN, ACTOR, "300002");
    expect(lastCall().url).toContain("/api/money/summary");
  });

  it("budget: reads and mutations hit budget routes with actor", async () => {
    await getBudgetCategories(TOKEN);
    expect(lastCall().url).toContain("/api/budget/categories");

    await getBudgetAccounts(TOKEN, true);
    expect(lastCall().url).toContain("includeInactive=true");

    await getBudgetNotifications(TOKEN);
    expect(lastCall().url).toContain("/api/budget/notifications");
    expect(lastCall().url).not.toContain("/count");

    await getBudgetNotificationCount(TOKEN);
    expect(lastCall().url).toContain("/api/budget/notifications/count");

    await postBudgetTransaction(TOKEN, ACTOR, {
      type: "expense",
      amountInput: "12",
      spentByUserId: ACTOR,
      categoryId: 1,
    });
    expect(lastCall().url).toContain("/api/budget/transactions");
    expect(lastCall().url).toContain(`actorUserId=${ACTOR}`);

    await patchBudgetTransaction(TOKEN, ACTOR, 5, { accountId: 2 });
    expect(lastCall().method).toBe("PATCH");
    expect(JSON.parse(lastCall().body ?? "{}")).toMatchObject({ accountId: 2 });
  });

  it("calendar: range query and create", async () => {
    await getCalendarRange(TOKEN, "2026-07-01", "2026-07-31", undefined, "UTC");
    expect(lastCall().url).toContain("/api/calendar/range");
    expect(lastCall().url).toContain("timeZone=UTC");

    await postCalendarItem(TOKEN, {
      title: "Meet",
      start: "2026-07-10 14:00",
      timezone: "UTC",
    });
    expect(lastCall().url).toBe("http://localhost:5050/api/calendar/items");
  });

  it("undo: POST with actorUserId", async () => {
    await postUndo(TOKEN, ACTOR);
    expect(lastCall().method).toBe("POST");
    expect(lastCall().url).toContain("/api/undo");
    expect(lastCall().url).toContain(`actorUserId=${ACTOR}`);
  });

  it("delete buy sends bearer and actor", async () => {
    await deleteBuyItem(TOKEN, ACTOR, 42);
    expect(lastCall().method).toBe("DELETE");
    expect(lastCall().url).toContain("/api/buy/items/42");
    expect(lastCall().headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });
});
