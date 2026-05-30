# HomeBot

HomeBot is a **single-household** assistant: a **Discord bot**, an optional **HTTP API**, and a **React Web UI** on one **SQLite** database (`homebot.db` by default). Use it for shopping lists, a wishlist, shared money (splits and payments), **household budgeting** (envelopes, accounts, bills), calendar events and tasks, **meal planning**, **global search**, and an **undo** stack for recent changes.

Discord, the API, and the browser always see the same data. Optional **Google Calendar** two-way sync, **webhooks**, **PWA + Web Push** on iPhone, and an **ops/diagnostics** page are documented in **[docs/FEATURES.md](docs/FEATURES.md)** and the linked guides below.

---

## Quick start

| Goal | Where to go |
|------|-------------|
| **First-time setup** (Discord app, `.env`, Windows or Ubuntu, Web UI, OAuth, GitHub Pages) | **[docs/SETUP.md](docs/SETUP.md)** |
| **Free VM hosting** (Oracle Always Free — Steps A–J: VM, HTTPS, Pages, Drive) | **[docs/SETUP.md §2.5](docs/SETUP.md#25-free-vm-hosting-optional)** |
| **Ubuntu server** (install script, systemd, updates) | **[docs/UBUNTU_DEPLOY.md](docs/UBUNTU_DEPLOY.md)** |
| **What the product can do** | **[docs/FEATURES.md](docs/FEATURES.md)** |
| **iPhone / PWA / push** | **[docs/MOBILE.md](docs/MOBILE.md)** · **[docs/SHORTCUTS.md](docs/SHORTCUTS.md)** |
| **Webhooks (Shortcuts, Home Assistant)** | **[docs/WEBHOOKS.md](docs/WEBHOOKS.md)** |
| **How the server is built** | **[docs/BACKEND.md](docs/BACKEND.md)** |
| **TLS / reverse proxy / ops notes** | **[docs/OPS.md](docs/OPS.md)** |
| **Backups (local + Google Drive)** | **[docs/SETUP.md §20–20.2](docs/SETUP.md#20-backing-up-sqlite-homebotdb)** |

**Short path (tools already installed):**

1. Copy **[`.env.example`](.env.example)** → **`.env`** and **[`webui/.env.example`](webui/.env.example)** → **`webui/.env`**.
2. Set at least **`DISCORD_TOKEN`**, **`DISCORD_GUILD_ID`**, **`HOMEBOT_API_ENABLED=true`**, **`HOMEBOT_API_TOKEN`**, **`HOMEBOT_WEB_JWT_SECRET`** (≥ 32 UTF-8 bytes).
3. From the repo root: **`dotnet run`**. In another terminal: **`cd webui && npm install && npm run dev`**.

The .NET process **does not load `.env` by itself** — use your editor’s **`envFile`**, **[`scripts/run-homebot.ps1`](scripts/run-homebot.ps1)** (Windows), **`systemd` `EnvironmentFile=`** (Linux), or export variables in the shell. Details: [docs/SETUP.md — Environment files](docs/SETUP.md#5-environment-files-env-and-webuienv).

**GitHub Pages (static Web UI):** **[`.github/workflows/pages-webui.yml`](.github/workflows/pages-webui.yml)** — enable **Pages → GitHub Actions**, set repository variables **`HOMEBOT_API_PUBLIC_URL`** and optionally **`HOMEBOT_WEBUI_BASE_PATH`**. Full checklist: [docs/SETUP.md — Section 13](docs/SETUP.md#13-optional--github-pages-static-web-ui).

---

## What it does

| Area | Discord | Web UI |
|------|---------|--------|
| **Buy** | Add, list, complete, delete, edit; tag filters; button lists | Forms, pagination, tag catalog, **bulk complete/delete**, stale-age hints, **undo** |
| **Wishlist** | Add, list, view, edit, complete, delete | Owner filter, tags, **Add to buy**, **bulk** actions, **undo** |
| **Money** | Split expenses, payments, summary, list, edit, delete | Ledger, split expense, record payment, pairwise balance, edit, **undo** |
| **Budget** | `/budget-add`, `/budget-summary`, `/budget-list`, `/budget-digest` | Categories, transactions (**receipt URL**), envelopes, accounts, bills, goals, trends, CSV, alerts badge, **undo** |
| **Calendar** | Add, list, view, today/upcoming, per-instance omit/complete/edit | Month/week/day/agenda, tasks, **Google sync**, import/export **.ics**, **undo** |
| **Meals** | `/meal-plan`, `/meal-dinner`, `/meal-add-recipe` | Recipes, weekly plan, add ingredients to buy, optional calendar blocks |
| **Dashboard** | `/dashboard` — snapshots across features | **Home** — meals tonight, stale buy, backup warning, budget alerts, Google sync |
| **Search** | — | Header search with deep links; press **`/`** to focus |
| **Undo** | `/undo` — your last logged action | **Undo last action** on Buy, Wishlist, Money, Calendar, Budget |
| **Config** | `/config-set`, `/config-view`, `/timezone-set`, `/setup-set` | Settings: API, **dark/light theme**, push, notification prefs, household config, audit |

After many API writes, the bot can post a short line to the Discord channel bound for that feature (`/setup-set`), when Discord is enabled.

**Budget background jobs:** debounced alerts (envelope overage, large expenses, upcoming bills) and a **weekly digest** to the **budget** channel — schedule via **`HOMEBOT_BUDGET_DIGEST_DAY`** and **`HOMEBOT_BUDGET_DIGEST_UTC_HOUR`**.

Slash command reference and API surface: **[docs/FEATURES.md](docs/FEATURES.md)**.

---

## How you use it

### Discord

Bind channels with **`/setup-set`**: **`buy`**, **`wishlist`**, **`money`**, **`budget`**, **`calendar`**, and optional **`audit`** (web sign-in log).

- **`/help`** with a **topic** (`general`, `web`, `setup`, `config`, `calendar`, `budget`, `money`, `wishlist`, `buy`) lists commands.
- **`/undo`** reverts your last change.
- **`/webui-verify`** completes browser signup with a code from the Web UI setup page.

Most feature commands only work in the channel you bound for that feature.

### Web UI

Routes: **Home**, **Buy**, **Wishlist**, **Money**, **Budget**, **Calendar**, **Meals**, **Settings**, **Sign in**, **Diagnostics** (`/health`).

1. Start the API (`HOMEBOT_API_ENABLED=true`) and set **`HOMEBOT_WEB_JWT_SECRET`** for password login.
2. **`cd webui && npm install && npm run dev`** (see **[`webui/.env.example`](webui/.env.example)**).
3. Sign in with password and/or **Continue with Discord** (when OAuth env is configured), or paste **`HOMEBOT_API_TOKEN`** in Settings.
4. Set **`actorUserId`** (your Discord user id) for complete, delete, undo, and roster-aware flows.

Sessions use a short-lived **access JWT** plus a server-stored **refresh token**; **Sign out** revokes the refresh row. The header shows API reachability and a **budget alert badge**. Keyboard shortcuts: **`/`** search, **`?`** help — **[docs/FEATURES.md](docs/FEATURES.md)**. **iPhone PWA:** **[docs/MOBILE.md](docs/MOBILE.md)**.

### HTTP API (scripts or other clients)

| Endpoint | Auth |
|----------|------|
| `GET /api/health`, `GET /api/meta` | None |
| `GET /openapi/v1.json` | None (OpenAPI) |
| Everything else under `/api/*` | `Authorization: Bearer` — **`HOMEBOT_API_TOKEN`** and/or JWT from `POST /api/auth/login` |

Mutations that record who acted use query **`actorUserId`** (Discord snowflake, non-zero). Examples are in **`GET /api/meta`**.

---

## Configuration

Environment variables are read from the **process** only (shell, systemd, Docker, IDE). Copy **[`.env.example`](.env.example)** and load it before **`dotnet run`**.

### Mode

| Variable | Purpose |
|----------|---------|
| **`HOMEBOT_DISCORD_ENABLED`** | `false` = API-only (no Discord client). |
| **`HOMEBOT_API_ENABLED`** | `true` = listen for HTTP (default **`http://0.0.0.0:5050`** unless **`HOMEBOT_API_URL`** is set). |

### Discord (when enabled)

| Variable | Required |
|----------|----------|
| **`DISCORD_TOKEN`** | Bot token. |
| **`DISCORD_GUILD_ID`** | Guild id for slash command registration. |

### HTTP API

| Variable | Purpose |
|----------|---------|
| **`HOMEBOT_API_URL`** | Listen URL. |
| **`HOMEBOT_API_TOKEN`** | Shared bearer for scripts (optional if you only use web JWTs). |
| **`HOMEBOT_ALLOWED_ORIGINS`** | CORS origins (comma-separated). Default dev: `http://localhost:5173`. The OAuth SPA origin from **`HOMEBOT_WEB_OAUTH_FRONTEND_URL`** is merged automatically when missing. |
| **`HOMEBOT_DATABASE_PATH`** | SQLite file or `Data Source=…` connection string. |
| **`HOMEBOT_API_MAX_BODY_BYTES`** | Max JSON body size (default 64 KiB). |
| **`HOMEBOT_API_MUTATION_PERMIT_LIMIT`** | Mutation requests per IP per minute (default **200**). |

### Web logins (JWT)

| Variable | Purpose |
|----------|---------|
| **`HOMEBOT_WEB_JWT_SECRET`** | **≥ 32 UTF-8 bytes** — required for web sign-in; server-only. |
| **`HOMEBOT_WEB_SETUP_TOKEN`** | Optional gate for first-user bootstrap on the web. |
| **`HOMEBOT_WEB_INVITE_TOKEN`** | Optional gate for additional-user registration. |
| **`HOMEBOT_WEB_JWT_ACCESS_TTL_SECONDS`** | Access JWT lifetime (default **900** s). |
| **`HOMEBOT_WEB_REFRESH_TTL_SECONDS`** | Refresh token lifetime (default **30** days). |

### Discord OAuth (optional)

Sign-in only when a **`WebUsers`** row already exists with matching **`DiscordUserId`** (no OAuth-only account creation).

| Variable | Purpose |
|----------|---------|
| **`HOMEBOT_DISCORD_OAUTH_CLIENT_ID`** | OAuth2 client id. |
| **`HOMEBOT_DISCORD_OAUTH_CLIENT_SECRET`** | OAuth2 client secret. |
| **`HOMEBOT_DISCORD_OAUTH_REDIRECT_URI`** | Must match the Discord app exactly — e.g. `http://localhost:5050/api/auth/discord/oauth/callback` (API host, not Vite). |
| **`HOMEBOT_WEB_OAUTH_FRONTEND_URL`** | SPA origin after redirect (default `http://localhost:5173`). |

Also requires **`HOMEBOT_WEB_JWT_SECRET`**. In non-Development, a partial OAuth triple fails startup unless **`HOMEBOT_ALLOW_PARTIAL_OAUTH_ENV=true`**.

### Auth rate limits (per IP, per minute)

| Variable | Default | Routes |
|----------|---------|--------|
| **`HOMEBOT_API_AUTH_LOGIN_PER_MINUTE`** | 30 | `POST /api/auth/login` |
| **`HOMEBOT_API_AUTH_REFRESH_PER_MINUTE`** | 36 | `POST /api/auth/refresh`, `POST /api/auth/logout` |
| **`HOMEBOT_API_OAUTH_CONSUME_PER_MINUTE`** | 15 | OAuth consume |
| **`HOMEBOT_API_OAUTH_BROWSER_PER_MINUTE`** | 48 | OAuth authorize + callback |
| **`HOMEBOT_API_AUTH_ACCOUNT_WRITE_PER_MINUTE`** | 24 | Bootstrap / register / Discord verify |
| **`HOMEBOT_API_DISCORD_STATUS_POLL_PER_MINUTE`** | 120 | Setup page status polling |

### Web UI (build time)

| Variable | Purpose |
|----------|---------|
| **`VITE_API_BASE_URL`** | API origin for `fetch` (default `http://localhost:5050`). |
| **`VITE_BASE_PATH`** | SPA base path (e.g. `/HomeBot/` on GitHub Pages). |

See **[`webui/.env.example`](webui/.env.example)**.

### Budget (optional)

| Variable | Purpose |
|----------|---------|
| **`HOMEBOT_BUDGET_LARGE_EXPENSE_USD`** | Large-expense alert threshold (default **500**). |
| **`HOMEBOT_BUDGET_DIGEST_DAY`** | Digest weekday (name or **0–6**, Sunday = 0). Default **Sunday**. |
| **`HOMEBOT_BUDGET_DIGEST_UTC_HOUR`** | Digest hour UTC (**0–23**). Default **17**. |

### Backups — Google Drive via rclone (optional)

Requires **[rclone](https://rclone.org/)** on the host that runs backups. Scripts: **`scripts/backup-homebot-with-gdrive.sh`**, **`scripts/sync-homebot-backups-to-gdrive.sh`**, **`scripts/systemd/homebot-backup-with-gdrive.*.example`**. Full steps: **[docs/SETUP.md §20.2](docs/SETUP.md#202-off-site-backup-to-google-drive-optional)**.

| Variable | Default | Purpose |
|----------|---------|---------|
| **`HOMEBOT_GDRIVE_BACKUP_ENABLED`** | off | **`true`** to upload and prune. |
| **`HOMEBOT_GDRIVE_RCLONE_REMOTE`** | — | rclone remote name (e.g. **`gdrive`**). |
| **`HOMEBOT_GDRIVE_BACKUP_PATH`** | `HomeBot/backups` | Folder on Google Drive. |
| **`HOMEBOT_GDRIVE_RETENTION_DAYS`** | **90** | Delete remote **`homebot.db.*`** older than this (**0** = no remote prune). |
| **`HOMEBOT_LOCAL_BACKUP_RETENTION_DAYS`** | **30** | Delete local backup files older than this (**0** = keep all). |
| **`HOMEBOT_BACKUP_DIR`** | `/opt/homebot/backups` | Local backup directory (Linux layout). |
| **`HOMEBOT_GDRIVE_BACKUP_DRY_RUN`** | off | **`true`** = log only, no upload/delete. |
| **`HOMEBOT_GDRIVE_BACKUP_ENCRYPT`** | off | **`true`** = **`gpg`**-encrypt uploads (`.gpg` on Drive). |
| **`HOMEBOT_GDRIVE_BACKUP_ENCRYPT_PASSPHRASE_FILE`** | — | Passphrase file for encryption (see **`.env.example`**). |

### Webhooks, Google Calendar, push (optional)

| Variable | Purpose |
|----------|---------|
| **`HOMEBOT_WEBHOOK_SECRET`** | Secret for `POST /api/hooks/*` — see **[docs/WEBHOOKS.md](docs/WEBHOOKS.md)**. |
| **`HOMEBOT_GOOGLE_OAUTH_*`**, **`HOMEBOT_GOOGLE_CALENDAR_SYNC_MINUTES`**, **`HOMEBOT_GOOGLE_SYNC_CONFLICT`** | Google Calendar two-way sync (Calendar page → Connect Google). |
| **`HOMEBOT_VAPID_PUBLIC_KEY`**, **`HOMEBOT_VAPID_PRIVATE_KEY`**, **`HOMEBOT_VAPID_SUBJECT`** | Web Push for installed PWA — generate with `npx web-push generate-vapid-keys`. |
| **`HOMEBOT_BUDGET_DIGEST_TO_CHANNEL`**, **`HOMEBOT_BUDGET_ALERTS_TO_CHANNEL`** | Also post digest/alerts to Discord channel when prefs allow. |
| **`HOMEBOT_CALENDAR_REMINDER_DM`**, **`HOMEBOT_BUY_RECURRING_POLL_MINUTES`**, **`HOMEBOT_REMINDER_POLL_SECONDS`** | Calendar DMs, recurring buy worker, reminder poll interval. |
| **`HOMEBOT_WEB_ADMIN_DISCORD_IDS`** | Extra Discord ids with web admin APIs. |

### Minimal `.env` example

```text
DISCORD_TOKEN=...
DISCORD_GUILD_ID=...
HOMEBOT_API_ENABLED=true
HOMEBOT_API_TOKEN=long-random-shared-secret
HOMEBOT_WEB_JWT_SECRET=another-long-random-secret-at-least-32-bytes
```

---

## Build, test, and run

Stack: **.NET 10** (`net10.0`), **SQLite**, **Vite + React** for the Web UI.

### Run

```bash
# Repo root — Discord + API (when enabled in env)
dotnet run

# Web UI (separate terminal)
cd webui && npm install && npm run dev
```

### Test

```bash
dotnet test HomeBot.Tests/HomeBot.Tests.csproj
cd webui && npm run test
```

| Suite | What it covers |
|-------|----------------|
| **`HomeBotSystemsIntegrationTests`** | Full household workflow over real HTTP + SQLite (buy → wishlist → money → budget → calendar → undo) |
| Other `HomeBot.Tests/*` | Per-feature API, auth, calendar, budget, meals, Google sync, push, polish (bulk/stale/receipt), rate limits, etc. |
| **`webui` Vitest** | API client contracts, route smoke tests, validation helpers |

**OpenAPI types (optional):** with the API running, `cd webui && npm run openapi:types` → `webui/src/generated/openapi.d.ts`.

xUnit parallelization is **disabled** ([`HomeBot.Tests/AssemblyInfo.cs`](HomeBot.Tests/AssemblyInfo.cs)) because some fixtures set process-global **`HOMEBOT_WEB_JWT_SECRET`**.

Stop a running `HomeBot` process if the build cannot overwrite `HomeBot.dll`.

### CI

**[`.github/workflows/ci.yml`](.github/workflows/ci.yml)** on push/PR to **`main`**: .NET restore, Release build, **`dotnet test`**; **`npm ci`**, **`npm run lint`**, **`npm run test`**, **`npm run build`** for the Web UI (Node **22**).

Optional **[`.github/workflows/deploy-vm.yml`](.github/workflows/deploy-vm.yml)** deploys **`main`** to a self-hosted VM after tests (see **[docs/OPS.md](docs/OPS.md)**).

### Production Web UI build

```bash
cd webui && npm run build
```

Output: **`webui/dist`**. Set **`VITE_API_BASE_URL`** at build time when the API is not on `http://localhost:5050`.

---

## Troubleshooting

| Symptom | What to check |
|---------|----------------|
| **`http://localhost:5050/` is 404** | Normal — use **`/api/health`**, **`/api/meta`**, or **`/openapi/v1.json`**. |
| **Web UI cannot reach API** | Settings → API URL; API running; **`HOMEBOT_ALLOWED_ORIGINS`** includes the UI origin. |
| **Token not accepted** | Bearer matches **`HOMEBOT_API_TOKEN`** or a valid login JWT; if both secrets are unset, protected routes return **503**. |
| **Discord OAuth fails** | Redirect URI matches the Discord portal exactly; **`HOMEBOT_WEB_JWT_SECRET`** set; user already exists in **`WebUsers`**. |
| **Blank dev page / module errors** | `cd webui && npm install` (use lockfile); Recharts 2.x is pinned for toolchain stability. |

---

## Data and safety

- **SQLite** stores feature data, settings, channel bindings, undo log, **`WebUsers`**, verify sessions, and refresh tokens. **Backup:** stop → copy **`homebot.db`** (+ WAL/SHM if present); optional weekly **`systemd`** timer; optional **Google Drive** upload with **rclone** and automatic retention on Drive and on disk — [docs/SETUP.md §20–20.2](docs/SETUP.md#20-backing-up-sqlite-homebotdb).
- **Discord snowflakes** are JSON **strings** in API bodies and many responses so JavaScript does not lose precision.
- **Secrets** stay on the server. The browser keeps JWT, optional API token, and refresh token in **localStorage**; use **Sign out** to revoke refresh on the server.

Schema changes are **additive migrations** on startup — never delete `homebot.db` in app code. See **[docs/OPS.md](docs/OPS.md)** for upgrade notes.

---

## License

**MIT License** (copyright **Matthew Tran**) — see **[LICENSE](LICENSE)**.

HomeBot targets a **single household**; you may customize deployment and ops for your own servers ([docs/SETUP.md](docs/SETUP.md), [docs/UBUNTU_DEPLOY.md](docs/UBUNTU_DEPLOY.md)).
