# HomeBot

HomeBot is a **single-household** assistant that combines a **Discord bot** and an optional **HTTP API** with a **React Web UI**. It helps your family track shopping lists, a wishlist, shared money (expenses and payments), calendar tasks and events, and includes an **undo** stack for recent changes.

Everything shares one **SQLite** database (`homebot.db` by default), so Discord, the API, and the Web UI always see the same data.

---

## Quick start

If you are setting up for the **first time** (Discord application, bot token, `.env`, Windows or **Ubuntu + systemd** auto-start, Web UI, optional **GitHub Pages** and HTTPS), follow **[SETUP.md](SETUP.md)** end to end.

**Short path (after tools are installed):** copy **[`.env.example`](.env.example)** → **`.env`**, **[`webui/.env.example`](webui/.env.example)** → **`webui/.env`**, set **`DISCORD_TOKEN`**, **`DISCORD_GUILD_ID`**, **`HOMEBOT_API_ENABLED=true`**, **`HOMEBOT_API_TOKEN`**, **`HOMEBOT_WEB_JWT_SECRET`** (≥ 32 characters). From the repo root run **`dotnet run`**; in a second terminal run **`cd webui && npm install && npm run dev`**. The .NET process **does not read `.env` by itself** — use PowerShell, your editor’s **envFile**, **[`scripts/run-homebot.ps1`](scripts/run-homebot.ps1)** (Windows), or **`systemd`** **`EnvironmentFile=`** (Linux); [SETUP.md](SETUP.md) documents each.

**GitHub Pages:** use the checked-in **[`pages-webui.yml`](.github/workflows/pages-webui.yml)** workflow (enable **Pages → GitHub Actions**, set **`HOMEBOT_API_PUBLIC_URL`** and optionally **`HOMEBOT_WEBUI_BASE_PATH`**). Full steps: [SETUP.md — Section 13](SETUP.md#13-optional--github-pages-static-web-ui) (**`VITE_*`**, CORS, OAuth).

---

## What it does

| Area | Discord | Web UI |
|------|---------|--------|
| **Buy** | Add, list, complete, delete items; tag filters; channel-bound list UI | Same features with forms, pagination, tag catalog editor |
| **Wishlist** | Add, list, complete, delete; owners and tags | Same + owner filter |
| **Money** | Split-style expenses, payments, summaries | Ledger table, balance between two people, record payment / split expense |
| **Calendar** | Add, list, view, edit, complete, delete; today/upcoming (expanded recurrence); per-instance omit/complete/edit | Month / week / day / agenda, tasks, time zones, occurrence detail, reset day, undo |
| **Undo** | `/undo` reverts the last logged action for **you** | Undo on each feature page (one global stack per `actorUserId`, not per page) |
| **Config** | `/config-set`, `/config-view`, timezone commands, `/setup-set` to bind features to channels | Settings: API URL, token, calendar viewer zone, `actorUserId` |

Optional: after API writes (new item, etc.), the bot can **post a short notice** in the Discord channel bound for that feature—if Discord is enabled and channels are configured.

---

## How you are expected to use it

### 1. One process, two halves

- **Discord half** — Slash commands and button UIs in the channels you bind with **`/setup-set`**. Most commands only work in the channel assigned to that feature (see **`/help topic:setup`**).
- **Web half** — Open the Web UI in a browser, point it at your API URL, sign in (password, Discord OAuth if configured, or paste the shared **`HOMEBOT_API_TOKEN`** as a bearer), and set **`actorUserId`** when needed for complete / delete / undo / roster flows.

You can run **Discord only**, **API only**, or **both** in the same process (see environment variables below). **Install order, Discord portal clicks, Windows vs Ubuntu, systemd, and GitHub Pages** are in **[SETUP.md](SETUP.md)**.

### 2. Discord (after the bot is running)

Use **`/setup-set`** to bind **`buy`**, **`wishlist`**, **`money`**, and **`calendar`** (and optional **`audit`** for web sign-in logs). **`/help`** with a **topic** lists commands; **`/undo`** reverts your last change.

**Discord verify sign-up:** new users complete **`/webui-verify`** in your server with the code from the web setup page so **`WebUsers.DiscordUserId`** is set without typing snowflakes in the browser.

### 3. Web UI

Start the API (**`HOMEBOT_API_ENABLED=true`**) and set **`HOMEBOT_WEB_JWT_SECRET`** for web logins. From **`webui`**: **`npm install`**, **`npm run dev`** (defaults in **[`webui/.env.example`](webui/.env.example)**). **Sign in** issues a short-lived **access JWT** and stores a **refresh token** (opaque, server-side row); **Sign out** revokes the refresh row. **Settings** covers API base URL, optional bearer token, calendar viewer zone, and **`actorUserId`** / roster when the bot can list members.

The header shows **API reachability** and token acceptance; the UI refreshes state when the tab becomes visible again.

### 4. API usage (scripts or other clients)

- **`GET /api/health`** and **`GET /api/meta`** — no auth.
- Everything else under **`/api/*`** needs **`Authorization: Bearer …`** with either **`HOMEBOT_API_TOKEN`** or a **JWT** from `POST /api/auth/login`.
- Mutations that need “who did this” use the query parameter **`actorUserId`** (Discord user id as digits). See `/api/meta` for examples.

OpenAPI: **`GET /openapi/v1.json`**.

---

## Configuration (environment variables)

Values are read from the **process** environment (shell, systemd, Docker, or IDE). The app **does not** load a `.env` file by itself.

**Template:** copy **[`.env.example`](.env.example)** → **`.env`** (gitignored), fill in secrets, then load them before **`dotnet run`** — for example Cursor/VS Code **`envFile`** in **`launch.json`**, **`EnvironmentFile=`** in **systemd**, **[`scripts/run-homebot.ps1`](scripts/run-homebot.ps1)** on Windows, or **`set -a && source .env`** in an interactive shell. See [SETUP.md — Environment files](SETUP.md#5-environment-files-env-and-webuienv) through [Ubuntu + systemd](SETUP.md#8-ubuntu-server--install-systemd-auto-start-on-reboot).

### Always decide first

| Variable | Purpose |
|----------|---------|
| **`HOMEBOT_DISCORD_ENABLED`** | Set to `false` for **API-only** (no Discord client). |
| **`HOMEBOT_API_ENABLED`** | Set to **`true`** to listen for HTTP (default URL `http://0.0.0.0:5050` unless **`HOMEBOT_API_URL`** is set). |

### Discord (when Discord is enabled)

| Variable | Required |
|----------|----------|
| **`DISCORD_TOKEN`** | Yes — bot token. |
| **`DISCORD_GUILD_ID`** | Yes — numeric guild id for slash commands. |

### HTTP API

| Variable | Purpose |
|----------|---------|
| **`HOMEBOT_API_URL`** | Listen URL (default **`http://0.0.0.0:5050`**). |
| **`HOMEBOT_API_TOKEN`** | Shared secret for `Authorization: Bearer` (optional if you rely only on JWTs from web login). |
| **`HOMEBOT_ALLOWED_ORIGINS`** | CORS for browsers; comma-separated. If unset, only **`http://localhost:5173`** is allowed (Vite default). Include every origin where you open the Web UI. At startup the API **also** adds the **http(s) origin** parsed from **`HOMEBOT_WEB_OAUTH_FRONTEND_URL`** when it is not already listed, so OAuth + API calls from the SPA usually work without duplicating that URL here. |
| **`HOMEBOT_DATABASE_PATH`** | Optional — SQLite file or `Data Source=…` connection string. |
| **`HOMEBOT_API_MAX_BODY_BYTES`** | Optional — cap for JSON request body size on Phase 3 routes. |
| **`HOMEBOT_API_MUTATION_PERMIT_LIMIT`** | Optional — max mutation **POST/PUT/PATCH/DELETE** requests **per client IP per minute** (default **200**). |

### Web logins (JWT)

| Variable | Purpose |
|----------|---------|
| **`HOMEBOT_WEB_JWT_SECRET`** | Required for web sign-in and user creation flows — **≥ 32 UTF-8 bytes**. Never put this in the frontend; it stays on the server. |
| **`HOMEBOT_WEB_SETUP_TOKEN`** | Optional — if set, manual **first-user** bootstrap on the web must include this token. |
| **`HOMEBOT_WEB_INVITE_TOKEN`** | Optional — if set, manual **additional-user** registration must include this invite. |
| **`HOMEBOT_WEB_JWT_ACCESS_TTL_SECONDS`** | Optional — lifetime of **access** JWTs (default **900** = 15 minutes; allowed **300–1209600**). Longer values behave like a longer-lived session token. |
| **`HOMEBOT_WEB_REFRESH_TTL_SECONDS`** | Optional — opaque **refresh** tokens stored in SQLite (default **2592000** = 30 days; allowed **3600–31536000**). |

### Discord OAuth (optional — “Continue with Discord” on Sign in)

Uses the same **`WebUsers`** row as password login when **`DiscordUserId`** matches. There is **no** auto-provisioning from OAuth alone; the user must already exist (e.g. after Discord verify signup). **Multi-tenant / SSO** and **Discord-first account creation** are out of scope for this repository.

| Variable | Purpose |
|----------|---------|
| **`HOMEBOT_DISCORD_OAUTH_CLIENT_ID`** | Discord application → OAuth2 → Client ID. |
| **`HOMEBOT_DISCORD_OAUTH_CLIENT_SECRET`** | Discord application → OAuth2 → Client secret. |
| **`HOMEBOT_DISCORD_OAUTH_REDIRECT_URI`** | Must match **one** of the **Redirect URLs** in the Discord app **exactly** (scheme, host, port, path). This URL is on the **API** host, not the Vite dev server — e.g. **`http://localhost:5050/api/auth/discord/oauth/callback`**. |
| **`HOMEBOT_WEB_OAUTH_FRONTEND_URL`** | Origin where the React app is served (no path). After Discord, the API redirects the browser here with **`/oauth/callback?…`**. Default if unset: **`http://localhost:5173`**. |

**Also required for OAuth:** **`HOMEBOT_WEB_JWT_SECRET`** (same as password login — used for signed OAuth `state` and for issuing the JWT).

**Discord Developer Portal:** enable OAuth2, add the redirect URI above, scope **`identify`** is requested by the app.

### Operational startup (console)

When **`HOMEBOT_API_ENABLED=true`**, HomeBot prints **one-time operational messages** at API startup: warnings if **neither** **`HOMEBOT_API_TOKEN`** **nor** **`HOMEBOT_WEB_JWT_SECRET`** is set (protected `/api` returns **503**); if Discord OAuth env is **partly** set (only one or two of client id / secret / redirect); if OAuth is **fully** set but JWT is not; if **`HOMEBOT_DISCORD_OAUTH_REDIRECT_URI`** is not a valid **http(s)** absolute URL; and an **info** line when the OAuth SPA origin was **merged into CORS** because **`HOMEBOT_ALLOWED_ORIGINS`** omitted it.

**Non-development:** if only **some** of the three Discord OAuth variables are set, the API **refuses to start** with a clear exception (prevents half-configured production). Override with **`HOMEBOT_ALLOW_PARTIAL_OAUTH_ENV=true`** if you intentionally want a partial OAuth env outside Development (e.g. staging experiments).

### Auth rate limits (per client IP, rolling 1-minute window)

Public auth routes are **rate-limited** separately from the general mutation bucket. Defaults are conservative for a household; tune with env vars if legitimate traffic hits **429 Too Many Requests**.

| Variable | Default | Applies to |
|----------|---------|------------|
| **`HOMEBOT_API_AUTH_LOGIN_PER_MINUTE`** | **30** | `POST /api/auth/login` |
| **`HOMEBOT_API_AUTH_REFRESH_PER_MINUTE`** | **36** | `POST /api/auth/refresh` and `POST /api/auth/logout` (shared counter per IP) |
| **`HOMEBOT_API_OAUTH_CONSUME_PER_MINUTE`** | **15** | `POST /api/auth/discord/oauth/consume` |
| **`HOMEBOT_API_OAUTH_BROWSER_PER_MINUTE`** | **48** | `GET` OAuth authorize URL + `GET` OAuth callback (shared counter per IP) |
| **`HOMEBOT_API_AUTH_ACCOUNT_WRITE_PER_MINUTE`** | **24** | `POST` bootstrap, register, Discord verify start, complete-bootstrap, complete-register (shared counter per IP) |
| **`HOMEBOT_API_DISCORD_STATUS_POLL_PER_MINUTE`** | **120** | `GET /api/auth/discord/status` (setup page polling) |

### Web UI (Vite — build / dev)

| Variable | Where | Purpose |
|----------|--------|---------|
| **`VITE_API_BASE_URL`** | `webui/.env` or shell | Base URL for API calls (default **`http://localhost:5050`**). Set at **`npm run dev`** / **`npm run build`** time. |
| **`VITE_BASE_PATH`** | `webui/.env` | Base path for the SPA (default **`/`**). Use e.g. **`/HomeBot/`** for GitHub Pages project sites. |

See **[`webui/.env.example`](webui/.env.example)**.

### Running locally (minimal example)

**Bot + API + Web UI on one machine:**

```text
DISCORD_TOKEN=...
DISCORD_GUILD_ID=...
HOMEBOT_API_ENABLED=true
HOMEBOT_API_TOKEN=long-random-shared-secret
HOMEBOT_WEB_JWT_SECRET=another-long-random-secret-at-least-32-bytes
```

For Discord browser sign-in, add the OAuth variables from **[`.env.example`](.env.example)** and register the same **`HOMEBOT_DISCORD_OAUTH_REDIRECT_URI`** in the Discord app.

Then run the .NET app from the repo root, and in another terminal run `npm run dev` inside **`webui`** (optionally copy **[`webui/.env.example`](webui/.env.example)** to **`webui/.env`** for **`VITE_API_BASE_URL`**).

---

## Build and run

From the **repository root** unless noted otherwise. Uses **.NET 10** (`net10.0`) and **SQLite** via **`Microsoft.Data.Sqlite`**.

### .NET (bot + API)

```bash
dotnet run
```

### Tests

```bash
dotnet test HomeBot.Tests/HomeBot.Tests.csproj
```

The test assembly disables **xUnit parallelization** ([`HomeBot.Tests/AssemblyInfo.cs`](HomeBot.Tests/AssemblyInfo.cs)) because several fixtures set process-global **`HOMEBOT_WEB_JWT_SECRET`**; parallel runs could clear it between `await` calls in another test.

Stop any running `HomeBot` process first if the build cannot overwrite `HomeBot.dll` or `HomeBot.exe`.

### Continuous integration

Pushes and pull requests to **`main`** run **[`.github/workflows/ci.yml`](.github/workflows/ci.yml)**: **.NET** restore, Release build, **`dotnet test`**, and **Web UI** **`npm ci`**, **`npm run lint`**, and **`npm run build`** (Ubuntu, Node **22**).

### Dependency updates

**[Dependabot](https://docs.github.com/en/code-security/dependabot/dependabot-version-updates)** is configured in **[`.github/dependabot.yml`](.github/dependabot.yml)** (monthly **NuGet** and **npm** / `webui`, **grouped** so you typically get one combined PR per ecosystem per month). Review and merge after **`dotnet test`** / **`npm run build`** as you would any other change.

### Web UI

```bash
cd webui
npm install
npm run dev
```

Build for static hosting:

```bash
cd webui
npm run build
```

Output is in **`webui/dist`**. Set **`VITE_API_BASE_URL`** at build time if the API is not on `http://localhost:5050`.

---

## Data and safety

- **SQLite** holds items, settings, channel bindings, action log (undo), **`WebUsers`**, Discord verify sessions, and **opaque refresh tokens** (`WebRefreshTokens`) for browser sessions. **Backups:** copy the DB when the process is stopped, and include **`-wal`** / **`-shm`** files if present — see [SETUP.md — Section 20](SETUP.md#20-backing-up-sqlite-homebotdb) and [automated options](SETUP.md#201-automated-backups-optional).
- **Snowflakes:** Large Discord ids are handled as **strings** in JSON where it matters (money, calendar assignee, list API responses, buy/wishlist writes). Prefer roster picks or member labels when the UI offers them.
- **Secrets:** Do not commit tokens or **`HOMEBOT_WEB_JWT_SECRET`**. The Web UI stores access JWT, optional API bearer, and refresh token in **browser localStorage**; **Sign out** clears client storage and **`POST /api/auth/logout`** revokes the refresh row on the server.

---

## License

This project is licensed under the **MIT License** (copyright **Matthew Tran**) — see **[LICENSE](LICENSE)** for the full text.

HomeBot is a **single-household** project; you may still customize deployment and ops for your own servers (see [SETUP.md](SETUP.md)).
