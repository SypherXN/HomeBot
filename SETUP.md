# HomeBot — complete setup guide

This guide is written for people who have **never** wired up a Discord bot, a small web API, or GitHub Pages before. Follow the parts **in order** unless a heading says “optional.”

**What you will have when you are done**

- A **Discord bot** in your server, with slash commands and channel bindings for lists, money, and calendar.
- The **same program** optionally serving an **HTTP API** (default **`http://0.0.0.0:5050`**) and a **SQLite** database (`homebot.db` by default).
- A **React Web UI** you can run on your PC with `npm run dev`, or build as static files and host (for example on **GitHub Pages**) with your API reachable from the browser.

**Important:** The .NET app reads the **process environment only**. It does **not** load `.env` by itself. On Windows you can set variables in PowerShell, use your editor’s **envFile**, or use the helper script in **[Section 7](#7-windows-start-automatically-on-sign-in-or-boot)**. On Ubuntu, **systemd** loads `.env` via **`EnvironmentFile=`**.

---

## Table of contents

1. [Overview — what to do in what order](#1-overview--what-to-do-in-what-order)
2. [Prerequisites](#2-prerequisites)
3. [GitHub and source code](#3-github-and-source-code)
4. [Discord — application, bot token, invite, server ID](#4-discord--application-bot-token-invite-server-id)
5. [Environment files: `.env` and `webui/.env`](#5-environment-files-env-and-webuienv)
6. [Run HomeBot on Windows (first time)](#6-run-homebot-on-windows-first-time)
7. [Windows — start automatically on sign-in or boot](#7-windows-start-automatically-on-sign-in-or-boot)
8. [Ubuntu server — install, `systemd`, auto-start on reboot](#8-ubuntu-server--install-systemd-auto-start-on-reboot)
9. [Web UI on your PC](#9-web-ui-on-your-pc)
10. [Discord — finish in-server setup (`/setup-set`)](#10-discord--finish-in-server-setup-setup-set)
11. [Web accounts — sign in, Discord verify, bootstrap](#11-web-accounts--sign-in-discord-verify-bootstrap)
12. [Optional — Discord OAuth (“Continue with Discord”)](#12-optional--discord-oauth-continue-with-discord)
13. [Optional — GitHub Pages (static Web UI)](#13-optional--github-pages-static-web-ui)
14. [Optional — public HTTPS API (reverse proxy)](#14-optional--public-https-api-reverse-proxy)
15. [Phone or another PC on your LAN (Windows dev)](#15-phone-or-another-pc-on-your-lan-windows-dev)
16. [Tests and lint](#16-tests-and-lint)
17. [Troubleshooting](#17-troubleshooting)
18. [Reference — how configuration works](#18-reference--how-configuration-works)
19. [Reference — every environment variable](#19-reference--every-environment-variable)
20. [Backing up SQLite (`homebot.db`)](#20-backing-up-sqlite-homebotdb)

---

## 1. Overview — what to do in what order

| Step | What | Where |
|------|------|--------|
| 1 | Install **Git**, **.NET 10 SDK**, **Node.js (LTS or 20+)** | Your Windows PC or Ubuntu server |
| 2 | **Clone** this repository (or your fork) | [Section 3](#3-github-and-source-code) |
| 3 | Create a **Discord application** and **bot**, copy the **token**, **invite** the bot, copy **Server (guild) ID** | [Section 4](#4-discord--application-bot-token-invite-server-id) |
| 4 | Copy **`.env.example`** → **`.env`**, **`webui/.env.example`** → **`webui/.env`**, fill required keys | [Section 5](#5-environment-files-env-and-webuienv) |
| 5 | Run **`dotnet run`** (and keep it running) | [Section 6](#6-run-homebot-on-windows-first-time) (Windows) or [Section 8](#8-ubuntu-server--install-systemd-auto-start-on-reboot) (Ubuntu) |
| 6 | Run **`npm run dev`** in **`webui`** | [Section 9](#9-web-ui-on-your-pc) |
| 7 | In Discord, run **`/setup-set`** to bind features to channels | [Section 10](#10-discord--finish-in-server-setup-setup-set) |
| 8 | In the browser, open **Sign in** / **New account** and complete setup | [Section 11](#11-web-accounts--sign-in-discord-verify-bootstrap) |
| 9 | (Optional) OAuth button, **GitHub Pages**, **HTTPS** for the API | [Section 12](#12-optional--discord-oauth-continue-with-discord)–[Section 14](#14-optional--public-https-api-reverse-proxy) |
| 10 | (Ongoing) **Back up** your SQLite file so you can recover from mistakes or disk loss | [Section 20](#20-backing-up-sqlite-homebotdb) |

---

## 2. Prerequisites

| Requirement | Notes |
|-------------|--------|
| **A Discord account** and permission to **manage** a server (or your own test server). |
| **A GitHub account** (optional until you use GitHub Pages or clone from GitHub). |
| **.NET SDK 10** | Matches `HomeBot.csproj` (`net10.0`). Check with **`dotnet --version`**. |
| **Node.js** | **20+** recommended (Vite 8). Check with **`node --version`** and **`npm --version`**. |
| **Git** | To clone updates. |

---

## 3. GitHub and source code

### 3.1 Clone the repository

**Windows (PowerShell):**

```powershell
cd $HOME\Desktop
git clone https://github.com/OWNER/HomeBot.git
cd HomeBot
```

Replace **`OWNER/HomeBot`** with the real path (your fork or upstream).

**Ubuntu:**

```bash
cd ~
git clone https://github.com/OWNER/HomeBot.git
cd HomeBot
```

### 3.2 Stay up to date

```bash
git pull
```

After pulling on a **server**, rebuild and restart the service ([Section 8.8](#88-updates-after-git-pull)).

---

## 4. Discord — application, bot token, invite, server ID

Do this **once** per Discord “application” (your HomeBot identity).

### 4.1 Create the application

1. Open **[Discord Developer Portal — Applications](https://discord.com/developers/applications)** and sign in.
2. Click **New Application**, choose a name (e.g. **HomeBot**), create it.
3. Open the **Bot** tab on the left.
4. Click **Add Bot** (confirm if asked).
5. Under **Token**, click **Reset Token** (or **View Token**), confirm, and **copy** the token.  
   - This string is your **`DISCORD_TOKEN`**. **Never** paste it into GitHub or the Web UI bundle; only into **`.env`** on machines that run HomeBot.

### 4.2 Gateway intents (recommended)

HomeBot’s code requests **broad gateway intents**. In the same **Bot** tab, under **Privileged Gateway Intents**, enable at least what your server needs (often **Server Members Intent** and **Message Content Intent** if Discord warns on connect). If the bot fails to start or misbehaves, compare the portal toggles with Discord’s current documentation.

### 4.3 Invite URL (add the bot to your server)

1. Open **OAuth2** → **URL Generator**.
2. Under **Scopes**, check **`bot`** and **`applications.commands`** (slash commands require the latter).
3. Under **Bot Permissions**, a practical starting set includes: **View Channels**, **Send Messages**, **Embed Links**, **Attach Files**, **Read Message History**, **Add Reactions**, **Use Slash Commands** (exact names may vary slightly in the UI).
4. Copy the generated **URL** at the bottom, paste it into your browser, pick your **household server**, authorize.

You should see the bot join as **offline** until HomeBot runs with a valid token.

### 4.4 Copy your **Server (guild) ID** — `DISCORD_GUILD_ID`

1. In the Discord **desktop or web** app: **User Settings** → **App Settings** → **Advanced** → enable **Developer Mode**.
2. In the server list, **right‑click your server icon** → **Copy Server ID**.
3. That number (digits only) is **`DISCORD_GUILD_ID`**. Slash commands register to **this** server.

### 4.5 OAuth2 client (only if you will use “Continue with Discord”)

Skip until [Section 12](#12-optional--discord-oauth-continue-with-discord). When needed: **OAuth2** → **General** → copy **Client ID** and **Client Secret**; add redirect URLs under **Redirects** (must match **`HOMEBOT_DISCORD_OAUTH_REDIRECT_URI`** exactly).

---

## 5. Environment files: `.env` and `webui/.env`

### 5.1 Create the files

From the **repository root** (same folder as `HomeBot.csproj`):

1. Copy **`.env.example`** → **`.env`**.
2. Copy **`webui/.env.example`** → **`webui/.env`**.

**`.env` is gitignored** — it must never be committed.

### 5.2 Minimum values for “Discord + API + Web sign-in”

Edit **`.env`** and set at least:

```env
DISCORD_TOKEN=paste-bot-token-here
DISCORD_GUILD_ID=paste-numeric-server-id-here
HOMEBOT_API_ENABLED=true
HOMEBOT_API_TOKEN=make-up-a-long-random-string
HOMEBOT_WEB_JWT_SECRET=another-long-random-secret-at-least-32-characters
```

- **`HOMEBOT_API_TOKEN`**: any long random string **you invent** (password manager). Used as **`Authorization: Bearer …`** for scripts and optional API access.
- **`HOMEBOT_WEB_JWT_SECRET`**: **at least 32 characters**; **server only**; signs web login JWTs.

Leave optional sections in **`.env.example`** commented until you need OAuth or custom URLs.

### 5.3 Web UI build-time defaults (`webui/.env`)

For local development, defaults are usually fine:

```env
VITE_API_BASE_URL=http://localhost:5050
VITE_BASE_PATH=/
```

Change **`VITE_API_BASE_URL`** if the API listens elsewhere. For **GitHub Pages** project sites you will set **`VITE_BASE_PATH=/YourRepoName/`** at **build** time ([Section 13](#13-optional--github-pages-static-web-ui)).

---

## 6. Run HomeBot on Windows (first time)

### 6.1 Install .NET 10 SDK

1. **[Download .NET 10](https://dotnet.microsoft.com/download)** → install the **SDK** for Windows x64.
2. Open a **new** PowerShell window:

   ```powershell
   dotnet --version
   ```

   Expect **`10.x.x`**.

### 6.2 Install Node.js

1. **[nodejs.org](https://nodejs.org)** → install **LTS**.
2. New PowerShell:

   ```powershell
   node --version
   npm --version
   ```

### 6.3 Load environment variables and run

The app **does not** read `.env` automatically. Pick **one** approach:

**A — PowerShell for this session only** (good for testing):

```powershell
cd C:\path\to\HomeBot
Get-Content .env | ForEach-Object {
  if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }
  $i = $_.IndexOf('=')
  if ($i -gt 0) {
    $n = $_.Substring(0, $i).Trim(); $v = $_.Substring($i + 1).Trim()
    Set-Item -Path "Env:$n" -Value $v
  }
}
dotnet run
```

**B — Cursor / VS Code:** configure **`launch.json`** with **`"envFile": "${workspaceFolder}/.env"`** for F5 debugging (see editor docs).

**C — Helper script (also used for autostart):** see **`scripts/run-homebot.ps1`** and [Section 7](#7-windows-start-automatically-on-sign-in-or-boot).

You should see logs indicating **Kestrel** listening (for example on **`5050`**) and Discord **Ready** when the token is valid.

### 6.4 Firewall (other devices on your LAN)

If phones or other PCs must reach the API on port **5050**, allow **inbound TCP 5050** for **Private** networks in **Windows Defender Firewall** → **Advanced settings** → **Inbound Rules**.

---

## 7. Windows — start automatically on sign-in or boot

HomeBot is a normal console app — Windows does not “install” it as a service unless you add tooling (NSSM, WinSW, etc.). Two simple patterns:

### 7.1 Task Scheduler (recommended)

1. Open **Task Scheduler** → **Create Task…** (not “Create Basic Task” if you want full control).
2. **General:** name **`HomeBot`**; select **Run whether user is logged on or not** *or* **only when user is logged on** depending on whether you need a desktop session. Check **Run with highest privileges** only if required.
3. **Triggers:** **New…** → **At startup** (or **At log on** for your user). Optional: **Delay task for** **30 seconds** so the network is up.
4. **Actions:** **New…**  
   - **Program/script:** **`pwsh`** (PowerShell 7) or **`powershell`**  
   - **Add arguments:** **`-NoProfile -ExecutionPolicy Bypass -File "C:\full\path\to\HomeBot\scripts\run-homebot.ps1"`**  
   - **Start in:** **`C:\full\path\to\HomeBot`**
5. **Conditions / Settings:** disable **Start only on AC power** if this is a laptop on battery.
6. Save; enter your Windows password if prompted for a stored credential.

The repo includes **`scripts/run-homebot.ps1`**, which loads **repo-root `.env`** into the process and runs **`dotnet run`**. Edit paths in Task Scheduler if your clone lives elsewhere.

### 7.2 After `git pull` on Windows

Stop the running process (or end the scheduled task run), then from the repo root:

```powershell
dotnet run
```

to verify, or let the next scheduled start pick up changes.

---

## 8. Ubuntu server — install, `systemd`, auto-start on reboot

These steps fit a **headless Ubuntu 22.04 or 24.04** server (SSH). Adjust URLs if Microsoft’s docs change: **[Install .NET on Ubuntu](https://learn.microsoft.com/dotnet/core/install/linux-ubuntu)**.

### 8.1 Base packages

```bash
sudo apt update
sudo apt install -y curl git ca-certificates
```

### 8.2 .NET 10 SDK (Microsoft package feed)

**Ubuntu 22.04:**

```bash
wget https://packages.microsoft.com/config/ubuntu/22.04/packages-microsoft-prod.deb -O /tmp/packages-microsoft-prod.deb
sudo dpkg -i /tmp/packages-microsoft-prod.deb
sudo apt update
sudo apt install -y dotnet-sdk-10.0
dotnet --version
```

**Ubuntu 24.04** — use **`24.04`** in the `wget` URL instead of **`22.04`**, then the same **`dpkg`** / **`apt install dotnet-sdk-10.0`** steps.

### 8.3 Node.js (only if you build the Web UI on this server)

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node --version
```

### 8.4 Dedicated user and clone

```bash
sudo adduser --disabled-password --gecos "" homebot
sudo mkdir -p /opt/homebot && sudo chown homebot:homebot /opt/homebot
sudo -u homebot -i
cd /opt/homebot
git clone https://github.com/OWNER/HomeBot.git app
cd app
```

### 8.5 Create `/opt/homebot/app/.env`

As user **`homebot`**:

```bash
nano /opt/homebot/app/.env
```

Paste the same **`KEY=value`** lines as on Windows ([Section 5](#5-environment-files-env-and-webuienv)). **No `export` keyword** — one variable per line. Restrict permissions:

```bash
chmod 600 /opt/homebot/app/.env
```

### 8.6 Smoke test (manual)

```bash
cd /opt/homebot/app
set -a && source .env && set +a
dotnet run
```

Confirm Discord (if enabled) and API logs. Stop with **Ctrl+C**.

### 8.7 Publish and install the `systemd` unit

**Publish** (builds **`publish/HomeBot.dll`**):

```bash
sudo -u homebot bash -c 'cd /opt/homebot/app && dotnet publish -c Release -o /opt/homebot/app/publish'
```

Create **`/etc/systemd/system/homebot.service`** (use **`sudo nano`**):

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

- **`WorkingDirectory`**: default SQLite **`homebot.db`** appears here unless **`HOMEBOT_DATABASE_PATH`** overrides.
- **`EnvironmentFile`**: systemd reads **`KEY=value`** lines. If a value contains special characters, see systemd documentation or switch to **`Environment=`** lines.

**Enable start on every boot and start now:**

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now homebot.service
sudo systemctl status homebot.service
```

**Logs:**

```bash
journalctl -u homebot.service -f
```

**Verify boot registration:**

```bash
systemctl is-enabled homebot.service
```

Expect **`enabled`**. After **`sudo reboot`**, run **`systemctl status homebot.service`** again.

### 8.8 Updates after `git pull`

```bash
sudo -u homebot bash -c 'cd /opt/homebot/app && git pull && dotnet publish -c Release -o /opt/homebot/app/publish'
sudo systemctl restart homebot.service
```

### 8.9 Optional: restart on any crash

In the unit file, change **`Restart=on-failure`** to **`Restart=always`**, then:

```bash
sudo systemctl daemon-reload
sudo systemctl restart homebot.service
```

### 8.10 Firewall

Prefer **TLS on 443** via a reverse proxy ([Section 14](#14-optional--public-https-api-reverse-proxy)). If you must expose **5050** directly:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 5050/tcp
sudo ufw enable
```

---

## 9. Web UI on your PC

1. Ensure HomeBot is running with **`HOMEBOT_API_ENABLED=true`** ([Section 6](#6-run-homebot-on-windows-first-time) or [Section 8](#8-ubuntu-server--install-systemd-auto-start-on-reboot)).
2. Open a **second** terminal:

   **Windows:**

   ```powershell
   cd C:\path\to\HomeBot\webui
   npm install
   npm run dev
   ```

   **Ubuntu:**

   ```bash
   cd ~/HomeBot/webui   # or /opt/homebot/app/webui
   npm install
   npm run dev
   ```

3. Open the URL Vite prints (usually **`http://localhost:5173`**).
4. Use **Sign in** or **New account** ([Section 11](#11-web-accounts--sign-in-discord-verify-bootstrap)). The header shows API reachability.

---

## 10. Discord — finish in-server setup (`/setup-set`)

Slash commands are registered to **`DISCORD_GUILD_ID`**. After the bot is **online**:

1. In a channel where the bot can read messages, run **`/help`** (use the **topic** option for details).
2. Run **`/setup-set`** to bind each feature to a text channel, for example:
   - **`buy`**, **`wishlist`**, **`money`**, **`calendar`**
   - Optional: **`audit`** — logs web sign-ins to a mod channel.

Most feature commands only work in the channel bound for that feature.

**Web sign-up via Discord:** if someone uses **Discord verify** on the web, they complete **`/webui-verify`** in your server with the code from the setup page.

---

## 11. Web accounts — sign in, Discord verify, bootstrap

- **Password sign-in:** create users according to your server’s policy (first user may require **`HOMEBOT_WEB_SETUP_TOKEN`** if set in `.env`).
- **Discord verify:** ties a **WebUsers** row to a Discord user without typing snowflakes in the browser.
- **`actorUserId`:** many mutations need a Discord user id; the Web UI can fill this from your profile after sign-in or from **Settings** when the bot can list members.

If protected **`/api`** routes return **503**, set **`HOMEBOT_API_TOKEN`** and/or **`HOMEBOT_WEB_JWT_SECRET`** (see [Section 19](#19-reference--every-environment-variable)).

---

## 12. Optional — Discord OAuth (“Continue with Discord”)

Uses the **same** `WebUsers` row as password login when **`DiscordUserId`** matches. There is **no** account creation from OAuth alone.

1. Set **all three** in **`.env`**: **`HOMEBOT_DISCORD_OAUTH_CLIENT_ID`**, **`HOMEBOT_DISCORD_OAUTH_CLIENT_SECRET`**, **`HOMEBOT_DISCORD_OAUTH_REDIRECT_URI`** (API URL, not Vite).
2. In the Developer Portal **OAuth2 → Redirects**, add the **exact** same redirect URI.
3. Set **`HOMEBOT_WEB_OAUTH_FRONTEND_URL`** to the **origin** where the SPA runs (e.g. **`http://localhost:5173`** or your GitHub Pages SPA root — see [Section 13](#13-optional--github-pages-static-web-ui)).
4. **`HOMEBOT_WEB_JWT_SECRET`** must still be set.

In **Production**, partial OAuth env fails startup unless **`HOMEBOT_ALLOW_PARTIAL_OAUTH_ENV=true`**. Details: **[README.md](README.md)**.

---

## 13. Optional — GitHub Pages (static Web UI)

**You need:** a **public HTTPS URL** for the API (your Ubuntu server behind Caddy/nginx, or a tunnel for testing), correct **CORS**, and a static build of **`webui/dist`**.

### 13.1 URLs and Vite base path

| Site type | Example browser URL | `VITE_BASE_PATH` when building |
|-----------|---------------------|--------------------------------|
| **Project** repo `Owner/HomeBot` | `https://OWNER.github.io/HomeBot/` | **`/HomeBot/`** (leading and trailing slash) |
| **User** site `owner.github.io` at root | `https://OWNER.github.io/` | **`/`** |

### 13.2 Build locally (smoke test)

```bash
cd webui
export VITE_BASE_PATH=/HomeBot/
export VITE_API_BASE_URL=https://api.yourdomain.com
npm ci
npm run build
npx vite preview --base /HomeBot/
```

Confirm assets load (no 404 under **`/HomeBot/assets/...`**) and API calls hit your public API.

### 13.3 API environment for Pages + OAuth

On the API host:

1. **`HOMEBOT_ALLOWED_ORIGINS`** — include **`https://OWNER.github.io`** (origin only). Listing explicit origins avoids surprises.
2. **`HOMEBOT_WEB_OAUTH_FRONTEND_URL`** — for a project site, use the **full SPA root**, e.g. **`https://OWNER.github.io/HomeBot`** (no trailing slash is OK), so redirects hit **`…/oauth/callback`** correctly.
3. **`HOMEBOT_DISCORD_OAUTH_REDIRECT_URI`** — must be the **HTTPS API** callback, e.g. **`https://api.yourdomain.com/api/auth/discord/oauth/callback`**, and must match Discord **Redirects** exactly.

### 13.4 Enable Pages and deploy

1. Push the repository to GitHub.
2. **Settings** → **Pages** → **Build and deployment** → **Source** → **GitHub Actions** (recommended).
3. **Settings** → **Secrets and variables** → **Actions** → **Variables**:
   - **`HOMEBOT_API_PUBLIC_URL`** (recommended) — public API base baked into the static build, e.g. **`https://api.example.com`** (no trailing slash). If unset, the workflow still builds but logs a **warning** (easy to ship a broken SPA by mistake).
   - **`HOMEBOT_WEBUI_BASE_PATH`** (optional) — override **`VITE_BASE_PATH`** for the Actions build. If unset, the workflow defaults to **`/REPO_NAME/`** from **`GITHUB_REPOSITORY`** (correct for **project** Pages at **`https://OWNER.github.io/REPO/`**). Use **`/`** for a **user** site at the domain root.

The repo ships **[`.github/workflows/pages-webui.yml`](.github/workflows/pages-webui.yml)** (runs on **`webui/**`** pushes to **`main`** and **`workflow_dispatch`**). The first **`deploy-pages`** run may ask you to approve the **`github-pages`** environment.

**Optional:** keep a **local-only** workflow filename **`deploy-webui.yml`** — it stays **gitignored** in this repo so it never overwrites the shared **`pages-webui.yml`** on push.

To customize the pipeline further, copy **`pages-webui.yml`** under a new name in **`.github/workflows/`** and edit triggers or env.

---

## 14. Optional — public HTTPS API (reverse proxy)

Put **Caddy** or **nginx** on **`80`/`443`**, terminate TLS, and forward to **`http://127.0.0.1:5050`** (or whatever **`HOMEBOT_API_URL`** uses).

### Caddy (example)

```caddy
api.example.com {
    encode gzip
    reverse_proxy 127.0.0.1:5050
}
```

### nginx (example)

```nginx
server {
    listen 443 ssl http2;
    server_name api.example.com;

    location / {
        proxy_pass http://127.0.0.1:5050;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Set **`HOMEBOT_ALLOWED_ORIGINS`** to every **browser origin** that calls the API (not the API hostname alone).

**Renewals:** **`certbot renew`** for Let’s Encrypt; reload the proxy afterward. Rotate Discord secrets in the portal and **`.env`** when needed.

---

## 15. Phone or another PC on your LAN (Windows dev)

1. Same Wi‑Fi as the PC; avoid guest/AP isolation.
2. **`ipconfig`** → note **IPv4** (e.g. **`192.168.1.42`**).
3. Keep **`HOMEBOT_API_URL`** as default **`http://0.0.0.0:5050`** so the API listens on all interfaces.
4. Allow **TCP 5050** in Windows Firewall ([Section 6.4](#64-firewall-other-devices-on-your-lan)).
5. Set CORS before **`dotnet run`**:

   ```powershell
   $env:HOMEBOT_ALLOWED_ORIGINS = "http://localhost:5173,http://192.168.1.42:5173"
   ```

6. From **`webui`**: **`npm run dev -- --host 0.0.0.0`** and open **`http://192.168.1.42:5173`** on the phone.
7. Sanity check from the phone: **`http://192.168.1.42:5050/api/health`**.

---

## 16. Tests and lint

**Tests** (repo root):

```bash
dotnet test HomeBot.Tests/HomeBot.Tests.csproj
```

**Web UI lint:**

```bash
cd webui && npm run lint
```

Stop any running **`dotnet run`** for HomeBot if the build cannot overwrite **`HomeBot.dll`**.

---

## 17. Troubleshooting

| Symptom | Likely fix |
|---------|------------|
| API **503** on protected routes | Set **`HOMEBOT_API_TOKEN`** and/or **`HOMEBOT_WEB_JWT_SECRET`** (JWT ≥ 32 chars). |
| Browser **CORS** errors | Add the site **origin** to **`HOMEBOT_ALLOWED_ORIGINS`**; check **`HOMEBOT_WEB_OAUTH_FRONTEND_URL`** for OAuth. |
| Discord OAuth redirect mismatch | **`HOMEBOT_DISCORD_OAUTH_REDIRECT_URI`** must **exactly** match a Discord **Redirects** entry. |
| **`dotnet run`** missing token | Set **`DISCORD_TOKEN`** and **`DISCORD_GUILD_ID`**, or **`HOMEBOT_DISCORD_ENABLED=false`** for API-only. |
| **`systemctl status`** failed | **`journalctl -u homebot.service -xe`** — often a bad **`EnvironmentFile`** line or missing **`publish/`** after git pull. |
| Slash commands missing | Confirm **`DISCORD_GUILD_ID`** matches the server where you invited the bot; restart the bot after fixing. |

---

## 18. Reference — how configuration works

### What is an environment variable?

A **named value** the process reads at startup (e.g. **`DISCORD_TOKEN`**). You do **not** put secrets in source code. You **do** put them in **`.env`** on disk and **load** them into the environment before **`dotnet run`** (PowerShell, **`scripts/run-homebot.ps1`**, editor **envFile**, or **`systemd`** **`EnvironmentFile=`**).

### Terms

| Term | Meaning |
|------|--------|
| **Origin** | Scheme + host, **no path** — e.g. **`https://you.github.io`**. Used for CORS. |
| **Guild** | Your Discord **server**; **`DISCORD_GUILD_ID`** is its numeric id. |
| **Bearer** | **`Authorization: Bearer <secret>`** — either **`HOMEBOT_API_TOKEN`** or a **JWT** from web login. |
| **`0.0.0.0`** | Listen on all network interfaces; you still use **`localhost`** on the same machine. |

---

## 19. Reference — every environment variable

**Use as a checklist** while editing **`.env`**. “Required” depends on mode (Discord on/off, API on/off, web login, OAuth).

### Mode switches

| Variable | Required? | Notes |
|----------|-----------|--------|
| **`HOMEBOT_DISCORD_ENABLED`** | No | Default: Discord **on**. **`false`** = API-only process. |
| **`HOMEBOT_API_ENABLED`** | For HTTP / Web UI | Must be **`true`** to start Kestrel. |

### Discord (when Discord is on)

| Variable | Required? | Notes |
|----------|-----------|--------|
| **`DISCORD_TOKEN`** | Yes | Bot token from Developer Portal. |
| **`DISCORD_GUILD_ID`** | Yes | Right‑click server → Copy Server ID (Developer Mode). |

### HTTP API

| Variable | Required? | Notes |
|----------|-----------|--------|
| **`HOMEBOT_API_URL`** | No | Default **`http://0.0.0.0:5050`**. |
| **`HOMEBOT_API_TOKEN`** | Strongly recommended | Random secret; **`Bearer`** for scripts. |
| **`HOMEBOT_ALLOWED_ORIGINS`** | If not only localhost:5173 | Comma‑separated **origins**, no paths. |
| **`HOMEBOT_DATABASE_PATH`** | No | SQLite path or connection string. |
| **`HOMEBOT_API_MAX_BODY_BYTES`** | No | JSON body cap. |
| **`HOMEBOT_API_MUTATION_PERMIT_LIMIT`** | No | Mutation requests per IP per minute (default **200**). |

### Web login (JWT)

| Variable | Required? | Notes |
|----------|-----------|--------|
| **`HOMEBOT_WEB_JWT_SECRET`** | Yes for web auth flows | ≥ **32** UTF‑8 bytes; server only. |
| **`HOMEBOT_WEB_SETUP_TOKEN`** | No | Extra gate for first-user bootstrap. |
| **`HOMEBOT_WEB_INVITE_TOKEN`** | No | Extra gate for additional registration. |
| **`HOMEBOT_WEB_JWT_ACCESS_TTL_SECONDS`** | No | Access JWT lifetime (default **900**). |
| **`HOMEBOT_WEB_REFRESH_TTL_SECONDS`** | No | Refresh token lifetime in DB (default **30 days**). |

### Discord OAuth (all three together, or none)

| Variable | Notes |
|----------|--------|
| **`HOMEBOT_DISCORD_OAUTH_CLIENT_ID`** | OAuth2 Client ID. |
| **`HOMEBOT_DISCORD_OAUTH_CLIENT_SECRET`** | OAuth2 Client Secret. |
| **`HOMEBOT_DISCORD_OAUTH_REDIRECT_URI`** | API callback URL; must match Discord **Redirects** exactly. |
| **`HOMEBOT_WEB_OAUTH_FRONTEND_URL`** | SPA origin (or full SPA root for GitHub project Pages — [Section 13](#13-optional--github-pages-static-web-ui)). |

### Auth rate limits (optional)

| Variable | Default |
|----------|---------|
| **`HOMEBOT_API_AUTH_LOGIN_PER_MINUTE`** | **30** |
| **`HOMEBOT_API_AUTH_REFRESH_PER_MINUTE`** | **36** |
| **`HOMEBOT_API_OAUTH_CONSUME_PER_MINUTE`** | **15** |
| **`HOMEBOT_API_OAUTH_BROWSER_PER_MINUTE`** | **48** |
| **`HOMEBOT_API_AUTH_ACCOUNT_WRITE_PER_MINUTE`** | **24** |
| **`HOMEBOT_API_DISCORD_STATUS_POLL_PER_MINUTE`** | **120** |

### Other

| Variable | Notes |
|----------|--------|
| **`HOMEBOT_ALLOW_PARTIAL_OAUTH_ENV`** | **`true`** only if you intentionally run incomplete OAuth outside Development. |
| **`ASPNETCORE_ENVIRONMENT`** | **`Development`** vs **`Production`** (.NET); affects OAuth strictness. |

### Web UI (Vite) — `webui/.env`

| Variable | Notes |
|----------|--------|
| **`VITE_API_BASE_URL`** | Public API base as the **browser** sees it; no trailing slash. |
| **`VITE_BASE_PATH`** | SPA base (**`/`** or **`/RepoName/`** for GitHub project Pages). |

For defaults and comments, see **`webui/.env.example`**.

---

## 20. Backing up SQLite (`homebot.db`)

HomeBot stores household data in **SQLite**. By default the file is **`homebot.db`** in the process **working directory** (repo root when you run `dotnet run` from there, or **`WorkingDirectory`** in **systemd**), unless **`HOMEBOT_DATABASE_PATH`** points elsewhere.

SQLite may also create **`homebot.db-wal`** and **`homebot.db-shm`** when write-ahead logging is active. **Copy all matching files** for a coherent backup.

### Why stop the app (simplest safe method)

While HomeBot is writing, copying only **`homebot.db`** with a plain file copy can produce a **corrupt or inconsistent** snapshot. The reliable approach for a small household bot:

1. **Stop** the process (close the terminal, stop the Task Scheduler task, or **`sudo systemctl stop homebot.service`** on Ubuntu).
2. **Copy** the database file(s) to another folder, drive, NAS, or cloud-synced directory.
3. **Start** HomeBot again.

Keep **multiple dated copies** (for example `homebot-2026-05-03.db`) so you can roll back if a bad restore or bug wipes data.

### Windows (manual)

1. Stop HomeBot (end **`dotnet`** / close the window running **`run-homebot.ps1`**).
2. In File Explorer, open your repo folder (or the folder set in **`HOMEBOT_DATABASE_PATH`**).
3. Copy **`homebot.db`** and, if present, **`homebot.db-wal`** and **`homebot.db-shm`**, to a backup location.
4. Start HomeBot again.

### Ubuntu (`systemd`)

```bash
sudo systemctl stop homebot.service
sudo -u homebot cp -a /opt/homebot/app/homebot.db /opt/homebot/backups/homebot-$(date +%F).db
# If WAL files exist next to the DB, copy them too:
sudo -u homebot test -f /opt/homebot/app/homebot.db-wal && sudo -u homebot cp -a /opt/homebot/app/homebot.db-wal /opt/homebot/backups/ || true
sudo -u homebot test -f /opt/homebot/app/homebot.db-shm && sudo -u homebot cp -a /opt/homebot/app/homebot.db-shm /opt/homebot/backups/ || true
sudo systemctl start homebot.service
```

Create **`/opt/homebot/backups`** once (`sudo mkdir -p /opt/homebot/backups && sudo chown homebot:homebot /opt/homebot/backups`).

### 20.1 Automated backups (optional)

The repo includes:

- **[`scripts/backup-homebot-sqlite.sh`](scripts/backup-homebot-sqlite.sh)** — **`sudo`** script: **`systemctl stop`** → copy **`homebot.db`** (+ **`-wal`** / **`-shm`** if present) with a timestamp → **`systemctl start`**. Defaults: app **`/opt/homebot/app`**, backups **`/opt/homebot/backups`**, service **`homebot.service`**. Install on the server, then **`chmod +x`**. Expects a **`homebot`** unix user (see [Section 8](#8-ubuntu-server--install-systemd-auto-start-on-reboot)).
- **[`scripts/systemd/homebot-sqlite-backup.service.example`](scripts/systemd/homebot-sqlite-backup.service.example)** and **[`scripts/systemd/homebot-sqlite-backup.timer.example`](scripts/systemd/homebot-sqlite-backup.timer.example)** — copy to **`/etc/systemd/system/`** (remove **`.example`**), adjust **`ExecStart`** paths, then **`sudo systemctl daemon-reload`**, **`sudo systemctl enable --now homebot-sqlite-backup.timer`**. The sample timer runs **weekly Sunday 03:15** (edit **`OnCalendar`** to taste).
- **[`scripts/backup-homebot-sqlite.ps1`](scripts/backup-homebot-sqlite.ps1)** — copies **`homebot.db`** (+ sidecars) into a **`backups`** folder under the repo root by default. **Stop HomeBot first** (or pass **`-Force`** if you accept risk while **`dotnet run`** is active). Schedule with **Task Scheduler** if you want a recurring job.

The **`backups/`** directory is **gitignored** so snapshots are not committed by accident.

### Online backup without stopping (advanced)

SQLite supports **online backup** APIs and tools (for example the **`sqlite3`** `.backup` command or application-level backup). HomeBot does not expose a built-in backup endpoint; use official SQLite documentation or a DBA tool if you need zero-downtime copies.

---

## Final checklist

| Check | Expected |
|-------|----------|
| **`GET …/api/health`** | OK from browser or `curl`. |
| **Discord** | Bot online; **`/setup-set`** bindings in place. |
| **Web UI** | Sign-in works; no CORS errors for your origin. |
| **GitHub Pages** (if used) | No 404 for assets under **`/REPO/`**; API URL in build matches production. |

Deeper behavior (rate limits, refresh flow, OpenAPI) is summarized in **[README.md](README.md)**.
