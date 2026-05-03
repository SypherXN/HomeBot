# WebUI and API — possible next work

**Purpose:** Optional enhancements beyond what [Refined_WebUI_Adaptation_Plan.md](./Refined_WebUI_Adaptation_Plan.md) marks as shipped. **Recently addressed** lists work already merged; **Other future directions** and the sections below are the **remaining** backlog unless marked *not backlog*. Keep those two lists in sync when you ship or explicitly defer something.

**Out of scope for this doc:** **Frontend / E2E / SPA automation** (Playwright, Vitest, MSW, component test harnesses, etc.). The repo already has **.NET** integration coverage where noted in the adaptation plan; how much browser automation to add is a separate process choice, not listed here.

**Related:** Implementation snapshot, routes, and patterns live in the adaptation plan. Step-by-step install, env vars, LAN, GitHub Pages, and Ubuntu boot are in **[SETUP.md](../SETUP.md)** at the repo root.

---

## What the latest calendar extension does (household + bot)

Together these changes keep **Discord, HTTP API, reminders, and Web UI** aligned on **recurring** calendar behavior:

| Layer | Effect |
|--------|--------|
| **API `GET /api/calendar/today` & `/upcoming`** | Same expansion rules as **`GET /api/calendar/range`**: recurring series show one row per occurrence in the window, respect **omit** / **complete-this-day** / **time overrides**, and include **`instanceStartUtc`** on each row so clients can key and re-fetch that slot. **Tasks** are still merged in (all active tasks for today; all tasks plus in-window events for upcoming). |
| **API `GET /api/calendar/items/{id}`** | Optional query **`instanceStartUtc`** returns **merged** detail for that occurrence (title/notes/link/start/end when overrides or series duration apply). Omitted instances return **not found** (same as “hidden” in range). |
| **`DELETE /api/calendar/items/{id}/instance`** | Removes the **`CalendarRecurrenceExceptions`** row for that canonical slot (clears hide, complete-this-day, or modify overrides). **Undo** restores the deleted row (`calendar_rec_ex` **delete** path). |
| **Discord** | **Today** / **Upcoming** embeds use the same **`GetToday`** / **`GetUpcoming`** data as the API (via **`CalendarListDiscordPresentation`**), so lists match recurrence and exceptions, not just raw DB rows. **`/calendar-instance-reset`** and **`↩{id}`** buttons clear per-day overrides without the Web UI. |
| **Reminders** | Unchanged contract: still consult exception state so **omitted** / **completed-this-day** / **completed modified** instances do not fire incorrectly. |
| **Web UI** | Calendar grid opens **occurrence-aware** detail (merged fields), optional **end time** for “this day only,” **Reset this day** for the DELETE above, and **Undo** in-page still applies to the last logged action (including exception delete). |

---

## Recently addressed (no longer “future”)

These are **already in the repo**; they stay out of the backlog below.

| Topic | What was added |
|--------|----------------|
| **WebUI — LAN / dev polish** | **`apiBaseUrl`:** same-host **:5050** inference for Vite **dev on any port**, **preview on 4173**, or preview on a port matching **`VITE_DEV_CLIENT_PORT`** in `.env` (see `webui/.env.example`). **`useApiConnectionStatus`:** **`navigator.onLine`**, **`offline`/`online`** events, clearer labels for fetch failures, optional tip in the error detail. **`AppShell`:** banner under the header when **offline** or **cannot reach API** (link to Settings). **Settings** copy updated for the new rules. |
| **Setup documentation** | **[SETUP.md](../SETUP.md)** — Windows and Ubuntu, env var “where to get each value,” **systemd start on reboot**, **LAN / phone** (CORS, firewall, `--host`), GitHub Pages + Actions workflow example. |
| **Repo hygiene** | **`.gitignore`** expanded for build outputs, logs, SQLite sidecars, local `appsettings.*.local.json`, etc. |
| **Calendar — recurrence core** | **`CalendarRecurrenceExceptions`** (`ExceptionKind`, overrides, `InstanceCompleted`). API: **`POST …/omit-instance`**, **`POST …/complete-instance`**, **`PATCH …/instance`** (canonical **`instanceStartUtc`** + optional fields). Range rows: **`displayInstanceStartUtc`**, **`isInstanceCompleted`**, **`hasInstanceOverride`**, etc. Reminders skip omitted / completed-this-day / modified-completed instances. Discord: **`/calendar-instance-omit`**, **`/calendar-instance-complete`**, **`/calendar-instance-edit`**. WebUI: hide / complete this day / save for this day / complete or delete series. **Undo** for exception **create** / **update**. |
| **Calendar — list & detail parity, reset, undo delete** | **`GET /api/calendar/today`** & **`/upcoming`** driven by **`GetRange`** + tasks; list DTOs expose **`instanceStartUtc`**. **`GET …/items/{id}?instanceStartUtc=…`** merged occurrence detail (incl. end from override or series duration). **`DELETE …/items/{id}/instance?instanceStartUtc=…`** clears that occurrence’s exception row; **Undo** restores it. WebUI: occurrence-keyed detail fetch, optional per-instance **end**, **Reset this day** button. |
| **WebUI — narrow screens / layout** | **Overflow-safe** forms and inputs (`min-w-0` / `max-w-full`), **pagination** controls that stay usable on small widths, **calendar** toolbar and modals tuned for phones, **`DiscordMemberSelect`** full-width + short option text + `title` tooltips, **`AppShell`** horizontal nav scroll, **main** `min-w-0`, **Sign in / New account** row on mobile and stacked on `md+`. Touch points: `AppShell.tsx`, `CalendarPage.tsx`, calendar modals, Buy/Money/Wishlist pages, `DiscordMemberSelect.tsx`. |
| **WebUI — `429` / rate limit UX** | **`apiJson`** (`webui/src/api.ts`) maps **`429`** to a short user message and honors **`Retry-After`** (delay-seconds or HTTP-date). Login, setup, OAuth consume, Settings, and feature pages pick it up via existing `catch (e) => e.message` handling. **No** API change required beyond existing rate limits. |
| **Snowflake JSON (Discord ids)** | Public list/detail/request DTOs already used **`SnowflakeUlongJsonConverter`** / **`SnowflakeUlongNullableJsonConverter`**. **Undo payloads** (`BuyUndoModel`, `MoneyUndoModel`, `WishlistUndoModel`, `WishlistCompleteUndoModel`, `CalendarDeleteUndoModel`) now use the same converters so **`ActionLog`** JSON stores digit **strings** (new rows), while **deserialization** still accepts legacy numeric tokens. **`HomeBot.Tests/SnowflakeJsonSerializationTests.cs`** locks string serialization and round-trip for a snowflake above JS **`MAX_SAFE_INTEGER`**. **`GET /api/discord/guild/members`** already returns **`userId`** / **`guildId`** as strings. Web UI types treat ids as **`string`** and send digits in JSON bodies via **`jsonSnowflakeDigits`** / **`moneySnowflake`**. |
| **Domain vs Discord presentation (list UIs)** | **`BuyService`**, **`WishlistService`**, **`MoneyService`**, and **`CalendarService`** no longer take a dependency on **`Discord.Net`** for paginated list / summary / transaction UIs. Static types under **`Presentation/Discord/`** — **`BuyListDiscordPresentation`**, **`WishlistListDiscordPresentation`**, **`MoneyDiscordPresentation`**, **`CalendarListDiscordPresentation`** — call the existing **`Get*`** / **`GetSummary`** / **`GetTransactions`** methods and own embed rows, **`ListUIBuilder`**, and button **`CustomId`** strings. **`Program`** button handlers and slash commands call those presenters. Per-item **detail** slash flows (e.g. **`wishlist-view`**, **`calendar-view`**) still build one-off embeds in command modules, which is an acceptable Discord-only layer. |
| **Ops / product polish** | **`/health`** route (**`HealthPage`**) with **`/api/health`** + **`/api/meta`** JSON, **Diagnostics** link in **`AppShell`** and Settings API blurb. **`.github/workflows/deploy-webui.yml`** for GitHub Pages ( **`VITE_BASE_PATH`**, **`vars.HOMEBOT_API_PUBLIC_URL`** ). **`docs/OPS.md`** reverse-proxy snippets; **[SETUP.md](../SETUP.md)** §5.2 points at the checked-in workflow and §8 links **OPS**. |
| **Phase 5 — refresh sessions** | **`WebRefreshTokens`** table; short-lived access JWT (default **15m**, **`HOMEBOT_WEB_JWT_ACCESS_TTL_SECONDS`**); opaque refresh token (**`HOMEBOT_WEB_REFRESH_TTL_SECONDS`**); **`POST /api/auth/refresh`** (rotate) + **`POST /api/auth/logout`**; rate limit **`auth_refresh`**. Web UI: **`storageKeys`**, **`apiJson`** silent refresh on **401**, Settings sign-out revokes refresh. |
| **Calendar — optional follow-ups (Discord / OpenAPI / dashboard)** | **`/calendar-instance-reset`** slash (same as **`DELETE …/instance`**). **Today** / **Upcoming** Discord embeds: **`↩{id}`** buttons (`calrst-…` custom ids) when **`InstanceStartUtc`** is set and the list is not user-filtered. **`CalendarRouteOpenApi`**: OpenAPI summaries for **`GET /api/calendar/items/{id}`** / legacy **`GET /api/calendar/{id}`** and **`DELETE …/instance`** (`instanceStartUtc`). **`ApiPhase3Tests`** asserts doc text. **Dashboard**: full first page of today/upcoming with date hints, **`+N more`** copy, stable list keys. |

---

## Other future directions (at a glance)

Summary of **open** backlog; detailed sections follow. **Not backlog** items are [called out separately](#explicitly-not-backlog) so they do not look like future work.

*(No open “Phase 5 identity” rows — multi-tenant / SSO and OAuth-provisioned accounts are [explicitly not backlog](#explicitly-not-backlog).)*

---

## Explicitly not backlog

| Topic | Decision |
|--------|----------|
| **Money — non-split line items in the Web UI** | **Not planned.** One-off expenses can be entered as a **split expense** with a **single 100%** share (same totals and balances). The SPA stays focused on split / payment / balance flows. |
| **Multi-tenant / SSO** | **Not planned** for this household-shaped bot: one SQLite database, one shared JWT model, and Discord OAuth **only** attaches to an existing **`WebUsers`** row. |
| **OAuth-provisioned web accounts** | **Not planned:** no auto-creating **`WebUsers`** from Discord sign-in alone; onboarding stays **Discord verify** / **bootstrap** / **invite register** as today. |

---

## Suggested order (when you are not sure where to start)

1. **Household / ops:** Anything in **[SETUP.md](../SETUP.md)** / **[OPS.md](./OPS.md)** you still want tightened (TLS, deploy, monitoring) — not tracked as API backlog here.
