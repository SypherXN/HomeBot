# HomeBot setup guide

This guide walks through installing prerequisites, running the **.NET** process (Discord bot + optional API), running the **Web UI** locally, running **tests**, and publishing the Web UI to **GitHub Pages** with the API reachable from the browser.

**New to “environment variables”?** Read **[How configuration works](#how-configuration-works)** and **[Environment variable reference](#environment-variable-reference)** before editing **`.env`**. The rest of this document assumes you have filled in those values (or left optional ones blank).

---

## Table of contents

1. [How configuration works](#how-configuration-works)
2. [Environment variable reference](#environment-variable-reference)
3. [Prerequisites](#prerequisites-all-platforms)
4. [Windows: install and run](#windows-install-and-run)  
   - [Phone / another PC on your LAN](#phone-or-another-pc-on-your-lan-windows)
5. [Ubuntu: install and run](#ubuntu-install-and-run)  
   - [Start on every reboot (systemd)](#ubuntu-start-on-boot-systemd)
6. [Local testing](#local-testing)
7. [GitHub Pages: static build](#github-pages-static-build)
8. [GitHub Pages: Actions and hosting](#github-pages-actions-and-hosting)
9. [Checklist](#checklist-after-everything-is-up)
10. [Quick reference](#quick-reference-same-machine-dev-copy-paste)

---

## How configuration works

**Start here if you have never set server secrets before.**

### What is an “environment variable”?

Think of it as a **named setting** the program reads when it starts — like a hidden form filled out before HomeBot runs. Examples: `DISCORD_TOKEN`, `HOMEBOT_API_ENABLED`.

- You do **not** paste secrets into the HomeBot source code.
- You **do** put them in a **`.env`** file on your machine (or in systemd / Docker / your host’s panel). HomeBot’s **.NET process does not read `.env` by itself**; your shell, IDE, or process manager must **load those names into the environment** before `dotnet run` (see **`.env.example`** comments).

### What should I copy first?

1. Copy **`.env.example`** → **`.env`** in the **repo root** (same folder as `HomeBot.csproj`).
2. Optionally copy **`webui/.env.example`** → **`webui/.env`** if you build or run the React app (different variables — see [Web UI (Vite) variables](#web-ui-vite-variables)).

Fill **`.env`** using the **[Environment variable reference](#environment-variable-reference)** section below. **Never commit `.env`** — it is gitignored so secrets stay off GitHub.

### Words that confuse beginners

| Term | Plain meaning |
|------|----------------|
| **Origin** | The first part of a website address: **`https://example.com`** (scheme + host, **no** path). Used for CORS (“which websites may call my API from a browser?”). |
| **Guild** | Your **Discord server** (the place with channels). HomeBot needs its numeric **ID**. |
| **Bearer token** | A secret string sent as `Authorization: Bearer <secret>` to the API. **`HOMEBOT_API_TOKEN`** is one kind of bearer; a **JWT** from web login is another. |
| **`0.0.0.0`** | “Listen on every network interface.” You still open **`http://localhost:5050`** on the **same computer**; other PCs use your machine’s **IP or hostname**. |
| **CORS** | A browser safety rule. If your Web UI is at `https://you.github.io` but the API is elsewhere, the API must **allow that origin** or the browser blocks JavaScript requests. |

---

## Environment variable reference

**Use this as a checklist** while copying **`.env.example`** → **`.env`**. “Required” means **for that mode** (Discord on, API on, web login on, etc.).

### Mode switches

| Variable | Required? | What to put | Where the value comes from |
|----------|-----------|-------------|----------------------------|
| **`HOMEBOT_DISCORD_ENABLED`** | No | Omit, `true`, or **`false`** | **You choose.** Default behavior = Discord **on**. Set **`false`** only for **API-only** (no Discord bot in this process). |
| **`HOMEBOT_API_ENABLED`** | For Web UI / HTTP | Must be exactly **`true`** (any case) to start the API | **You choose.** Without this, `dotnet run` only runs Discord (if enabled). The React app needs the API. |

### Discord bot (when Discord is on)

| Variable | Required? | What to put | Where the value comes from |
|----------|-----------|-------------|----------------------------|
| **`DISCORD_TOKEN`** | Yes (if Discord on) | One long string (bot token) | **Discord Developer Portal** → [https://discord.com/developers/applications](https://discord.com/developers/applications) → **Your application** → **Bot** → **Reset Token** / **Copy**. Treat it like a password; anyone with it controls your bot. |
| **`DISCORD_GUILD_ID`** | Yes (if Discord on) | Digits only, e.g. `123456789012345678` | **Discord app** (user settings) → **App Settings** → **Advanced** → turn **Developer Mode** **On**. Then in the server list, **right‑click your server icon** (your household server) → **Copy Server ID**. Paste only the number. |

**First-time Discord app (short path):**

1. Developer Portal → **Applications** → **New Application** → name it (e.g. “HomeBot”).
2. Open **Bot** → **Add Bot** → enable **Privileged Gateway Intents** only if Discord’s docs say you need them for what you use.
3. **Reset Token** → copy → that is **`DISCORD_TOKEN`**.
4. Open **OAuth2** → **URL Generator** only for **inviting** the bot (scopes `bot` + `applications.commands`, pick permissions). Invite URL is **not** an env var — use it once in a browser.
5. **`DISCORD_GUILD_ID`** = your server’s ID (steps above).

### HTTP API and networking

| Variable | Required? | What to put | Where the value comes from |
|----------|-----------|-------------|----------------------------|
| **`HOMEBOT_API_URL`** | No | Default **`http://0.0.0.0:5050`** | **You choose** the bind URL. **`0.0.0.0`** = all interfaces. For “API only on this machine,” some people use **`http://127.0.0.1:5050`**. Must match how you reverse‑proxy (nginx/Caddy) if you use one. |
| **`HOMEBOT_API_TOKEN`** | Strongly recommended | A long random string **you invent** (or generate in a password manager) | **Not from Discord.** Same value goes wherever you need **`Authorization: Bearer …`** (scripts, curl). Optional **only** if you use **only** JWT web login and never the shared token — but then you still need **`HOMEBOT_WEB_JWT_SECRET`** or protected `/api` returns **503**. |
| **`HOMEBOT_ALLOWED_ORIGINS`** | If browsers hit the API from non-default origins | Comma‑separated **origins** (no path): `http://localhost:5173,https://youruser.github.io` | **List every place the Web UI is opened in a browser.** If unset, only **`http://localhost:5173`** is allowed (Vite default). **Do not** put your **API** URL here — put the **page** that runs JavaScript (GitHub Pages, your domain, etc.). |
| **`HOMEBOT_DATABASE_PATH`** | No | File path or full SQLite connection string | **You choose** where the SQLite file lives. Empty → **`homebot.db`** next to the process working directory. Can be `C:\Data\homebot.db` or `/var/lib/homebot/db.sqlite` or `Data Source=…`. |

### Web login (JWT)

| Variable | Required? | What to put | Where the value comes from |
|----------|-----------|-------------|----------------------------|
| **`HOMEBOT_WEB_JWT_SECRET`** | Yes for web **Sign in**, setup, OAuth | **At least 32 characters** (UTF‑8); longer is fine | **You invent** it (password manager “generate password” is ideal). **Never** put this in the React app or GitHub — **server only**. Used to sign JWTs. |
| **`HOMEBOT_WEB_SETUP_TOKEN`** | No | Any secret string **you invent** | Optional “extra password” for **first** web user bootstrap when set. If unset, that flow may not require it (see README). |
| **`HOMEBOT_WEB_INVITE_TOKEN`** | No | Any secret string **you invent** | Optional extra gate for **additional** user registration when set. |

### Discord OAuth (optional — “Continue with Discord” on Sign in)

All **three** must be set together, or leave **all** unset. In **Production** (non‑Development), **partial** OAuth env fails startup unless **`HOMEBOT_ALLOW_PARTIAL_OAUTH_ENV=true`**.

| Variable | What to put | Where the value comes from |
|----------|-------------|----------------------------|
| **`HOMEBOT_DISCORD_OAUTH_CLIENT_ID`** | Numeric **Application** ID | Developer Portal → **Your application** → **OAuth2** → **Client information** → **Client ID**. |
| **`HOMEBOT_DISCORD_OAUTH_CLIENT_SECRET`** | Short secret string | Same page → **Client secret** → **Reset** / **Copy**. |
| **`HOMEBOT_DISCORD_OAUTH_REDIRECT_URI`** | Full URL, **exactly** one registered redirect | **Must match** Developer Portal → **OAuth2** → **Redirects** character‑for‑character (`http` vs `https`, port, path, trailing slash). Points to the **API**, not Vite, e.g. **`http://localhost:5050/api/auth/discord/oauth/callback`** or **`https://api.yourdomain.com/api/auth/discord/oauth/callback`**. |
| **`HOMEBOT_WEB_OAUTH_FRONTEND_URL`** | Where the React app lives | After Discord, the API redirects the browser here + **`/oauth/callback`**. **Local:** `http://localhost:5173`. **GitHub Pages project site:** include the repo path, e.g. **`https://youruser.github.io/HomeBot`** (see [API + CORS + OAuth for Pages](#api-cors-oauth-for-pages)). |

**Discord portal checklist for OAuth:**

1. **OAuth2** → **Redirects** → **Add Redirect** → paste the same string as **`HOMEBOT_DISCORD_OAUTH_REDIRECT_URI`**.
2. Scopes used by HomeBot include **`identify`** (the app requests it in code).

### Optional tuning (limits, body size, staging)

| Variable | What to put | Where the value comes from |
|----------|-------------|----------------------------|
| **`HOMEBOT_API_MAX_BODY_BYTES`** | Positive integer (bytes) | **You choose** a cap; unset = default from Phase 3. |
| **`HOMEBOT_API_MUTATION_PER_MINUTE`** | Requests per IP per minute | **You choose**; README lists default (**200**). |
| **`HOMEBOT_API_AUTH_LOGIN_PER_MINUTE`** | Same idea | Default **30**; tune if you hit **429** on login. |
| **`HOMEBOT_API_OAUTH_CONSUME_PER_MINUTE`** | Same | Default **15**. |
| **`HOMEBOT_API_OAUTH_BROWSER_PER_MINUTE`** | Same | Default **48**. |
| **`HOMEBOT_API_AUTH_ACCOUNT_WRITE_PER_MINUTE`** | Same | Default **24**. |
| **`HOMEBOT_API_DISCORD_STATUS_POLL_PER_MINUTE`** | Same | Default **120**. |
| **`HOMEBOT_ALLOW_PARTIAL_OAUTH_ENV`** | **`true`** or omit | **Rare.** Set **`true`** only if you intentionally run **non‑Development** with **incomplete** OAuth client id/secret/redirect (staging). |
| **`ASPNETCORE_ENVIRONMENT`** | **`Development`** or **`Production`** | Standard .NET. **Development** relaxes some OAuth startup checks; **Production** enables stricter behavior (see README). If unset, tooling may default to **Production** on Linux servers. |

<a id="web-ui-vite-variables"></a>

### Web UI (Vite) variables

These are **not** read by the .NET bot. They are baked in when you run **`npm run dev`** or **`npm run build`** (Vite).

| Variable | File | What to put | Where the value comes from |
|----------|------|-------------|----------------------------|
| **`VITE_API_BASE_URL`** | `webui/.env` | Base URL of the API **as the browser sees it** | Usually **`http://localhost:5050`** on your PC. In production / GitHub Pages, use your **public API** URL, e.g. **`https://api.example.com`** — **no** trailing slash. |
| **`VITE_BASE_PATH`** | `webui/.env` | URL path prefix for the SPA | **`/`** for root hosting. For GitHub **project** Pages use **`/YourRepoName/`** (slash at start and end). Must match how the site is served. |

**GitHub Actions:** set `VITE_API_BASE_URL` from a repository **variable** (see [Add a GitHub Actions workflow](#add-a-github-actions-workflow)) so you do not commit secrets.

### Quick “am I missing something?” table

| Symptom | Likely fix |
|---------|------------|
| API **503** on protected routes | Set **`HOMEBOT_API_TOKEN`** and/or **`HOMEBOT_WEB_JWT_SECRET`** (JWT min 32 chars). |
| Browser says **CORS** / blocked fetch | Add your site’s **origin** to **`HOMEBOT_ALLOWED_ORIGINS`** (and/or fix OAuth frontend URL so auto‑merge helps). |
| Discord OAuth redirect error | **`HOMEBOT_DISCORD_OAUTH_REDIRECT_URI`** must **exactly** match a redirect in the Discord portal. |
| OAuth works locally but not on server | **`HOMEBOT_WEB_OAUTH_FRONTEND_URL`** must match where the React app really is (including **`/RepoName`** on GitHub project Pages). |
| `dotnet run` says Discord token missing | Set **`DISCORD_TOKEN`** (and **`DISCORD_GUILD_ID`**) or set **`HOMEBOT_DISCORD_ENABLED=false`**. |

For one-line reminders of defaults, keep **[README.md](./README.md)** open alongside this file.

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

<a id="windows-install-and-run"></a>

## 1. Windows — install toolchain

### 1.1 .NET 10 SDK

1. Open **[.NET downloads](https://dotnet.microsoft.com/download)**.
2. Download and install the **.NET 10 SDK** for Windows (x64).
3. Open a **new** PowerShell window and run:

   ```powershell
   dotnet --version
   ```

   You should see a `10.x.x` SDK version.

### 1.2 Node.js (LTS)

1. Open **[nodejs.org](https://nodejs.org)** and install the **LTS** Windows installer.
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
2. Copy **`webui/.env.example`** → **`webui/.env`** if you will run or build the Web UI (optional if defaults are fine).

Fill **`.env`** using **[Environment variable reference](#environment-variable-reference)** above. For a first working machine you usually need at least:

- **`DISCORD_TOKEN`** and **`DISCORD_GUILD_ID`** (if Discord is on — default).
- **`HOMEBOT_API_ENABLED=true`** for the Web UI.
- **`HOMEBOT_WEB_JWT_SECRET`** (32+ characters) for web sign-in, and usually **`HOMEBOT_API_TOKEN`** (or rely on JWT only once you understand [README.md](./README.md) **503** behavior).

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

<a id="phone-or-another-pc-on-your-lan-windows"></a>

### 1.7 Phone or another PC on your LAN (same Wi‑Fi)

Use this when HomeBot runs on your **Windows PC** and you want the **Web UI** on your **phone** (or a laptop) on the **same home network**.

1. **Put the phone on the same Wi‑Fi** as the PC (not guest isolation / “AP isolation” if your router offers it — that blocks device-to-device traffic).

2. **Find your PC’s LAN address** (something like `192.168.1.42`):
   - Open **PowerShell** and run: **`ipconfig`**
   - Under your active adapter (often **Wi‑Fi** or **Ethernet**), copy the **IPv4 Address**.

3. **API must listen on the whole network** (default is already correct): **`HOMEBOT_API_URL`** should be **`http://0.0.0.0:5050`** or unset (same default). That is **not** the URL you type in the browser — it means “listen on every interface.”

4. **Windows Firewall**: allow **inbound TCP 5050** for **Private** networks (see **§1.6**). Without this, the phone cannot reach the API.

5. **CORS** (browser security): the API only trusts certain **origins** by default. Add your PC’s dev UI origin. Before **`dotnet run`**, set for example (replace **`192.168.1.42`** with your IPv4):

   ```powershell
   $env:HOMEBOT_ALLOWED_ORIGINS = "http://localhost:5173,http://192.168.1.42:5173"
   ```

   Then start (or restart) **`dotnet run`**. If you use a **`.env`**, put the same comma‑separated value there and load it the way you usually do.

6. **Vite dev server must listen on the LAN**, not only `localhost`. From **`webui`**:

   ```powershell
   npm run dev -- --host 0.0.0.0
   ```

   Vite will print **Network:** URLs — use the one that shows your **`192.168.x.x`** address.

7. **On the phone’s browser**, open **`http://192.168.1.42:5173`** (your real IP).

8. **API base URL in the app**: in **Settings**, set the API base to **`http://192.168.1.42:5050`** (same IP, port **5050**) so the phone does not try to call **`localhost`** (that would mean “the phone itself,” not your PC).

**If it still fails:** from the phone, try opening **`http://192.168.1.42:5050/api/health`** — if that does not load, fix firewall or IP first before debugging the React app.

---

<a id="ubuntu-install-and-run"></a>

## 2. Ubuntu (headless Linux) — install toolchain

These steps assume a minimal **Ubuntu 22.04 or 24.04** server (SSH only). Adjust package URLs for your Ubuntu version using Microsoft’s current docs: **[Install .NET on Ubuntu](https://learn.microsoft.com/dotnet/core/install/linux-ubuntu)**.

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

### 2.7 systemd service (API + Discord, production-style)

**systemd** is Ubuntu’s service manager. A **unit file** tells it **which command to run**, **as which user**, and **when** (including **at boot**).

1. **Publish** the app once (builds a self-contained folder with **`HomeBot.dll`**):

   ```bash
   sudo -u homebot bash -c 'cd /opt/homebot/app && dotnet publish -c Release -o /opt/homebot/app/publish'
   ```

2. Create **`/etc/systemd/system/homebot.service`** with `sudo` and an editor (e.g. **`sudo nano /etc/systemd/system/homebot.service`**):

   ```ini
   [Unit]
   Description=HomeBot Discord + API
   After=network-online.target
   Wants=network-online.target

   [Service]
   Type=simple
   User=homebot
   Group=homebot
   WorkingDirectory=/opt/homebot/app
   EnvironmentFile=/opt/homebot/app/.env
   ExecStart=/usr/bin/dotnet /opt/homebot/app/publish/HomeBot.dll
   Restart=on-failure
   RestartSec=10

   [Install]
   WantedBy=multi-user.target
   ```

   - **`WorkingDirectory=/opt/homebot/app`** — default SQLite file **`homebot.db`** is created next to this folder unless you set **`HOMEBOT_DATABASE_PATH`** in **`.env`**.
   - **`EnvironmentFile=`** — each line should look like **`NAME=value`** (no `export` keyword). Use your real **`.env`** path if different.

3. **Reload** systemd, **enable** start-on-boot, and **start** now:

   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now homebot.service
   sudo systemctl status homebot.service
   ```

4. **Logs** (follow live):

   ```bash
   journalctl -u homebot.service -f
   ```

If **`status`** shows **failed**, scroll up in **`journalctl`** for the error (often a missing env var or bad path).

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

<a id="ubuntu-start-on-boot-systemd"></a>

### 2.10 Start on every reboot (systemd)

**Goal:** after a power cycle or `sudo reboot`, HomeBot comes back **without** you SSHing in to run `dotnet` by hand.

**What `systemctl enable` does:** it registers the unit under the default boot target (**`multi-user.target`**, normal text-only server). The line **`WantedBy=multi-user.target`** in **`[Install]`** is what makes that registration work. **`systemctl enable --now homebot.service`** both **registers for boot** and **starts the service immediately**.

**Check that start-on-boot is on:**

```bash
systemctl is-enabled homebot.service
```

You should see **`enabled`**.

**Simulate a reboot** (optional): **`sudo reboot`**, wait for SSH to return, then:

```bash
sudo systemctl status homebot.service
```

It should be **active (running)**. If it is **inactive**, run **`journalctl -u homebot.service -b`** to see this boot’s logs.

**After you `git pull` or change code**, publish again and restart:

```bash
sudo -u homebot bash -c 'cd /opt/homebot/app && dotnet publish -c Release -o /opt/homebot/app/publish'
sudo systemctl restart homebot.service
```

**Turn off start-on-boot** (service stays installed but does not run at boot):

```bash
sudo systemctl disable homebot.service
```

**If you want the process to restart after any crash** (not only on boot), change **`Restart=on-failure`** to **`Restart=always`** in the unit file, then **`sudo systemctl daemon-reload`** and **`sudo systemctl restart homebot.service`**.

---

<a id="local-testing"></a>

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

<a id="github-pages-static-build"></a>

## 4. GitHub Pages — build the static Web UI

GitHub Pages serves **static files** from **`webui/dist`**. You must:

1. Build with the correct **base path** for your Pages URL.
2. Set **`VITE_API_BASE_URL`** at **build time** to wherever the browser will reach your API (often **HTTPS**, not `localhost`).

### 4.1 URLs to know

| Site type | Example SPA URL | `VITE_BASE_PATH` |
|-----------|-----------------|------------------|
| **Project** repository `Owner/HomeBot` | `https://OWNER.github.io/HomeBot/` | **`/HomeBot/`** (leading and trailing slash as in **`webui/.env.example`**) |
| **User** site repo `Owner/owner.github.io` at root | `https://OWNER.github.io/` | **`/`** |

In **`vite.config.ts`**, the `base` option defaults to **`/`** or uses **`VITE_BASE_PATH`** from the environment. The React router **`basename`** comes from Vite’s **`import.meta.env.BASE_URL`**, so it must match this base.

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

<a id="api-cors-oauth-for-pages"></a>

### 4.3 API + CORS + OAuth for Pages

On the **server** that runs HomeBot:

1. **`HOMEBOT_ALLOWED_ORIGINS`** — include **`https://OWNER.github.io`** (origin only). If you use OAuth, the host may also merge the origin parsed from **`HOMEBOT_WEB_OAUTH_FRONTEND_URL`**; listing it explicitly is still fine.

2. **`HOMEBOT_WEB_OAUTH_FRONTEND_URL`** — for a **project** site under **`/HomeBot/`**, set this to the **full SPA root URL** (not “origin only” in this case), because the API redirects the browser to **`{HOMEBOT_WEB_OAUTH_FRONTEND_URL}/oauth/callback`**:
   - Example: **`https://OWNER.github.io/HomeBot`** (no trailing slash is OK; the app trims and appends **`/oauth/callback`**).

3. **`HOMEBOT_DISCORD_OAUTH_REDIRECT_URI`** — remains the **API** callback, e.g. **`https://api.yourdomain.com/api/auth/discord/oauth/callback`**, and must match the Discord Developer Portal **exactly**.

4. **`VITE_API_BASE_URL`** at Web UI build time — your public API base, e.g. **`https://api.yourdomain.com`** (no trailing slash).

---

<a id="github-pages-actions-and-hosting"></a>

## 5. GitHub Pages — enable hosting and connect the repo

### 5.1 Enable Pages in the GitHub UI

1. Push your repository to GitHub (**`OWNER/REPO`**).
2. In the repo on GitHub: **Settings** → **Pages**.
3. Under **Build and deployment** → **Source**, choose **GitHub Actions** (recommended) so the workflow below can deploy **`webui/dist`**.

If you use **Deploy from a branch** instead, you must commit **`webui/dist`** or a **`gh-pages`** branch yourself; the Actions approach avoids committing build output to **`main`**.

<a id="add-a-github-actions-workflow"></a>

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

**After the workflow file is in your repo:**

1. In GitHub: **Settings** → **Secrets and variables** → **Actions** → **Variables** → create **`HOMEBOT_API_PUBLIC_URL`** with your public API base (same value you want in **`VITE_API_BASE_URL`**, e.g. **`https://your-api-host`**).
2. Commit and push the workflow (if you have not already). Open the **Actions** tab and confirm the workflow run succeeds.
3. **Settings** → **Pages**: after the first successful run, GitHub shows the site URL (for example **`https://OWNER.github.io/HomeBot/`**).

### 5.3 First-time “Create GitHub Pages environment”

The first **`actions/deploy-pages`** run may prompt you to create the **`github-pages`** environment; approve it in the repo **Environments** settings if required.

---

<a id="checklist-after-everything-is-up"></a>

## 6. Checklist after everything is up

| Check | What you want to see |
|-------|-------------------------|
| **`GET https://your-api/api/health`** | Returns OK from browser or `curl`. |
| **Web UI loads** | No 404 for JS/CSS under **`/REPO/`** on GitHub Pages. |
| **Sign in / API calls** | Browser devtools: requests succeed; CORS errors mean fix **`HOMEBOT_ALLOWED_ORIGINS`**. |
| **Discord** | Bot online; **`/setup-set`** bindings for `buy`, `wishlist`, `money`, `calendar` (and optional **`audit`**). |
| **OAuth** (if used) | Discord redirect URI = API callback; **`HOMEBOT_WEB_OAUTH_FRONTEND_URL`** = SPA root including **`/REPO`** for project Pages. |

---

<a id="quick-reference-same-machine-dev-copy-paste"></a>

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

For deeper configuration (rate limits, OAuth partial-env override, database path), see **[README.md](./README.md)**.
