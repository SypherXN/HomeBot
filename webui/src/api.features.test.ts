import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getGoogleCalendarStatus,
  getHouseholdAudit,
  getHouseholdReport,
  getMealPlan,
  getMealRecipes,
  getMoneyBalances,
  getNotificationPreferences,
  getOpsHealth,
  getPushPublicConfig,
  getSearch,
  getStaleBuyItems,
  postBuyBulkComplete,
  postMealPlanAddToBuy,
  postMealRecipe,
  postWishlistAddToBuy,
  postWishlistBulkDelete,
  putNotificationPreferences,
} from "./api";
import { createHomeBotFetchMock, getCalls } from "./test/fetchMock";

const TOKEN = "test-bearer";
const ACTOR = "300001";

describe("API client — FEATURES.md surfaces", () => {
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
    return getCalls(fetchMock).at(-1)!;
  }

  it("search, stale buy, and money balances", async () => {
    await getSearch(TOKEN, "milk", 8);
    expect(lastCall().url).toContain("/api/search?q=milk");
    expect(lastCall().url).toContain("limit=8");

    await getStaleBuyItems(TOKEN, 21, 5);
    expect(lastCall().url).toContain("/api/buy/stale");
    expect(lastCall().url).toContain("days=21");

    await getMoneyBalances(TOKEN, ACTOR);
    expect(lastCall().url).toContain("/api/money/balances");
    expect(lastCall().url).toContain(`userId=${ACTOR}`);
  });

  it("bulk buy/wishlist and wishlist add-to-buy", async () => {
    await postBuyBulkComplete(TOKEN, ACTOR, [1, 2]);
    expect(lastCall().method).toBe("POST");
    expect(lastCall().url).toContain("/api/buy/items/bulk-complete");
    expect(JSON.parse(lastCall().body ?? "{}")).toMatchObject({
      actorUserId: ACTOR,
      ids: [1, 2],
    });

    await postWishlistBulkDelete(TOKEN, ACTOR, [3]);
    expect(lastCall().url).toContain("/api/wishlist/items/bulk-delete");

    await postWishlistAddToBuy(TOKEN, ACTOR, 9);
    expect(lastCall().url).toContain("/api/wishlist/items/9/add-to-buy");
    expect(lastCall().url).toContain(`actorUserId=${ACTOR}`);
  });

  it("meals, household report, audit, notification prefs", async () => {
    await getMealRecipes(TOKEN);
    expect(lastCall().url).toContain("/api/meals/recipes");

    await postMealRecipe(TOKEN, { name: "Soup", ingredients: [{ name: "Broth" }] });
    expect(lastCall().method).toBe("POST");

    await getMealPlan(TOKEN, "2026-08-01", "2026-08-07");
    expect(lastCall().url).toContain("/api/meals/plan");

    await postMealPlanAddToBuy(TOKEN, 4, ACTOR);
    expect(lastCall().url).toContain("/api/meals/plan/4/add-to-buy");

    await getHouseholdReport(TOKEN, "2026-08");
    expect(lastCall().url).toContain("/api/household/report");

    await getHouseholdAudit(TOKEN, 50);
    expect(lastCall().url).toContain("/api/audit/household");

    await getNotificationPreferences(TOKEN);
    expect(lastCall().url).toContain("/api/notifications/preferences");

    await putNotificationPreferences(TOKEN, {
      discordUserId: ACTOR,
      budgetAlerts: false,
      calendarDm: true,
      weeklyDigest: true,
    });
    expect(lastCall().method).toBe("PUT");
  });

  it("push, google calendar status, ops health", async () => {
    await getPushPublicConfig();
    expect(lastCall().url).toContain("/api/push/vapid-public-key");
    expect(lastCall().headers.Authorization).toBeUndefined();

    await getGoogleCalendarStatus(TOKEN);
    expect(lastCall().url).toContain("/api/calendar/google/status");

    await getOpsHealth(TOKEN);
    expect(lastCall().url).toContain("/api/ops/health");
  });
});
