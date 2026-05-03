# HomeBot

HomeBot is a **single-household** assistant that combines a **Discord bot** and an optional **HTTP API** with a **React Web UI**. It helps your family track shopping lists, a wishlist, shared money (expenses and payments), calendar tasks and events, and includes an **undo** stack for recent changes.

Everything shares one **SQLite** database (`homebot.db` by default), so Discord, the API, and the Web UI always see the same data.

---

## What it does

| Area | Discord | Web UI |
|------|---------|--------|
| **Buy** | Add, list, complete, delete items; tag filters; channel-bound list UI | Same features with forms, pagination, tag catalog editor |
| **Wishlist** | Add, list, complete, delete; owners and tags | Same + owner filter |
| **Money** | Split-style expenses, payments, summaries | Ledger table, balance between two people, record payment / split expense |
| **Calendar** | Add and list items | Month / week / day / agenda views, tasks panel, time zones, recurring-instance display |
| **Undo** | `/undo` reverts the last logged action for **you** | Undo on each feature page (one global stack per `actorUserId`, not per page) |
| **Config** | `/config-set`, `/config-view`, timezone commands, `/setup-set` to bind features to channels | Settings: API URL, token, calendar viewer zone, `actorUserId` |

Optional: after API writes (new item, etc.), the bot can **post a short notice** in the Discord channel bound for that feature—if Discord is enabled and channels are configured.

---

## How you are expected to use it

### 1. One process, two halves

- **Discord half** — Slash commands and button UIs in the channels you bind with `/setup-set`. Most commands only work in the channel assigned to that feature (see `/help topic:setup`).
- **Web half** — Open the Web UI in a browser, point it at your API URL, sign in (or paste the shared API token), and set **`actorUserId`** to your Discord user id for actions that require it (complete, delete, undo, etc.).

You can run **Discord only**, **API only**, or **both** in the same process (see environment variables below).

### 2. Discord usage (typical flow)

1. Create a Discord application and bot, invite it to your server with **applications.commands** and message/intent access as needed.
2. Set **`DISCORD_TOKEN`** and **`DISCORD_GUILD_ID`** (guild slash commands register to this guild).
3. Start HomeBot with Discord enabled (default). Use **`/setup-set`** to bind `buy`, `wishlist`, `money`, and `calendar` to the right text channels.
4. Use **`/help`** (and topics like **`/help topic:buy`**) for command lists. Use **`/undo`** in a channel where undo is allowed to revert your last change.

**Web sign-up from Discord:** If someone creates an account in the browser using **Discord verify**, they run **`/webui-verify`** in **your** server and paste the code from the setup page. That ties their Discord id to the login without typing snowflakes on the web.

### 3. Web UI usage (typical flow)

1. Start the API (`HOMEBOT_API_ENABLED=true`) and set **`HOMEBOT_WEB_JWT_SECRET`** (at least **32 UTF-8 bytes**) if you use web logins.
2. From the `webui` folder: `npm install` then `npm run dev` (default API base `http://localhost:5050`, overridable with **`VITE_API_BASE_URL`**).
3. **New account:** **New account** in the sidebar → prefer **Discord verify**, or manual bootstrap/invite if you are API-only.
4. **Sign in** — Stores a JWT and fills **`actorUserId`** from your profile when you use web login.
5. **Settings** — API base URL, bearer token (optional if you only use JWT), calendar **viewer** time zone, and `actorUserId` / roster picker when the bot is online and can list guild members.

The header shows **API reachability** and whether your token is accepted. The UI polls when the tab becomes visible again (helpful on phones).

### 4. API usage (scripts or other clients)

- **`GET /api/health`** and **`GET /api/meta`** — no auth.
- Everything else under **`/api/*`** needs **`Authorization: Bearer …`** with either **`HOMEBOT_API_TOKEN`** or a **JWT** from `POST /api/auth/login`.
- Mutations that need “who did this” use the query parameter **`actorUserId`** (Discord user id as digits). See `/api/meta` for examples.

OpenAPI: **`GET /openapi/v1.json`**.

---

## Configuration (environment variables)

Values are read from the process environment (shell, systemd, or IDE launch settings).

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
| **`HOMEBOT_API_TOKEN`** | Shared secret for `Authorization: Bearer` (optional if you rely only on JWTs from web login). |
| **`HOMEBOT_ALLOWED_ORIGINS`** | CORS for browsers; comma-separated. If unset, only `http://localhost:5173` is allowed (Vite default). |
| **`HOMEBOT_DATABASE_PATH`** | Optional — SQLite file or `Data Source=…` connection string. |

### Web logins (JWT)

| Variable | Purpose |
|----------|---------|
| **`HOMEBOT_WEB_JWT_SECRET`** | Required for web sign-in and user creation flows — **≥ 32 UTF-8 bytes**. Never put this in the frontend; it stays on the server. |
| **`HOMEBOT_WEB_SETUP_TOKEN`** | Optional — if set, manual **first-user** bootstrap on the web must include this token. |
| **`HOMEBOT_WEB_INVITE_TOKEN`** | Optional — if set, manual **additional-user** registration must include this invite. |

### Running locally (minimal example)

**Bot + API + Web UI on one machine:**

```text
DISCORD_TOKEN=...
DISCORD_GUILD_ID=...
HOMEBOT_API_ENABLED=true
HOMEBOT_API_TOKEN=long-random-shared-secret
HOMEBOT_WEB_JWT_SECRET=another-long-random-secret-at-least-32-bytes
```

Then run the .NET app from the repo root, and in another terminal run `npm run dev` inside **`webui`**.

---

## Build and run

### .NET (bot + API)

```bash
dotnet run
```

From the repository root. Uses **.NET 10** and **SQLite** via `Microsoft.Data.Sqlite`.

### Tests

```bash
dotnet test HomeBot.Tests/HomeBot.Tests.csproj
```

Stop any running `HomeBot` process first if the build cannot overwrite `HomeBot.dll`.

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

- **SQLite** holds items, settings, channel bindings, action log (undo), web users, and verification sessions.
- **Snowflakes:** Large Discord ids are handled as **strings** in JSON where it matters (money, calendar assignee, list API responses, buy/wishlist writes). Prefer roster picks or member labels when the UI offers them.
- **Secrets:** Do not commit tokens or `HOMEBOT_WEB_JWT_SECRET`. The Web UI stores the bearer/JWT only in **browser localStorage**.

---

## More documentation

- **`docs/Refined_WebUI_Adaptation_Plan.md`** — Architecture snapshot, routes, API notes, and Phase status.
- **`docs/`** — Older planning docs; the refined plan is the best match for the current app.

---

## License / project notes

This repository is a private household project; add a `LICENSE` file if you redistribute.
