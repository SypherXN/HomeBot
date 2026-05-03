# WebUI and API — possible next work

**Purpose:** Optional enhancements beyond what [Refined_WebUI_Adaptation_Plan.md](./Refined_WebUI_Adaptation_Plan.md) marks as shipped. Each backlog item states **what implementing it does** for users and the codebase.

**Related:** Implementation snapshot, routes, and patterns live in the adaptation plan. Step-by-step install, env vars, LAN, GitHub Pages, and Ubuntu boot are in **[SETUP.md](../SETUP.md)** at the repo root.

---

## Recently addressed (no longer “future”)

These are **already in the repo**; they stay out of the backlog below.

| Topic | What was added |
|--------|------------------|
| **API URL from the phone / LAN** | **Auto-detection:** on Vite **dev (5173)** or **preview (4173)**, the UI uses **same hostname + port 5050** unless you save an override. **Settings → API server** still allows a manual URL and **Reset to build default**. See `webui/src/apiBaseUrl.ts`. |
| **Setup documentation** | **[SETUP.md](../SETUP.md)** — Windows and Ubuntu, env var “where to get each value,” **systemd start on reboot**, **LAN / phone** (CORS, firewall, `--host`), GitHub Pages + Actions workflow example. |
| **Repo hygiene** | **`.gitignore`** expanded for build outputs, logs, SQLite sidecars, local `appsettings.*.local.json`, etc. |
| **Calendar — per-instance recurrence** | Extended **`CalendarRecurrenceExceptions`** (`ExceptionKind`, overrides, `InstanceCompleted`). API: **`POST …/omit-instance`**, **`POST …/complete-instance`**, **`PATCH …/instance`** (canonical `instanceStartUtc` + optional fields). Range rows include **`displayInstanceStartUtc`**, **`isInstanceCompleted`**, **`hasInstanceOverride`**. Reminders skip omitted / completed-this-day / completed modified instances. Discord: **`/calendar-instance-omit`**, **`/calendar-instance-complete`**, **`/calendar-instance-edit`**. WebUI detail modal from grid: hide, complete this day, save for this day, complete/delete series. **Undo** restores exception rows (`calendar_rec_ex` create/update). |

---

## Calendar — per-instance recurrence (future polish)

**Today:** Per-instance **hide**, **complete this day**, **edit this day** (title/notes/link/time override), **reminders** skip omitted/completed/suppressed instances, **Discord** `/calendar-instance-*`, and **Undo** for exception rows are implemented (see Recently addressed table).

**Possible follow-ups:** richer Today/Upcoming views that expand recurrence like the Web range; per-instance **end** override UX; optional “clear override” API.

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

## Frontend automated tests

**Today:** Regression coverage is mainly **.NET** integration tests (`ApiWebAuthTests`, `ApiAuthRateLimitTests`, mutation tests, etc.).

**What implementing it does:** **Playwright**, **Vitest**, and/or **MSW** against a test API catches **routing, auth, calendar time zones, API base URL logic, and forms** regressions before manual QA; complements but does not replace API tests.

---

## Optional product / ops polish

| Item | What implementing it does |
|------|---------------------------|
| **Dedicated `/health` page** | Bookmarkable full-page health view; **superseded** for most users by `AppShell` connection status—only adds value if you want a shareable diagnostics URL. |
| **Deployment runbooks** | [SETUP.md](../SETUP.md) already covers a lot; extra runbooks would add **host-specific** examples (nginx, Caddy, TLS renewal)—fewer mistakes for operators; mostly **docs**, not product code. |
| **GitHub Actions workflow file in repo** | SETUP describes a **Pages deploy** workflow; committing **`.github/workflows/deploy-webui.yml`** turns that into **one-click** deploys from `main` instead of copy-paste. |

---

## Suggested order (when you are not sure where to start)

1. **Quick wins:** **`429` UX** in the WebUI; optional **offline / fetch** messaging; **Playwright smoke** for login + Settings API URL.  
2. **Product breadth:** **Money non-split** UI if your household uses that flow.  
3. **Correctness:** **Snowflake audit** if you use **real** Discord IDs everywhere.  
4. **Large bets:** **Per-instance calendar** recurrence; **Phase 5** identity expansion; deeper **SPA E2E** suite.
