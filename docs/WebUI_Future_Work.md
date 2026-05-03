# WebUI and API — possible next work

**Purpose:** Optional enhancements beyond what [Refined_WebUI_Adaptation_Plan.md](./Refined_WebUI_Adaptation_Plan.md) already marks as shipped. Each item states **what implementing it does** for users and the codebase.

**Related:** Implementation snapshot, routes, and patterns live in the adaptation plan; treat that document as the shipped baseline.

---

## Calendar — per-instance recurrence (skip / edit / complete)

**Today:** Recurring items expand in range responses; **Complete** and **Delete** apply to the **entire series**. The WebUI warns in the item detail flow when opened from a recurring instance.

**What implementing it does:** Lets users change, skip, or complete **one occurrence** without altering the whole series. Requires **new persistence and API** (e.g. exception/overrides keyed by parent id + instance date), updates to range expansion, and WebUI actions bound to instance identity—not a UI-only change.

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

**Today:** Auth and other routes can return **`429`** with `Retry-After` (see README / Phase 3). The SPA does not specialize handling for those responses.

**What implementing it does:** Surfaces **clear, actionable messages** (“Too many attempts, try again in …”) on login, setup, OAuth callback, and optionally global fetch—reduces confusion when IP-based limits trigger; **no server change** required.

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

**What implementing it does:** **Playwright**, **Vitest**, and/or **MSW** against a test API catches **routing, auth, calendar time zones, and form** regressions before manual QA; complements but does not replace API tests.

---

## Optional product / ops polish

| Item | What implementing it does |
|------|---------------------------|
| **Dedicated `/health` page** | Bookmarkable full-page health view; **superseded** for most users by `AppShell` connection status—only adds value if you want a shareable diagnostics URL. |
| **`.gitignore` / CI hygiene** | Keeps `bin`, `obj`, `.build-out`, `webui/dist`, coverage outputs, and local DB files **out of commits**; `git status` stays readable. |
| **Deployment runbooks** | Document reverse proxy, HTTPS, `HOMEBOT_ALLOWED_ORIGINS`, and `HOMEBOT_WEB_OAUTH_FRONTEND_URL` for non-local hosts—fewer production misconfigurations; no code change. |

---

## Suggested order (when you are not sure where to start)

1. **Quick wins:** `429` UX in the WebUI; confirm `.gitignore` covers all local build outputs.  
2. **Product breadth:** Money non-split UI if your household uses that flow.  
3. **Correctness:** Snowflake audit if you use **real** Discord IDs everywhere.  
4. **Large bets:** Per-instance calendar recurrence; Phase 5 identity expansion; SPA E2E suite.
