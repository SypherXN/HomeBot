# HomeBot — features and capabilities

HomeBot is a **single-household** assistant: one **SQLite** database shared by **Discord** (slash commands and buttons) and an optional **HTTP API** with a **React Web UI**. This document describes what the product can do today. For installation, environment variables, and deployment, see **[SETUP.md](SETUP.md)** (step-by-step) and **[README.md](../README.md)** (quick reference).

---

## How the pieces fit together

| Surface | Role |
|---------|------|
| **Discord bot** | Slash commands and interactive lists in channels you bind with `/setup-set`. |
| **HTTP API** | REST-style endpoints under `/api/…` for the Web UI, scripts, and automation. |
| **Web UI** | Browser app (Vite + React) for full-feature editing, calendar views, and budget planning. |

You can run **Discord only**, **API only**, or **both** in one process (`HOMEBOT_DISCORD_ENABLED`, `HOMEBOT_API_ENABLED`).

**Auth (API / Web UI):**

- Shared bearer token (`HOMEBOT_API_TOKEN`) and/or **JWT** from web login (`HOMEBOT_WEB_JWT_SECRET`).
- Optional **Discord OAuth** (“Continue with Discord”) when configured — signs in only if a `WebUsers` row already exists with a matching Discord user id.
- New web accounts: password bootstrap/invite flows and/or **Discord verify** (`/webui-verify` in your server).
- Mutations that need “who did this” use query parameter **`actorUserId`** (Discord snowflake as digits).

**Undo:** One stack **per Discord user** (`actorUserId`). `/undo` on Discord; **Undo last action** on Buy, Wishlist, Money, Calendar, and Budget pages in the Web UI.

**Discord notifications:** After many API writes (and some bot actions), a short line can post to the channel bound for that feature — if Discord is enabled and `/setup-set` bindings exist.

---

## Channel setup and household config

### `/setup-set` and `/setup-view`

Bind each feature to a text channel. Feature commands only work in the bound channel (except setup, config, help, undo scope, and webui-verify).

| Feature key | Used for |
|-------------|----------|
| `buy` | Shopping list commands and API notify |
| `wishlist` | Wishlist commands and API notify |
| `money` | Shared money commands and API notify |
| `budget` | Budget slash commands, alerts, weekly digest |
| `calendar` | Calendar commands and API notify |
| `audit` | (Optional) Web sign-in audit lines (password + OAuth) |

### Config and timezone

| Command | Purpose |
|---------|---------|
| `/config-set` / `/config-view` | Household settings (e.g. `page_size`, `timezone`) |
| `/timezone-set` | Interactive household default calendar zone (IANA preferred) |
| `/timezone-list` | Common timezone ids |

### Help and dashboard

| Command | Purpose |
|---------|---------|
| `/help` | Topic-based help (`general`, `web`, `setup`, `config`, `calendar`, `budget`, `money`, `wishlist`, `buy`) |
| `/dashboard` | Snapshot: calendar today/upcoming, buy/wishlist highlights, budget summary |
| `/webui-verify` | Complete browser signup with a code from the Web UI setup page |

---

## Buy list

Shared shopping-style checklist with assignees and optional tags.

### Discord

`/buy-add`, `/buy-list` (filters + pagination + buttons), `/buy-complete`, `/buy-delete`, `/buy-edit`, `/buy-clear-completed`

### Web UI (`/buy`)

- Add items with assignee (Discord roster when available)
- Tag catalog editor; filter and sort lists
- Complete, remove, clear completed
- Pagination and **undo**

### API (high level)

`GET/POST` items, tag catalog `GET/PUT`, pagination, mutations with `actorUserId`.

---

## Wishlist

Gift / want list with owners, links, priority, notes, and tags.

### Discord

`/wishlist-add`, `/wishlist-list`, `/wishlist-view`, `/wishlist-edit`, `/wishlist-complete`, `/wishlist-delete`, `/wishlist-clear-completed`

### Web UI (`/wishlist`)

- Owner filter (everyone vs member)
- Tag catalog (same pattern as buy)
- Add, complete, remove, clear completed, pagination, **undo**

### API

`GET/POST` items, `GET` owners for filters, tag catalog, standard CRUD with `actorUserId`.

---

## Money (shared expenses)

**Splitwise-style** ledger between household members — who paid, who owes, payments, and running balances. This is separate from the **Budget** module (envelopes / accounts / bills).

### Discord

`/money-add` (split expense), `/money-pay`, `/money-summary`, `/money-list`, `/money-edit`, `/money-delete`

- Amounts can use simple math (e.g. `20+5`)
- Percentage-style splits where applicable

### Web UI (`/money`)

- Transaction table with roster-friendly names
- **Split expense** (including single 100% share as a one-off expense)
- **Record payment**
- Pairwise **balance** from summary
- Edit transactions (name, amount, description, notes)
- Pagination and **undo**

### API

Split and payment endpoints, paged transaction list, summary/balance, `PATCH` transaction fields.

---

## Budget (household finance)

Full planning and tracking: categories, transactions, envelopes, accounts, bills, goals, recurring rules, multi-currency, tax-oriented summaries, and trends. Categories are typically created in the Web UI first; Discord is optimized for quick logging.

### Discord

| Command | Purpose |
|---------|---------|
| `/budget-add` | Log expense or income (category must exist) |
| `/budget-summary` | Current month income, expenses, net |
| `/budget-list` | Summary + envelope warnings + upcoming bills |
| `/budget-digest` | Post digest to the **budget** channel |

**Background behavior (when Discord + budget channel are configured):**

- Debounced **alerts** (e.g. envelope overage, large expense, upcoming bills) to the budget channel
- **Weekly digest** on a configurable UTC schedule (`HOMEBOT_BUDGET_DIGEST_DAY`, `HOMEBOT_BUDGET_DIGEST_UTC_HOUR`)
- Due **recurring** budget rules processed on a timer

### Web UI (`/budget`)

| Area | Capabilities |
|------|----------------|
| **Transactions** | Add/edit/delete; filters (merchant, note, amount, tags); category, spender, account, splits, tags, pending/cleared |
| **Categories** | Create, edit, delete; visibility (household / personal) |
| **Envelopes** | Monthly targets per category; copy previous month → current month |
| **Accounts** | Checking, savings, credit, etc.; balances; **archive/restore** inactive accounts |
| **Bills** | Due dates, estimates, pay bill, link **calendar reminder** |
| **Recurring** | Scheduled rules that create transactions when due |
| **Goals** | Savings / target tracking |
| **Income plan** | Planned income per month |
| **Trends & forecast** | Charts and category forecast |
| **Tax summary** | Category-grouped view for tax prep |
| **CSV** | Import and export |
| **Exchange rates** | Non-USD amounts with rates to home currency |
| **Audit log** | Who changed what (API reads) |
| **Alerts panel** | Pending notifications; nav **badge** for alert count |
| **Undo** | Revert last budget-related action for your `actorUserId` |

### API (representative)

- `GET` categories, accounts (`?includeInactive=true`), tags, transactions (paged + filters), summaries, envelopes, goals, bills, recurring, trends, forecast, tax-summary, notifications, exchange-rates, audit, `export.csv`
- `POST/PATCH/DELETE` for transactions, categories, goals, bills, recurring, accounts, transfers, bill pay, calendar reminder on bill, CSV import
- `PUT` envelopes, income-plan, exchange-rates

---

## Calendar

Events and tasks with reminders, recurrence, per-occurrence overrides, and time zones. Discord, API, reminders, and Web UI share the same expansion rules for recurring series.

### Discord

**Series / rows:** `/calendar-add`, `/calendar-list`, `/calendar-view`, `/calendar-edit`, `/calendar-complete`, `/calendar-delete`

**Windows:** `/calendar-today`, `/calendar-upcoming` (expanded recurrence + tasks, aligned with API)

**One occurrence** (canonical `instanceStartUtc`, same as API/Web):

- `/calendar-instance-omit` — hide this day
- `/calendar-instance-complete` — complete this day only
- `/calendar-instance-reset` — clear overrides (same as Web “Reset this day”)
- `/calendar-instance-edit` — override title, description, notes, link, times

Natural-language dates on add (e.g. “tomorrow 6pm”, “next monday”). Optional reminder (`10m`, `2h`, `1d`) and recurrence (`daily`, `weekly`, `monthly`).

### Web UI (`/calendar`)

- **Month / week / day / agenda** views driven by `GET /api/calendar/range` (max 92-day window)
- **Viewer time zone** (Settings + in-page) for interpreting the grid
- Filter: everyone / me / specific member
- **Tasks** side panel
- Add **event** or **task**; per-event time zone on create/edit
- Occurrence detail: complete series, complete this day, omit, edit this day, optional end override, **reset this day**
- **Export .ics** for the current view range
- **Undo**

### API (representative)

- `GET` list, range, today, upcoming, item by id (`?instanceStartUtc=` for merged occurrence detail)
- `POST` create; `PATCH` item or instance; `POST` complete / omit-instance / complete-instance; `DELETE` item or instance
- `GET /api/calendar/export.ics?from=&to=&timeZone=` — download iCalendar for range

### Reminders

Background service posts reminder text to the bound **calendar** channel when due, respecting omit/complete overrides on recurring instances.

---

## Web UI routes

| Path | Page |
|------|------|
| `/` | Dashboard — snapshots of buy, wishlist, money, calendar, budget when signed in |
| `/buy`, `/wishlist`, `/money`, `/budget`, `/calendar` | Feature pages above |
| `/settings` | API URL, token/JWT session, `actorUserId`, calendar viewer zone |
| `/login`, `/setup` | Sign in and household onboarding |
| `/oauth/callback` | Discord OAuth return (no shell chrome) |
| `/health` | API health + meta JSON (diagnostics) |

Shell nav also shows **API connection status** and a **budget alert badge** when notifications are pending.

---

## HTTP API essentials

| Endpoint | Auth |
|----------|------|
| `GET /api/health`, `GET /api/meta` | None |
| `GET /openapi/v1.json` | None (OpenAPI document) |
| Everything else under `/api/*` | `Authorization: Bearer` (API token or JWT) |
| `POST /api/auth/login`, refresh, logout, Discord OAuth, verify flows | Public auth routes (rate-limited) |

**Rate limits:** Separate per-IP limits for login, refresh, OAuth, account creation, and general mutations (see README).

**CORS:** `HOMEBOT_ALLOWED_ORIGINS` plus automatic merge of OAuth SPA origin from `HOMEBOT_WEB_OAUTH_FRONTEND_URL`.

---

## Data backup (operational, not in-app)

HomeBot does **not** expose a “backup” button in the Web UI. Operators use shell scripts:

| Capability | How |
|------------|-----|
| **Local snapshot** | Stop service → copy **`homebot.db`** (+ **`-wal`** / **`-shm`** if present) → start service ([SETUP.md §20.1](SETUP.md#201-automated-backups-optional)). |
| **Scheduled local backup** | Linux **`systemd`** timer + **`scripts/backup-homebot-sqlite.sh`**. |
| **Google Drive off-site** | **`rclone`** upload of **`homebot.db.*`** files; prune by age on Drive and locally ([SETUP.md §20.2](SETUP.md#202-off-site-backup-to-google-drive-optional)). |
| **Restore** | Stop HomeBot → replace live DB from a dated copy → start ([SETUP.md §20.1.5](SETUP.md#2015-restore-from-a-backup-short-procedure)). |

Env vars: **`HOMEBOT_GDRIVE_*`**, **`HOMEBOT_BACKUP_DIR`**, **`HOMEBOT_LOCAL_BACKUP_RETENTION_DAYS`** — see **`.env.example`** and [SETUP.md §19](SETUP.md#off-site-backup-google-drive-via-rclone).

---

## Operational docs in this folder

| Document | Purpose |
|----------|----------|
| **[FEATURES.md](./FEATURES.md)** (this file) | Product capabilities |
| **[BACKEND.md](./BACKEND.md)** | How the server implements these features (services, API, database, workers) |
| **[UBUNTU_DEPLOY.md](./UBUNTU_DEPLOY.md)** | Short Ubuntu install/update path |
| **[OPS.md](./OPS.md)** | Reverse proxy, TLS, Pages deploy, SQLite upgrades, backup pointers |

---

## Explicit non-goals (current design)

- **Multi-tenant / SSO** — one household, one database.
- **OAuth-only account creation** — Discord OAuth only links to an existing `WebUsers` row.
- **Non-split money in Web UI** — use a 100% split expense instead of a separate “simple expense” form.
