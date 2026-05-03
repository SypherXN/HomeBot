# WebUI and API — possible next work

**Purpose:** Optional enhancements beyond what [Refined_WebUI_Adaptation_Plan.md](./Refined_WebUI_Adaptation_Plan.md) marks as shipped. Each backlog item states **what implementing it does** for users and the codebase.

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

---

## Other future directions (at a glance)

Longer sections below; this table is only **what the bot / household gains** if you implement each area.

| Area | What it would do for the bot / users |
|------|--------------------------------------|
| **Phase 5 identity** (refresh tokens, multi-tenant, OAuth-provisioned accounts) | Safer long-lived browser sessions, or multiple households / SSO — **large** changes to auth, storage, and ops assumptions. |
| **Money — non–split expenses in WebUI** | Same simple expense flows as Discord/API in the SPA: one-off line items **without** building a split; fewer “use Discord only” gaps. |
| **WebUI — `429` UX** | When rate limits fire, users see **retry guidance** instead of opaque fetch errors; **no** server change if messages are client-only. |
| **LAN / dev polish** | Odd Vite ports or **offline** banners reduce “why is nothing loading?” support load for self-hosters. |
| **Snowflake audit** | Guarantees large Discord IDs never round-trip as JSON numbers — **avoids silent corruption** on assignees and money participants. |
| **Domain vs Discord presentation** | Thinner shared core between commands and HTTP — **maintainer** velocity and fewer double implementations; small direct user impact unless you intentionally change copy. |
| **Ops / product polish** | Dedicated health page, extra deployment runbooks, or a **checked-in GitHub Actions** workflow — mainly **operator** convenience and repeatable deploys. |

---

## Phase 5 identity (beyond single-household JWT)

**Today:** One household; JWT from password login or Discord OAuth **linked to an existing** `WebUsers` row; optional `HOMEBOT_API_TOKEN` for scripts; `actorUserId` on mutations for “who did it.”

| Direction | What implementing it does |
|-----------|---------------------------|
| **Refresh tokens / session rotation** | Longer-lived convenience in the browser without relying on a single long-lived JWT in storage alone; adds rotation, invalidation, and storage choices (httpOnly cookies vs SPA storage). |
| **Multi-tenant / SSO** | Multiple households or external identity providers; large change from one SQLite database and one shared JWT secret model. |
| **OAuth creates the web account** | User signs in with Discord **before** a row exists and gets a provisioned `WebUsers` record; changes onboarding and trust compared to “OAuth only attaches to an existing user.” |

---

## Money — non–split expenses in the WebUI

**Today:** The Money page focuses on **split expenses**, **payments**, and **balances** (per adaptation plan).

**What implementing it does:** Exposes simple (non-split) expenses in the SPA for parity with any Discord or API flow that already supports them—users log one-off expenses without building a split; needs forms and validation aligned with existing API request types.

---

## WebUI — rate limiting (`429`) UX

**Today:** Auth and other routes can return **`429`** with `Retry-After` (see README / Phase 3). The SPA still treats most failures as a generic **`fetch`** / **`apiJson`** error unless you read the status elsewhere.

**What implementing it does:** Surfaces **clear, actionable messages** (“Too many attempts, try again in …”) on login, setup, OAuth callback, and optionally a shared **`apiJson`** wrapper—reduces confusion when IP-based limits trigger; **no server change** required.

---

## WebUI — LAN / dev edge cases (optional polish)

| Item | What implementing it does |
|------|---------------------------|
| **Custom Vite port** | Today auto API base only runs when the page is on port **5173** or **4173**. If you always use e.g. **`--port 3000`**, you could read a **`VITE_DEV_CLIENT_PORT`** or map `location.port`—**less manual Settings use** for odd ports. |
| **`fetch` / offline banner** | Detect `navigator.onLine` and failed health checks to show “You’re offline” or “Cannot reach API”—clearer than only the red **API unreachable** dot. |

---

## Snowflakes — audit and hardening

**Today:** Critical paths use string snowflakes in JSON where converters exist; API serializers often **write** ulongs as digit **strings** for converter-decorated DTOs.

**What implementing it does:** A pass over **every** API response type and WebUI parse site catches any remaining **numeric** ulong in JSON or unsafe `Number(...)` usage. **Prevents silent ID corruption** for real Discord snowflakes above `2^53−1` in edge responses or future endpoints.

---

## Domain vs Discord presentation (Phase 1 depth)

**Today:** Phase 1 is largely done; some Discord-specific `Build*` or formatting helpers may still sit beside HTTP-facing code.

**What implementing it does:** Moves presentation/formatting out of core services so **Discord commands and HTTP share thinner domain operations**—easier refactors and fewer dual paths; **little or no end-user feature** unless copy or embeds change intentionally.

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

1. **Quick wins:** **`429` UX** in the WebUI; optional **offline / fetch** messaging in `AppShell` or shared API helpers.  
2. **Product breadth:** **Money non-split** UI if your household uses that flow.  
3. **Correctness:** **Snowflake audit** if you use **real** Discord IDs everywhere.  
4. **Calendar polish:** **Discord reset-this-day** parity or **OpenAPI** touch-ups if scripts or third-party clients matter.  
5. **Large bets:** **Phase 5** identity expansion (refresh tokens, multi-tenant, or OAuth-provisioned accounts—pick one direction deliberately).
