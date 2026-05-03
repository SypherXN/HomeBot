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
| **Discord** | **`BuildToday` / `BuildUpcoming`** use the same service methods as the API, so embed **Today** and **Upcoming** lists match recurrence and exceptions, not just raw DB rows. |
| **Reminders** | Unchanged contract: still consult exception state so **omitted** / **completed-this-day** / **completed modified** instances do not fire incorrectly. |
| **Web UI** | Calendar grid opens **occurrence-aware** detail (merged fields), optional **end time** for “this day only,” **Reset this day** for the DELETE above, and **Undo** in-page still applies to the last logged action (including exception delete). |

---

## Recently addressed (no longer “future”)

These are **already in the repo**; they stay out of the backlog below.

| Topic | What was added |
|--------|----------------|
| **API URL from the phone / LAN** | **Auto-detection:** on Vite **dev (5173)** or **preview (4173)**, the UI uses **same hostname + port 5050** unless you save an override. **Settings → API server** still allows a manual URL and **Reset to build default**. See `webui/src/apiBaseUrl.ts`. |
| **Setup documentation** | **[SETUP.md](../SETUP.md)** — Windows and Ubuntu, env var “where to get each value,” **systemd start on reboot**, **LAN / phone** (CORS, firewall, `--host`), GitHub Pages + Actions workflow example. |
| **Repo hygiene** | **`.gitignore`** expanded for build outputs, logs, SQLite sidecars, local `appsettings.*.local.json`, etc. |
| **Calendar — recurrence core** | **`CalendarRecurrenceExceptions`** (`ExceptionKind`, overrides, `InstanceCompleted`). API: **`POST …/omit-instance`**, **`POST …/complete-instance`**, **`PATCH …/instance`** (canonical **`instanceStartUtc`** + optional fields). Range rows: **`displayInstanceStartUtc`**, **`isInstanceCompleted`**, **`hasInstanceOverride`**, etc. Reminders skip omitted / completed-this-day / modified-completed instances. Discord: **`/calendar-instance-omit`**, **`/calendar-instance-complete`**, **`/calendar-instance-edit`**. WebUI: hide / complete this day / save for this day / complete or delete series. **Undo** for exception **create** / **update**. |
| **Calendar — list & detail parity, reset, undo delete** | **`GET /api/calendar/today`** & **`/upcoming`** driven by **`GetRange`** + tasks; list DTOs expose **`instanceStartUtc`**. **`GET …/items/{id}?instanceStartUtc=…`** merged occurrence detail (incl. end from override or series duration). **`DELETE …/items/{id}/instance?instanceStartUtc=…`** clears that occurrence’s exception row; **Undo** restores it. WebUI: occurrence-keyed detail fetch, optional per-instance **end**, **Reset this day** button. |
| **WebUI — narrow screens / layout** | **Overflow-safe** forms and inputs (`min-w-0` / `max-w-full`), **pagination** controls that stay usable on small widths, **calendar** toolbar and modals tuned for phones, **`DiscordMemberSelect`** full-width + short option text + `title` tooltips, **`AppShell`** horizontal nav scroll, **main** `min-w-0`, **Sign in / New account** row on mobile and stacked on `md+`. Touch points: `AppShell.tsx`, `CalendarPage.tsx`, calendar modals, Buy/Money/Wishlist pages, `DiscordMemberSelect.tsx`. |
| **WebUI — `429` / rate limit UX** | **`apiJson`** (`webui/src/api.ts`) maps **`429`** to a short user message and honors **`Retry-After`** (delay-seconds or HTTP-date). Login, setup, OAuth consume, Settings, and feature pages pick it up via existing `catch (e) => e.message` handling. **No** API change required beyond existing rate limits. |
| **Snowflake JSON (Discord ids)** | Public list/detail/request DTOs already used **`SnowflakeUlongJsonConverter`** / **`SnowflakeUlongNullableJsonConverter`**. **Undo payloads** (`BuyUndoModel`, `MoneyUndoModel`, `WishlistUndoModel`, `WishlistCompleteUndoModel`, `CalendarDeleteUndoModel`) now use the same converters so **`ActionLog`** JSON stores digit **strings** (new rows), while **deserialization** still accepts legacy numeric tokens. **`HomeBot.Tests/SnowflakeJsonSerializationTests.cs`** locks string serialization and round-trip for a snowflake above JS **`MAX_SAFE_INTEGER`**. **`GET /api/discord/guild/members`** already returns **`userId`** / **`guildId`** as strings. Web UI types treat ids as **`string`** and send digits in JSON bodies via **`jsonSnowflakeDigits`** / **`moneySnowflake`**. |
| **Domain vs Discord presentation (list UIs)** | **`BuyService`**, **`WishlistService`**, **`MoneyService`**, and **`CalendarService`** no longer take a dependency on **`Discord.Net`** for paginated list / summary / transaction UIs. Static types under **`Presentation/Discord/`** — **`BuyListDiscordPresentation`**, **`WishlistListDiscordPresentation`**, **`MoneyDiscordPresentation`**, **`CalendarListDiscordPresentation`** — call the existing **`Get*`** / **`GetSummary`** / **`GetTransactions`** methods and own embed rows, **`ListUIBuilder`**, and button **`CustomId`** strings. **`Program`** button handlers and slash commands call those presenters. Per-item **detail** slash flows (e.g. **`wishlist-view`**, **`calendar-view`**) still build one-off embeds in command modules, which is an acceptable Discord-only layer. |

---

## Other future directions (at a glance)

Summary of **open** backlog; detailed sections follow. **Not backlog** items are [called out separately](#explicitly-not-backlog) so they do not look like future work.

| Area | What it would do for the bot / users |
|------|--------------------------------------|
| **Phase 5 identity** (refresh tokens, multi-tenant, OAuth-provisioned accounts) | Safer long-lived browser sessions, or multiple households / SSO — **large** changes to auth, storage, and ops assumptions. *(Single-household JWT + Discord OAuth **linked to an existing** web user is already shipped; see adaptation plan Phase 5.)* |
| **LAN / dev polish** | Odd Vite ports or **offline** banners reduce “why is nothing loading?” support load for self-hosters. |
| **Ops / product polish** | Dedicated health page, extra deployment runbooks, or a **checked-in GitHub Actions** workflow — mainly **operator** convenience and repeatable deploys. |

---

## Explicitly not backlog

| Topic | Decision |
|--------|----------|
| **Money — non-split line items in the Web UI** | **Not planned.** One-off expenses can be entered as a **split expense** with a **single 100%** share (same totals and balances). The SPA stays focused on split / payment / balance flows. |

---

## Phase 5 identity (beyond what is shipped today)

**Shipped today (still “Phase 5” in the adaptation plan):** One household; JWT from password login or Discord OAuth **linked to an existing** `WebUsers` row; optional `HOMEBOT_API_TOKEN` for scripts; `actorUserId` on mutations for “who did it.” Per-IP **rate limits** on public auth routes return **`429`** + **`Retry-After`**; the Web UI surfaces that in **`apiJson`** (see Recently addressed).

| Direction | What implementing it does |
|-----------|---------------------------|
| **Refresh tokens / session rotation** | Longer-lived convenience in the browser without relying on a single long-lived JWT in storage alone; adds rotation, invalidation, and storage choices (httpOnly cookies vs SPA storage). |
| **Multi-tenant / SSO** | Multiple households or external identity providers; large change from one SQLite database and one shared JWT secret model. |
| **OAuth creates the web account** | User signs in with Discord **before** a row exists and gets a provisioned `WebUsers` record; changes onboarding and trust compared to “OAuth only attaches to an existing user.” |

---

## WebUI — LAN / dev edge cases (optional polish)

| Item | What implementing it does |
|------|---------------------------|
| **Custom Vite port** | Today auto API base only runs when the page is on port **5173** or **4173**. If you always use e.g. **`--port 3000`**, you could read a **`VITE_DEV_CLIENT_PORT`** or map `location.port`—**less manual Settings use** for odd ports. |
| **`fetch` / offline banner** | Detect `navigator.onLine` and failed health checks to show “You’re offline” or “Cannot reach API”—clearer than only the red **API unreachable** dot. |

---

## Calendar — optional follow-ups

**Today:** Recurrence expansion, per-instance APIs, list/detail parity, Web reset, and undo for exception delete are shipped (see tables above).

| Follow-up | What implementing it does |
|-----------|---------------------------|
| **Discord “reset this occurrence”** | Slash or button flow mirroring **`DELETE …/instance`** so phone-Discord-only users can clear overrides without the Web UI. |
| **OpenAPI / docs strings** | Generated or hand-maintained docs list **`instanceStartUtc`** on GET detail and **DELETE instance** — faster integration for scripts and agents. |
| **Dashboard copy / limits** | Today/upcoming tiles already call the same APIs; optional tweaks (page size, copy) if snapshots feel too busy after expansion. |

---

## Optional product / ops polish

| Item | What implementing it does |
|------|---------------------------|
| **Dedicated `/health` page** | Bookmarkable full-page health view; **superseded** for most users by `AppShell` connection status—only adds value if you want a shareable diagnostics URL. |
| **Deployment runbooks** | [SETUP.md](../SETUP.md) already covers a lot; extra runbooks would add **host-specific** examples (nginx, Caddy, TLS renewal)—fewer mistakes for operators; mostly **docs**, not product code. |
| **GitHub Actions workflow file in repo** | SETUP describes a **Pages deploy** workflow; committing **`.github/workflows/deploy-webui.yml`** turns that into **one-click** deploys from `main` instead of copy-paste. |

---

## Suggested order (when you are not sure where to start)

1. **Quick wins:** **LAN / dev polish** (offline or odd-port API base) — **`429` UX is already done** in `apiJson`.  
2. **Calendar polish:** **Discord reset-this-day** parity or **OpenAPI** touch-ups if scripts or third-party clients matter.  
3. **Large bets:** **Phase 5** identity expansion beyond single-household JWT (refresh tokens, multi-tenant, or OAuth-provisioned accounts—pick one direction deliberately).
