# HomeBot setup guide

This guide walks through installing prerequisites, running the **.NET** process (Discord bot + optional API), running the **Web UI** locally, running **tests**, and publishing the Web UI to **GitHub Pages** with the API reachable from the browser.

For full environment variable reference, see **README.md** and **`.env.example`**. The .NET app reads the **process environment only**; it does **not** auto-load a `.env` file. Use your shell, IDE **envFile**, **systemd**, or **Docker** to inject variables.

---

## Prerequisites (all platforms)

| Requirement | Notes |
|-------------|--------|
| **.NET SDK 10** | Matches `HomeBot.csproj` (`net10.0`). Verify with `dotnet --version`. |
| **Node.js** | **20+** recommended for the Web UI (Vite 8). Verify with `node --version`. |
| **npm** | Ships with Node or install separately. |
| **Git** | To clone the repository. |

Optional for production-style hosting:

- A **public HTTPS URL** for the API (reverse proxy + TLS certificate).
- A **Discord application** (bot token, guild id, and optionally OAuth2 client id/secret for “Continue with Discord”).

---

## 1. Windows — install toolchain

### 1.1 .NET 10 SDK

1. Open **https://dotnet.microsoft.com/download**
2. Download and install the **.NET 10 SDK** for Windows (x64).
3. Open a **new** PowerShell window and run:

   ```powershell
   dotnet --version
   ```

   You should see a `10.x.x` SDK version.

### 1.2 Node.js (LTS)

1. Open **https://nodejs.org** and install the **LTS** Windows installer.
2. Open a **new** PowerShell window:

   ```powershell
   node --version
   npm --version
   ```

### 1.3 Clone and configure env

```powershell
cd $HOME\Desktop
git clone <your-fork-or-repo-url> HomeBot
cd HomeBot
```

1. Copy **`.env.example`** → **`.env`** in the repo root (`.env` is gitignored).
2. Copy **`webui/.env.example`** → **`webui/.env`** for Vite (optional for defaults).

Edit **`.env`** with at least:

- **`DISCORD_TOKEN`** / **`DISCORD_GUILD_ID`** if you run with Discord (default).
- **`HOMEBOT_API_ENABLED=true`** if you want the HTTP API (needed for the Web UI).
- **`HOMEBOT_API_TOKEN`** and/or **`HOMEBOT_WEB_JWT_SECRET`** (JWT secret **≥ 32 UTF-8 bytes**) so protected `/api` routes are not **503**. Web login requires **`HOMEBOT_WEB_JWT_SECRET`**.

PowerShell (current session) example before `dotnet run`:

```powershell
$env:DISCORD_TOKEN = "your-bot-token"
$env:DISCORD_GUILD_ID = "your-guild-id"
$env:HOMEBOT_API_ENABLED = "true"
$env:HOMEBOT_WEB_JWT_SECRET = "use-a-long-random-secret-at-least-32-chars"
$env:HOMEBOT_API_TOKEN = "optional-shared-bearer-for-scripts"
```

Or use **Cursor / VS Code** `launch.json` with `"envFile": "${workspaceFolder}/.env"`.

### 1.4 Run the bot + API

From the **repository root**:

```powershell
dotnet run
```

By default the API listens on **`http://0.0.0.0:5050`** (see **`HOMEBOT_API_URL`** in README). Discord slash commands register to **`DISCORD_GUILD_ID`**.

### 1.5 Run the Web UI (second terminal)

```powershell
cd webui
npm install
npm run dev
```

Open the URL Vite prints (usually **`http://localhost:5173`**). The UI calls **`VITE_API_BASE_URL`** (default **`http://localhost:5050`** in **`webui/.env.example`**).

### 1.6 Windows firewall (optional)

If other machines on your LAN need the API, allow inbound **TCP 5050** (or the port you set in **`HOMEBOT_API_URL`**) in Windows Defender Firewall.

---

## 2. Ubuntu (headless Linux) — install toolchain

These steps assume a minimal **Ubuntu 22.04 or 24.04** server (SSH only). Adjust package URLs for your Ubuntu version using Microsoft’s current docs: **https://learn.microsoft.com/dotnet/core/install/linux-ubuntu**

### 2.1 Base packages

```bash
sudo apt update
sudo apt install -y curl git ca-certificates
```

### 2.2 .NET 10 SDK (Microsoft package feed)

Example for Ubuntu 22.04 (replace the `.deb` URL with the one matching your release from the Microsoft doc above):

```bash
wget https://packages.microsoft.com/config/ubuntu/22.04/packages-microsoft-prod.deb -O /tmp/packages-microsoft-prod.deb
sudo dpkg -i /tmp/packages-microsoft-prod.deb
sudo apt update
sudo apt install -y dotnet-sdk-10.0
dotnet --version
```

### 2.3 Node.js 22.x (NodeSource — avoids very old distro `nodejs`)

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node --version
npm --version
```

### 2.4 Clone the repo

```bash
sudo adduser --disabled-password --gecos "" homebot
sudo mkdir -p /opt/homebot && sudo chown homebot:homebot /opt/homebot
sudo -u homebot -i
cd /opt/homebot
git clone <your-fork-or-repo-url> app
cd app
```

### 2.5 Environment file for systemd (recommended)

Create **`/opt/homebot/app/.env`** (mode `600`, owned by `homebot`) with the same variables as on Windows (see **`.env.example`**). systemd can load it with **`EnvironmentFile=`** (see below).

**Never** commit `.env`; it is gitignored.

### 2.6 Run once manually (smoke test)

```bash
cd /opt/homebot/app
set -a && source .env && set +a
dotnet run
```

Confirm logs show Discord connecting (if enabled) and **Kestrel** listening. Stop with **Ctrl+C**.

### 2.7 systemd unit (API + Discord, auto-restart)

Create **`/etc/systemd/system/homebot.service`** (run with `sudo`):

```ini
[Unit]
Description=HomeBot Discord + API
After=network-online.target
Wants=network-online.target

[Service]
User=homebot
Group=homebot
WorkingDirectory=/opt/homebot/app
EnvironmentFile=/opt/homebot/app/.env
ExecStart=/usr/bin/dotnet run --no-build
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Build once so **`--no-build`** is valid in production:

```bash
sudo -u homebot bash -c 'cd /opt/homebot/app && dotnet publish -c Release -o /opt/homebot/app/publish'
```

Then point **`ExecStart`** at the published DLL instead of `dotnet run`:

```ini
ExecStart=/usr/bin/dotnet /opt/homebot/app/publish/HomeBot.dll
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now homebot.service
sudo systemctl status homebot.service
journalctl -u homebot.service -f
```

### 2.8 Reverse proxy + TLS (typical production)

Expose **`https://api.yourdomain.com`** → Kestrel **`http://127.0.0.1:5050`** with **nginx** or **Caddy**, and obtain certificates (e.g. **Let’s Encrypt**). Set:

- **`HOMEBOT_API_URL`** if you need a different bind (e.g. `http://127.0.0.1:5050`).
- **`HOMEBOT_ALLOWED_ORIGINS`** to every browser origin that will call the API (GitHub Pages URL, your SPA domain).

### 2.9 Firewall

If the API must be reached from the internet **without** a reverse proxy on the same host:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 5050/tcp
sudo ufw enable
```

Prefer TLS on **443** via a proxy instead of exposing **5050** publicly.

---

## 3. Local testing

### 3.1 .NET unit / integration tests

From the **repository root**:

```bash
dotnet test HomeBot.Tests/HomeBot.Tests.csproj
```

On Windows (PowerShell):

```powershell
dotnet test HomeBot.Tests/HomeBot.Tests.csproj
```

**Note:** The test project disables xUnit parallelization because tests set process-global **`HOMEBOT_WEB_JWT_SECRET`**. If the build fails because **`HomeBot.dll`** is locked, stop any running **`dotnet run`** / debugger session for HomeBot, then run **`dotnet test`** again.

### 3.2 Web UI (manual)

1. Start the API (**`HOMEBOT_API_ENABLED=true`**) via **`dotnet run`**.
2. In **`webui`**: **`npm install`** then **`npm run dev`**.
3. Exercise **Sign in**, **Setup**, and feature pages; confirm **`AppShell`** shows API health/meta.

### 3.3 Lint (Web UI)

```bash
cd webui
npm run lint
```

---

## 4. GitHub Pages — build the static Web UI

GitHub Pages serves **static files** from **`webui/dist`**. You must:

1. Build with the correct **base path** for your Pages URL.
2. Set **`VITE_API_BASE_URL`** at **build time** to wherever the browser will reach your API (often **HTTPS**, not `localhost`).

### 4.1 URLs to know

| Site type | Example SPA URL | `VITE_BASE_PATH` |
|-----------|-----------------|------------------|
| **Project** repository `Owner/HomeBot` | `https://OWNER.github.io/HomeBot/` | **`/HomeBot/`** (leading and trailing slash as in **`webui/.env.example`**) |
| **User** site repo `Owner/owner.github.io` at root | `https://OWNER.github.io/` | **`/`** |

`vite.config.ts` uses **`process.env.VITE_BASE_PATH ?? '/'`**. The React router **`basename`** comes from Vite’s **`import.meta.env.BASE_URL`**, so it must match this base.

### 4.2 Local production build (smoke test before Pages)

From **`webui`** (replace **`OWNER`** / **`HomeBot`** / API URL):

```bash
cd webui
export VITE_BASE_PATH=/HomeBot/
export VITE_API_BASE_URL=https://api.yourdomain.com
npm ci
npm run build
npx vite preview --base /HomeBot/
```

Open the preview URL and confirm assets load (no 404 on `/HomeBot/assets/...`) and API calls hit **`VITE_API_BASE_URL`**.

### 4.3 API + CORS + OAuth for Pages

On the **server** that runs HomeBot:

1. **`HOMEBOT_ALLOWED_ORIGINS`** — include **`https://OWNER.github.io`** (origin only). If you use OAuth, the host may also merge the origin parsed from **`HOMEBOT_WEB_OAUTH_FRONTEND_URL`**; listing it explicitly is still fine.

2. **`HOMEBOT_WEB_OAUTH_FRONTEND_URL`** — for a **project** site under **`/HomeBot/`**, set this to the **full SPA root URL** (not “origin only” in this case), because the API redirects the browser to **`{HOMEBOT_WEB_OAUTH_FRONTEND_URL}/oauth/callback`**:
   - Example: **`https://OWNER.github.io/HomeBot`** (no trailing slash is OK; the app trims and appends **`/oauth/callback`**).

3. **`HOMEBOT_DISCORD_OAUTH_REDIRECT_URI`** — remains the **API** callback, e.g. **`https://api.yourdomain.com/api/auth/discord/oauth/callback`**, and must match the Discord Developer Portal **exactly**.

4. **`VITE_API_BASE_URL`** at Web UI build time — your public API base, e.g. **`https://api.yourdomain.com`** (no trailing slash).

---

## 5. GitHub Pages — enable hosting and connect the repo

### 5.1 Enable Pages in the GitHub UI

1. Push your repository to GitHub (**`OWNER/REPO`**).
2. In the repo on GitHub: **Settings** → **Pages**.
3. Under **Build and deployment** → **Source**, choose **GitHub Actions** (recommended) so the workflow below can deploy **`webui/dist`**.

If you use **Deploy from a branch** instead, you must commit **`webui/dist`** or a **`gh-pages`** branch yourself; the Actions approach avoids committing build output to **`main`**.

### 5.2 Add a GitHub Actions workflow

Create **`.github/workflows/deploy-webui.yml`** in your repo with content like below. Adjust:

- **`VITE_API_BASE_URL`** — use a **[repository variable](https://docs.github.com/en/actions/learn-github-actions/variables#defining-configuration-variables-for-multiple-workflows)** (e.g. `HOMEBOT_API_PUBLIC_URL`) or a secret, set in **Settings** → **Secrets and variables** → **Actions** → **Variables** tab.

```yaml
name: Deploy Web UI to GitHub Pages

on:
  push:
    branches: [main]
    paths:
      - "webui/**"
      - ".github/workflows/deploy-webui.yml"
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: npm
          cache-dependency-path: webui/package-lock.json

      - name: Install and build
        working-directory: webui
        env:
          VITE_BASE_PATH: /${{ github.event.repository.name }}/
          VITE_API_BASE_URL: ${{ vars.HOMEBOT_API_PUBLIC_URL }}
        run: npm ci && npm run build

      - uses: actions/configure-pages@v4

      - uses: actions/upload-pages-artifact@v3
        with:
          path: webui/dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

4. In **Settings** → **Secrets and variables** → **Actions** → **Variables**: create **`HOMEBOT_API_PUBLIC_URL`** = **`https://your-api-host`** (same value you want in **`VITE_API_BASE_URL`**).

5. Commit and push the workflow. Open **Actions** and confirm the workflow succeeds.

6. **Settings** → **Pages**: after the first successful run, GitHub shows the site URL (e.g. **`https://OWNER.github.io/HomeBot/`**).

### 5.3 First-time “Create GitHub Pages environment”

The first **`actions/deploy-pages`** run may prompt you to create the **`github-pages`** environment; approve it in the repo **Environments** settings if required.

---

## 6. Checklist after everything is up

| Check | |
|-------|---|
| **`GET https://your-api/api/health`** | Returns OK from browser or `curl`. |
| **Web UI loads** | No 404 for JS/CSS under **`/REPO/`** on GitHub Pages. |
| **Sign in / API calls** | Browser devtools: requests succeed; CORS errors mean fix **`HOMEBOT_ALLOWED_ORIGINS`**. |
| **Discord** | Bot online; **`/setup-set`** bindings for `buy`, `wishlist`, `money`, `calendar` (and optional **`audit`**). |
| **OAuth** (if used) | Discord redirect URI = API callback; **`HOMEBOT_WEB_OAUTH_FRONTEND_URL`** = SPA root including **`/REPO`** for project Pages. |

---

## 7. Quick reference — same machine dev (copy-paste)

**Terminal A — API + bot:**

```bash
# Linux/macOS: export vars or `set -a && source .env && set +a`
dotnet run
```

**Terminal B — Web UI:**

```bash
cd webui && npm install && npm run dev
```

**Tests:**

```bash
dotnet test HomeBot.Tests/HomeBot.Tests.csproj
```

For deeper configuration (rate limits, OAuth partial-env override, database path), see **README.md**.
