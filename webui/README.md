# HomeBot Web UI

React + TypeScript + Vite SPA for the HomeBot household API. Talks to the .NET backend over HTTP (`/api/*`).

**Household setup:** [docs/SETUP.md](../docs/SETUP.md) · **Features:** [docs/FEATURES.md](../docs/FEATURES.md) · **iPhone PWA:** [docs/MOBILE.md](../docs/MOBILE.md)

---

## Development

1. Copy **[`.env.example`](.env.example)** → **`.env`**.
2. Set **`VITE_API_BASE_URL`** (default `http://localhost:5050`) — must match where the API listens.
3. Start the API from the repo root (`dotnet run` with `.env` loaded).
4. Install and run:

```bash
npm install
npm run dev
```

Open **http://localhost:5173**. Sign in at **`/login`** (password and/or Discord OAuth when configured).

**LAN / phone testing:** `npm run dev -- --host 0.0.0.0` and add your PC IP to **`HOMEBOT_ALLOWED_ORIGINS`** on the server.

---

## Scripts

| Command | Purpose |
|---------|---------|
| **`npm run dev`** | Vite dev server with HMR |
| **`npm run build`** | Production bundle → **`dist/`** (PWA service worker included) |
| **`npm run preview`** | Serve **`dist/`** locally |
| **`npm run lint`** | ESLint |
| **`npm run test`** | Vitest |
| **`npm run openapi:types`** | Generate **`src/generated/openapi.d.ts`** from running API (`GET /openapi/v1.json`) |

---

## Routes

| Path | Page |
|------|------|
| **`/`** | Dashboard (stale buy, meals tonight, budget alerts, backup warning) |
| **`/buy`**, **`/wishlist`**, **`/money`**, **`/budget`**, **`/calendar`**, **`/meals`** | Feature pages |
| **`/settings`** | API URL, auth, theme, push, notification prefs, household config |
| **`/login`**, **`/setup`** | Sign in and first-user setup |
| **`/health`** | Admin diagnostics (ops health + metrics) |

---

## Auth and settings

- **JWT session:** access token in memory + refresh cookie; **Sign out** revokes refresh on the server.
- **API token:** paste **`HOMEBOT_API_TOKEN`** in Settings for script-style bearer auth.
- **`actorUserId`:** your Discord user id — required for complete/delete/undo and roster-aware UI.

Build-time only: **`VITE_API_BASE_URL`**, **`VITE_BASE_PATH`** (GitHub Pages subpath).

---

## UX notes

- **Theme:** dark/light via **Settings → Appearance** or sidebar toggle (`ThemeProvider`, persisted in `localStorage`).
- **Keyboard:** **`/`** search, **`?`** help, **`g`+nav keys**, **`n`** new item on Buy/Wishlist — see [FEATURES.md](../docs/FEATURES.md).
- **Bulk actions:** checkbox selection on Buy and Wishlist pages.
- **PWA:** production build registers **`public/sw.js`**; install from Safari on iPhone per [MOBILE.md](../docs/MOBILE.md).

---

## Production deploy

- **GitHub Pages:** workflow **[`.github/workflows/pages-webui.yml`](../.github/workflows/pages-webui.yml)** — set repo variable **`HOMEBOT_API_PUBLIC_URL`**.
- **Static host:** `npm run build` and serve **`dist/`**; API must allow your origin in **`HOMEBOT_ALLOWED_ORIGINS`**.
