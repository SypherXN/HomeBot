# HomeBot — complete setup guide

Follow the sections **in order** unless a heading says “optional.” Each major step ends with a short **Confirm** checklist so you know you are ready for the next section.

**Related docs:** **[README.md](../README.md)** (quick reference); product capabilities — **[FEATURES.md](FEATURES.md)**; server internals — **[BACKEND.md](BACKEND.md)**; short Ubuntu install — **[UBUNTU_DEPLOY.md](UBUNTU_DEPLOY.md)**; hosting snippets — **[OPS.md](OPS.md)**.

**What you will have when you are done**

- A **Discord bot** in your server (slash commands, channel bindings for buy, wishlist, money, **budget**, calendar).
- One program serving an **HTTP API** (default port **5050**) and a **SQLite** database (`homebot.db` in the working folder unless you change **`HOMEBOT_DATABASE_PATH`**).
- A **Web UI** in the browser (`npm run dev` on your PC, or a static build on **GitHub Pages** if you choose that path later).

**Words used in this guide**

| Term | Meaning |
|------|--------|
| **Repository root** | The folder that contains **`HomeBot.csproj`** (after you clone or unzip the project). |
| **`webui`** | The React app folder inside the repo; run **`npm`** commands from here. |
| **`.env`** | A text file of **`KEY=value`** lines read by **you** (or **systemd**) before starting HomeBot — the app does **not** open `.env` by itself. |
| **Guild / server ID** | The numeric id of your Discord server — **`DISCORD_GUILD_ID`**. |

**Important:** Load **`.env`** into the process environment before **`dotnet run`**. On Windows: PowerShell (below), **`scripts/run-homebot.ps1`**, or your editor’s **`envFile`**. On Ubuntu: **`systemd`** **`EnvironmentFile=`** ([Section 8](#8-ubuntu-server--install-systemd-auto-start-on-reboot)).

---

## Table of contents

1. [Overview — what to do in what order](#1-overview--what-to-do-in-what-order)
2. [Prerequisites](#2-prerequisites) — [§2.5 Free VM walkthrough](#25-free-vm-hosting-optional) (Oracle, DuckDNS, Caddy, Pages, Drive)
3. [GitHub and source code](#3-github-and-source-code)
4. [Discord — application, bot token, invite, server ID](#4-discord--application-bot-token-invite-server-id)
5. [Environment files: `.env` and `webui/.env`](#5-environment-files-env-and-webuienv)
6. [Run HomeBot on Windows (first time)](#6-run-homebot-on-windows-first-time)
7. [Windows — start automatically on sign-in or boot](#7-windows-start-automatically-on-sign-in-or-boot)
8. [Ubuntu server — install, `systemd`, auto-start on reboot](#8-ubuntu-server--install-systemd-auto-start-on-reboot) — **short path:** [UBUNTU_DEPLOY.md](UBUNTU_DEPLOY.md)
9. [Web UI on your PC](#9-web-ui-on-your-pc)
10. [Discord — finish in-server setup (`/setup-set`)](#10-discord--finish-in-server-setup-setup-set)
11. [Web accounts — sign in, Discord verify, bootstrap](#11-web-accounts--sign-in-discord-verify-bootstrap)
12. [Optional — Discord OAuth (“Continue with Discord”)](#12-optional--discord-oauth-continue-with-discord)
13. [Optional — GitHub Pages (static Web UI)](#13-optional--github-pages-static-web-ui)
14. [Optional — public HTTPS API (reverse proxy)](#14-optional--public-https-api-reverse-proxy)
15. [Phone or another PC on your LAN (Windows dev)](#15-phone-or-another-pc-on-your-lan-windows-dev)
16. [Tests, lint, and GitHub Actions](#16-tests-lint-and-github-actions)
17. [Troubleshooting](#17-troubleshooting)
18. [Reference — how configuration works](#18-reference--how-configuration-works)
19. [Reference — every environment variable](#19-reference--every-environment-variable)
20. [Backing up SQLite (`homebot.db`)](#20-backing-up-sqlite-homebotdb) — [20.1 Local / automated](#201-automated-backups-optional) · [20.2 Google Drive](#202-off-site-backup-to-google-drive-optional)
21. [Final checklist](#final-checklist)

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
| 7 | In Discord, run **`/setup-set`** to bind features to channels (including **`budget`**) | [Section 10](#10-discord--finish-in-server-setup-setup-set) |
| 8 | Create your **first web account**, then **Sign in** | [Section 11](#11-web-accounts--sign-in-discord-verify-bootstrap) |
| 9 | (Optional) OAuth button, **GitHub Pages**, **HTTPS** for the API, **GitHub Actions** CI | [Section 12](#12-optional--discord-oauth-continue-with-discord)–[Section 14](#14-optional--public-https-api-reverse-proxy), [Section 16](#16-tests-lint-and-github-actions) |
| 10 | (Ongoing) **Back up** SQLite locally and optionally to **Google Drive** (retention) | [Section 20](#20-backing-up-sqlite-homebotdb) · [20.1](#201-automated-backups-optional) · [20.2](#202-off-site-backup-to-google-drive-optional) |

**Which sections apply to you**

| You are… | Follow |
|----------|--------|
| **Windows — bot and Web UI on the same PC** | Sections **2 → 7** (skip **8**), then **9 → 11**. Confirm API and bot at [Section 6.2](#62-confirm-bot-and-api-are-running). |
| **Ubuntu — bot on a server, Web UI on your PC** | Sections **2 → 5**, then **8** on the server and **9 → 11** on your PC (skip **6–7**). Point **`webui/.env`** at the server API when it is not on localhost ([Section 9](#93-open-the-app-in-your-browser)). No server yet? [Section 2.5](#25-free-vm-hosting-optional). |
| **Ubuntu — everything on one machine** | Sections **2 → 5**, **8**, **9 → 11** (skip **6–7**). |
| **Always-on cloud VM (free tier) + GitHub Pages** | [§2.5 Steps A–J](#25-free-vm-hosting-optional) (Oracle → HTTPS → Pages → CORS → Drive), then **10–11** |

When you finish **11**, work through the **[Final checklist](#final-checklist)**.

---

## 2. Prerequisites

You need the items below on the machine where you will **run HomeBot** and (for local Web UI) where you will run **`npm run dev`**. That is often the same Windows PC; on a headless Ubuntu server you may skip Node until you build the Web UI elsewhere.

| Requirement | Why |
|-------------|-----|
| **Discord account** with permission to **manage** a server (or your own test server) | Create the bot and invite it. |
| **Git** | Clone the repo and pull updates. |
| **.NET SDK 10** | Runs the bot and API (`net10.0` in the project file). |
| **Node.js 20+** and **npm** | Local Web UI dev server and build. |
| **GitHub account** | Only required for GitHub Pages ([Section 13](#13-optional--github-pages-static-web-ui)) or cloning from GitHub. |

### 2.1 Install Git

**Windows**

1. Download **Git for Windows** from [https://git-scm.com/download/win](https://git-scm.com/download/win) and run the installer (defaults are fine).
2. Open **PowerShell** and run:

   ```powershell
   git --version
   ```

   You should see a version string (for example **`git version 2.x`**).

**Ubuntu**

```bash
sudo apt update
sudo apt install -y git
git --version
```

### 2.2 Install .NET 10 SDK

**Windows**

1. Open [https://dotnet.microsoft.com/download](https://dotnet.microsoft.com/download) and install the **.NET 10 SDK** (not only the runtime) for your CPU (usually **x64**).
2. Close and reopen PowerShell, then:

   ```powershell
   dotnet --version
   ```

   Expect **`10.x.x`**. If the command is not found, sign out and back in, or reboot, then try again.

**Ubuntu** — see [Section 8.2](#82-net-10-sdk-microsoft-package-feed) for the Microsoft package feed, or use **[UBUNTU_DEPLOY.md](UBUNTU_DEPLOY.md)**.

### 2.3 Install Node.js and npm

**Windows**

1. Open [https://nodejs.org](https://nodejs.org) and install the **LTS** installer.
2. New PowerShell:

   ```powershell
   node --version
   npm --version
   ```

   Node should be **20** or higher.

**Ubuntu** — [Section 8.3](#83-nodejs-only-if-you-build-the-web-ui-on-this-server) if you build on the server.

### 2.4 Confirm prerequisites

- [ ] **`git --version`** works.
- [ ] **`dotnet --version`** shows **10.x**.
- [ ] **`node --version`** shows **20+** (on the PC where you will run the Web UI).
- [ ] You can open the [Discord Developer Portal](https://discord.com/developers/applications) in a browser.

### 2.5 Free VM hosting (optional)

Use this section if you want HomeBot **always online** (Discord + API) but **do not** want to leave your home PC running 24/7. You create a small **Ubuntu Linux VM** in the cloud, install HomeBot there, put **HTTPS** in front of the API, host the Web UI on **GitHub Pages**, and optionally back up to **Google Drive**.

**Before you start:** Finish [Section 4](#4-discord--application-bot-token-invite-server-id) (Discord bot token + guild ID) on your PC. You will paste those into the VM’s **`.env`** in Step E below. After the VM stack works, continue with [Sections 10–11](#10-discord--finish-in-server-setup-setup-set) (channel bindings + first web user).

#### What HomeBot needs from a host

| Requirement | Why |
|-------------|-----|
| **Always on** | Discord disconnects if the bot process stops. “Free” platforms that **sleep after idle** are a poor fit. |
| **Ubuntu 22.04 or 24.04** | Matches this guide and **`scripts/ubuntu/install-homebot.sh`**. |
| **~1 GB RAM minimum** (2 GB comfortable) | One .NET process + SQLite + optional **Caddy** reverse proxy. See [UBUNTU_DEPLOY.md — Resource expectations](UBUNTU_DEPLOY.md#resource-expectations-single-household). |
| **Public HTTPS hostname** (for GitHub Pages) | Browsers on **`https://…github.io`** cannot reliably call **`http://IP:5050`**. Use **Caddy** + a name like **`myhomebot.duckdns.org`**. |
| **Outbound internet** | Discord, Let’s Encrypt, optional **Google Drive** via **rclone**. |

**GitHub Pages** hosts the static Web UI for **free**; it does **not** run HomeBot. The **VM** runs the bot and API only.

#### Recommended $0 layout

| Piece | Where | Cost |
|-------|--------|------|
| **HomeBot + SQLite** | Oracle Always Free VM | $0 within free limits |
| **HTTPS API** | **Caddy** on the same VM | $0 |
| **API hostname** | [DuckDNS](https://www.duckdns.org) (or your own domain) | $0 |
| **Web UI** | **GitHub Pages** | $0 (public repos) |
| **Backups** | **Google Drive** + **rclone** | $0 within quota — [Section 20.2](#202-off-site-backup-to-google-drive-optional) |

#### Worksheet — fill in as you go

| Symbol | Meaning | Your value |
|--------|---------|------------|
| `YOUR_GITHUB_USER` | GitHub username | |
| `YOUR_REPO` | Repo name (e.g. `HomeBot`) | |
| `YOUR_VM_PUBLIC_IP` | VM public IPv4 from Oracle | |
| `YOUR_SSH_KEY_FILE` | Path to `.key` / `.pem` on Windows | |
| `YOUR_API_HOST` | Hostname only (e.g. `myhomebot.duckdns.org`) | |
| `YOUR_API_PUBLIC` | `https://YOUR_API_HOST` — **no** trailing slash | |
| `YOUR_PAGES_URL` | e.g. `https://YOUR_GITHUB_USER.github.io/YOUR_REPO/` | |
| `YOUR_PAGES_ORIGIN` | Scheme + host only (e.g. `https://YOUR_GITHUB_USER.github.io`) | |
| `YOUR_GUILD_ID` | Discord server ID | |
| `YOUR_DISCORD_TOKEN` | Bot token | *(password manager only)* |

#### Order of operations (do not skip HTTPS before Pages)

| Step | What | Section below |
|------|------|----------------|
| A | Create Oracle Always Free Ubuntu VM | [Step A](#step-a--create-an-oracle-always-free-vm) |
| B | Open cloud firewall (22, 80, 443) | [Step B](#step-b--open-oracles-cloud-firewall-security-list) |
| C | SSH in from Windows; update Ubuntu | [Step C](#step-c--first-ssh-login-from-windows) |
| D | Point DuckDNS (or your domain) at the VM | [Step D](#step-d--free-hostname-with-duckdns) |
| E | Install HomeBot on the VM | [Step E](#step-e--install-homebot-on-the-vm) |
| F | Reserve public IP (recommended) | [Step F](#step-f--reserve-a-stable-public-ip-oracle) |
| G | HTTPS with Caddy | [Step G](#step-g--https-with-caddy-required-for-github-pages) |
| H | GitHub Pages + API URL variable | [Step H](#step-h--github-pages-web-ui) |
| I | CORS in server `.env` | [Step I](#step-i--cors-on-the-server) |
| J | Google Drive backups (optional) | [Step J](#step-j--google-drive-backups-optional) |
| — | **Ongoing:** update VM after `git push` | [Updates after push](#updates-after-you-push-to-github) |

Then: [Section 10](#10-discord--finish-in-server-setup-setup-set) → [Section 11](#11-web-accounts--sign-in-discord-verify-bootstrap) on your PC / Pages.

**Note:** You can do **Step I** (CORS) **before Step H** if you already know **`YOUR_PAGES_ORIGIN`** from the worksheet (`https://YOUR_GITHUB_USER.github.io` — no repo path).

---

#### Step A — Create an Oracle Always Free VM

Do this in a browser at [Oracle Cloud Console](https://cloud.oracle.com/).

1. Sign up at [Oracle Cloud Free Tier](https://www.oracle.com/cloud/free/). A credit card may be required for **verification** — stay within **Always Free** shapes to avoid charges.
2. Top bar → pick a **home region** close to you that offers **Always Free eligible** compute.
3. Menu ☰ → **Compute** → **Instances** → **Create instance**.
4. Fill in:

   | Field | Choose |
   |-------|--------|
   | **Name** | e.g. `homebot` |
   | **Image** | **Ubuntu 22.04** or **24.04** (Canonical) |
   | **Shape** | **Change shape** → filter **Always Free eligible** → e.g. **VM.Standard.A1.Flex** with **1 OCPU**, **6 GB RAM** (ARM), or an eligible AMD shape |
   | **Networking** | Default VCN; **Assign a public IPv4 address** = **Yes** |

5. **SSH keys:** choose **Generate a key pair for me** → **Save private key** to a safe folder (`YOUR_SSH_KEY_FILE`). **You cannot download it again.**
6. Click **Create**. Wait until **State** = **Running**.
7. Copy **Public IP address** → `YOUR_VM_PUBLIC_IP`.

---

#### Step B — Open Oracle’s cloud firewall (Security List)

Oracle blocks inbound traffic until you allow it. This is **separate** from Ubuntu **`ufw`** (Step G).

1. On the instance page, click the **Subnet** link (under Primary VNIC).
2. Click the **Security list** for that subnet.
3. **Add Ingress Rules** (three rules):

   | Source CIDR | Protocol | Destination port |
   |-------------|----------|------------------|
   | `0.0.0.0/0` | TCP | **22** |
   | `0.0.0.0/0` | TCP | **80** |
   | `0.0.0.0/0` | TCP | **443** |

4. Save each rule.

**Do not** open port **5050** to the internet. HomeBot stays on **`127.0.0.1:5050`**; only **Caddy** on **443** is public.

---

#### Step C — First SSH login from Windows

Ubuntu images use login **`ubuntu`** (not `opc`).

Fix key permissions once (Windows):

```powershell
icacls "C:\path\to\your-key.key" /inheritance:r
icacls "C:\path\to\your-key.key" /grant:r "$($env:USERNAME):(R)"
```

Connect:

```powershell
ssh -i "C:\path\to\your-key.key" ubuntu@YOUR_VM_PUBLIC_IP
```

Type **yes** to trust the host the first time.

On the VM, update packages:

```bash
sudo apt update
sudo apt upgrade -y
```

Reboot if prompted (`sudo reboot`), wait ~1 minute, SSH in again.

Enable **`ufw`** for SSH only for now (ports **80/443** come in Step G):

```bash
sudo apt install -y ufw
sudo ufw allow OpenSSH
sudo ufw enable
sudo ufw status
```

---

#### Step D — Free hostname with DuckDNS

**Why:** Let’s Encrypt, GitHub Pages, and iPhone Safari need a **hostname**, not only an IP. **DuckDNS is free** (optional supporter donations; no payment required for a subdomain).

**If you own a domain:** create an **A record** `api.yourdomain.com` → `YOUR_VM_PUBLIC_IP`, set `YOUR_API_HOST` to that name, skip DuckDNS.

**DuckDNS (free):**

1. Open [https://www.duckdns.org](https://www.duckdns.org) → **sign in** (Google, GitHub, Reddit, etc.).
2. Under **sub domain**, enter a label (e.g. **`myhomebot`**) → **add domain**.
3. Set **current ip** to **`YOUR_VM_PUBLIC_IP`** → **update ip**.
4. Copy your **token** from the DuckDNS account page (shown near your domains). Store it in a password manager — not in Git.
5. Worksheet: `YOUR_API_HOST` = `myhomebot.duckdns.org` (your label + `.duckdns.org`).

Verify from Windows:

```powershell
nslookup YOUR_API_HOST
```

**Auto-update on the VM (recommended):** if the public IP ever changes, DuckDNS should track it without manual edits. SSH to the VM:

```bash
sudo mkdir -p /opt/duckdns
sudo nano /opt/duckdns/duck.sh
```

Paste (replace **`myhomebot`** and **`YOUR_DUCKDNS_TOKEN`**):

```bash
#!/bin/bash
echo url="https://www.duckdns.org/update?domains=myhomebot&token=YOUR_DUCKDNS_TOKEN&ip=" | curl -k -o /opt/duckdns/duck.log -K -
```

```bash
sudo chmod 700 /opt/duckdns/duck.sh
sudo /opt/duckdns/duck.sh && cat /opt/duckdns/duck.log
```

Expect **`OK`**. Schedule every 5 minutes:

```bash
sudo crontab -e
```

Add:

```cron
*/5 * * * * /opt/duckdns/duck.sh >/dev/null 2>&1
```

Step F (reserved IP) still helps avoid Let's Encrypt hiccups; the cron is a safety net.

If the VM IP changes later, DuckDNS updates automatically when cron runs (or run **`/opt/duckdns/duck.sh`** once). Step F helps prevent surprise IP changes.

---

#### Step E — Install HomeBot on the VM

**Important:** Run the installer from a **git clone**. It needs **`scripts/ubuntu/_common.sh`** — curling only `install-homebot.sh` **fails**.

On the VM (replace GitHub user and repo):

```bash
sudo apt install -y git
git clone https://github.com/YOUR_GITHUB_USER/YOUR_REPO.git /tmp/HomeBot
cd /tmp/HomeBot
sudo bash scripts/ubuntu/install-homebot.sh https://github.com/YOUR_GITHUB_USER/YOUR_REPO.git
```

The script installs .NET, creates user **`homebot`**, clones to **`/opt/homebot/app`**, publishes, and installs **`homebot.service`**. On first run it often **exits** and asks you to edit **`.env`** — normal.

Edit secrets:

```bash
sudo -u homebot nano /opt/homebot/app/.env
```

Minimum (from [Section 4](#4-discord--application-bot-token-invite-server-id)):

```env
DISCORD_TOKEN=paste-from-password-manager
DISCORD_GUILD_ID=YOUR_GUILD_ID
HOMEBOT_API_ENABLED=true
HOMEBOT_API_TOKEN=long-random-secret-1
HOMEBOT_WEB_JWT_SECRET=long-random-secret-at-least-32-characters
```

Generate on the VM: `openssl rand -base64 32` (run twice for the two secrets).

Start and verify:

```bash
sudo systemctl restart homebot.service
sudo systemctl status homebot.service
curl -sS http://127.0.0.1:5050/api/health
```

Discord should show the bot **online**. More detail: **[UBUNTU_DEPLOY.md](UBUNTU_DEPLOY.md)** or [Section 8](#8-ubuntu-server--install-systemd-auto-start-on-reboot).

---

#### Step F — Reserve a stable public IP (Oracle)

Without a **reserved** IP, stopping the VM can assign a **new** public IP → DuckDNS and HTTPS break.

1. Oracle Console → **Networking** → **IP management** → **Reserved public IPs** (wording may vary).
2. **Reserve** an address in your compartment/region.
3. **Attach** it to your instance’s primary VNIC.
4. If the IP changed, update **DuckDNS** (Step D) and worksheet `YOUR_VM_PUBLIC_IP`.

---

#### Step G — HTTPS with Caddy (required for GitHub Pages)

Browsers on **`https://…github.io`** block calling a plain **`http://`** API. **Caddy** terminates HTTPS and forwards to HomeBot.

**G.1 — Bind HomeBot to localhost**

```bash
sudo -u homebot nano /opt/homebot/app/.env
```

Set:

```env
HOMEBOT_API_URL=http://127.0.0.1:5050
```

```bash
sudo systemctl restart homebot.service
curl -sS http://127.0.0.1:5050/api/health
```

**G.2 — Install and configure Caddy**

```bash
sudo apt update
sudo apt install -y caddy
sudo nano /etc/caddy/Caddyfile
```

Replace with your hostname (example):

```caddy
myhomebot.duckdns.org {
    encode gzip
    reverse_proxy 127.0.0.1:5050
}
```

Use your real `YOUR_API_HOST` instead of `myhomebot.duckdns.org`.

```bash
sudo systemctl enable --now caddy
sudo systemctl status caddy
```

**G.3 — Open 80 and 443 on Ubuntu**

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw status
```

**G.4 — Test from Windows**

```powershell
curl https://YOUR_API_HOST/api/health
```

Set `YOUR_API_PUBLIC` = `https://YOUR_API_HOST` (no trailing slash).

If Caddy fails: `journalctl -u caddy -n 50 --no-pager` — usually DNS not pointing here yet or Oracle Security List missing **80/443**.

More proxy options: [Section 14](#14-optional--public-https-api-reverse-proxy).

---

#### Step H — GitHub Pages (Web UI)

Do this in the browser on **github.com** (your PC). **Prerequisite:** **`YOUR_API_PUBLIC`** from Step G must work (`curl https://YOUR_API_HOST/api/health`).

1. **Settings** → **Pages** → **Build and deployment** → **Source** → **GitHub Actions** (not “Deploy from a branch”).
2. **Settings** → **Secrets and variables** → **Actions** → **Variables** → **New repository variable**
   - Name: **`HOMEBOT_API_PUBLIC_URL`**
   - Value: **`YOUR_API_PUBLIC`** (e.g. `https://myhomebot.duckdns.org`) — **no trailing slash**
   - **Required** for a working remote Web UI. Without it, Pages may deploy but the built app still calls **`localhost:5050`**.
3. (Optional) **Variables** → **`HOMEBOT_WEBUI_BASE_PATH`** — only if your Pages URL is not the default project layout **`/REPO_NAME/`** ([Section 13.1](#131-urls-and-vite-base-path)).
4. Trigger a build — push to **`main`** that touches **`webui/**`**, or **Actions** → **Deploy Web UI to GitHub Pages** → **Run workflow**.
5. Open **Actions** → **Deploy Web UI to GitHub Pages**. The **build** job must succeed before **deploy** runs.
   - First run may require approving the **`github-pages`** environment under **Settings** → **Environments**.
   - If **build** fails, open the log. Reproduce locally: `cd webui && npm ci && npm run lint && npm run test && npm run build` ([Section 16](#16-tests-lint-and-github-actions)).
6. After a green run, open **`https://YOUR_GITHUB_USER.github.io/YOUR_REPO/`**.
7. Worksheet:
   - `YOUR_PAGES_ORIGIN` = `https://YOUR_GITHUB_USER.github.io` (no path)
   - `YOUR_PAGES_URL` = full URL with repo path

Press **F12** → **Network** — API calls should target **`YOUR_API_PUBLIC`**, not `localhost`.

Full detail: [Section 13](#13-optional--github-pages-static-web-ui).

---

#### Step I — CORS on the server

Do this **after** you know `YOUR_PAGES_ORIGIN` from Step H.

```bash
sudo -u homebot nano /opt/homebot/app/.env
```

Add or update:

```env
HOMEBOT_ALLOWED_ORIGINS=https://YOUR_GITHUB_USER.github.io,http://localhost:5173
ASPNETCORE_ENVIRONMENT=Production
```

Use **`YOUR_PAGES_ORIGIN`** exactly (scheme + host, **no** `/HomeBot` path). Keep `localhost:5173` if you still use `npm run dev` on your PC.

```bash
sudo systemctl restart homebot.service
```

Reload Pages in the browser — the console should show **no CORS errors**.

Optional **Discord OAuth** for “Continue with Discord”: [Section 12](#12-optional--discord-oauth-continue-with-discord) + [Section 13.3](#133-api-environment-for-pages--oauth).

---

#### Step J — Google Drive backups (optional)

On the VM:

```bash
sudo apt install -y rclone
sudo -u homebot rclone config
```

Create remote **`gdrive`** → **Google Drive** → complete OAuth. Test: `sudo -u homebot rclone lsd gdrive:`

Add to **`/opt/homebot/app/.env`**:

```env
HOMEBOT_GDRIVE_BACKUP_ENABLED=true
HOMEBOT_GDRIVE_RCLONE_REMOTE=gdrive
HOMEBOT_GDRIVE_BACKUP_PATH=HomeBot/backups
HOMEBOT_GDRIVE_RETENTION_DAYS=90
HOMEBOT_LOCAL_BACKUP_RETENTION_DAYS=30
HOMEBOT_BACKUP_DIR=/opt/homebot/backups
```

```bash
sudo mkdir -p /opt/homebot/backups
sudo chown homebot:homebot /opt/homebot/backups
sudo chmod +x /opt/homebot/app/scripts/backup-homebot-with-gdrive.sh
sudo bash /opt/homebot/app/scripts/backup-homebot-with-gdrive.sh
```

Weekly timer:

```bash
sudo cp /opt/homebot/app/scripts/systemd/homebot-backup-with-gdrive.service.example /etc/systemd/system/homebot-backup-with-gdrive.service
sudo cp /opt/homebot/app/scripts/systemd/homebot-backup-with-gdrive.timer.example /etc/systemd/system/homebot-backup-with-gdrive.timer
sudo systemctl daemon-reload
sudo systemctl enable --now homebot-backup-with-gdrive.timer
```

Full detail: [Section 20.2](#202-off-site-backup-to-google-drive-optional).

---

#### Updates after you push to GitHub

HomeBot uses **three separate** GitHub Actions workflows. Only some need your VM to be set up first.

| Workflow | Runs on | Needs VM? | What it does |
|----------|---------|-----------|--------------|
| **[CI](../.github/workflows/ci.yml)** | Every push/PR to **`main`** | **No** | **`dotnet test`** + **`npm run lint`**, **`test`**, **`build`** — validates the repo on GitHub’s runners. |
| **[Deploy Web UI to GitHub Pages](../.github/workflows/pages-webui.yml)** | Push to **`main`** when **`webui/**`** changes (or manual) | **No** for the build; **yes** for a *working* site (API must be live + CORS) | Builds static **`webui/dist`** and publishes to Pages. Set **`HOMEBOT_API_PUBLIC_URL`** ([Step H](#step-h--github-pages-web-ui)). |

**Update the bot on your VM (manual — GitHub does not SSH to the server):**

```bash
sudo bash /opt/homebot/app/scripts/ubuntu/update-homebot.sh
```

Same as [Section 8.8](#88-updates-after-git-pull). Your **`.env`** and **`homebot.db`** are not overwritten.

Detail: **[OPS.md](OPS.md)** · **[UBUNTU_DEPLOY.md](UBUNTU_DEPLOY.md) §5**.

---

#### Other hosting options (honest notes)

| Option | Notes |
|--------|--------|
| **Home PC** | No cloud bill; keep PC on; use [Sections 6–7](#6-run-homebot-on-windows-first-time); HTTPS harder for Pages from outside LAN. |
| **Google Cloud `e2-micro`** | Small always-free VM in select regions — read Google’s current free tier before relying on it. |
| **AWS / Azure free trial** | Often **12 months** then paid. |
| **Hetzner / DigitalOcean** | ~€4–6/month — good if Oracle capacity is blocked in your region. |
| **Render / Railway / Fly free** | Often **sleep on idle** — **not** suitable for Discord. |
| **HTTP tunnel only** | **HTTPS Pages** + **HTTP** tunnel = **mixed content** blocked. Use Caddy on a VM. |

---

#### Confirm (free VM + Pages stack)

- [ ] `ssh -i ... ubuntu@YOUR_VM_PUBLIC_IP` works from Windows.
- [ ] Oracle Security List + **`ufw`** allow **22**, **80**, **443** (not **5050** to the world).
- [ ] `curl https://YOUR_API_PUBLIC/api/health` works from Windows.
- [ ] **`HOMEBOT_API_PUBLIC_URL`** set; **Deploy Web UI to GitHub Pages** workflow **build** job green.
- [ ] GitHub Pages loads; Network tab calls **`YOUR_API_PUBLIC`** (not **`localhost`**).
- [ ] No CORS errors after Step I.
- [ ] **CI** workflow green on **`main`** (sanity check — no VM required).
- [ ] Bot **online** in Discord; `/setup-set` + first web user done ([Sections 10–11](#10-discord--finish-in-server-setup-setup-set)).
- [ ] (Optional) Backup file visible on Google Drive.

---

## 3. GitHub and source code

### 3.1 Get the project onto your machine

**Option A — Clone from GitHub (recommended)**

Replace **`OWNER/HomeBot`** with your fork or the upstream repository URL.

**Windows (PowerShell):**

```powershell
cd $HOME\Desktop
git clone https://github.com/OWNER/HomeBot.git
cd HomeBot
```

**Ubuntu:**

```bash
cd ~
git clone https://github.com/OWNER/HomeBot.git
cd HomeBot
```

**Option B — Download ZIP**

1. On GitHub, open the repository → **Code** → **Download ZIP**.
2. Extract to a folder (for example **`Desktop\HomeBot`**).
3. Open PowerShell or a terminal **inside that folder** for all later commands.

The **repository root** is the folder containing **`HomeBot.csproj`**. All paths in this guide assume you are in that folder unless stated otherwise.

### 3.2 Confirm the folder layout

You should see (among other items):

- **`HomeBot.csproj`**
- **`.env.example`**
- **`webui/`** (contains **`package.json`**)
- **`scripts/`**

If **`HomeBot.csproj`** is missing, you are not in the repository root.

### 3.3 Stay up to date

From the repository root:

```bash
git pull
```

After pulling on an **Ubuntu server**, rebuild and restart ([Section 8.8](#88-updates-after-git-pull)).

---

## 4. Discord — application, bot token, invite, server ID

Do this **once** per Discord “application” (your HomeBot identity).

### 4.1 Create the application

1. Open **[Discord Developer Portal — Applications](https://discord.com/developers/applications)** and sign in.
2. Click **New Application**, choose a name (e.g. **HomeBot**), create it.
3. Open the **Bot** tab on the left.
4. Click **Add Bot** (confirm if asked).
5. Under **Token**, click **Reset Token** (or **View Token**), confirm, and **copy** the token **immediately** — Discord shows it only once.  
   - This string is your **`DISCORD_TOKEN`**. **Never** paste it into GitHub or the Web UI bundle; only into **`.env`** on machines that run HomeBot.  
   - If you reset the token later, update **`.env`** and restart HomeBot; the old token stops working.

### 4.2 Gateway intents (required for a healthy bot)

HomeBot starts the gateway with **`GatewayIntents.All`**. In the **Bot** tab, under **Privileged Gateway Intents**, turn **on** all three toggles Discord lists there (**Presence**, **Server Members**, **Message Content**). If any stay off, the bot may fail to connect or member lists in the Web UI may stay empty. After changing toggles, restart HomeBot.

### 4.3 Invite URL (add the bot to your server)

1. Open **OAuth2** → **URL Generator**.
2. Under **Scopes**, check **`bot`** and **`applications.commands`** (slash commands require the latter).
3. Under **Bot Permissions**, a practical starting set includes: **View Channels**, **Send Messages**, **Embed Links**, **Attach Files**, **Read Message History**, **Add Reactions**, **Use Slash Commands** (exact names may vary slightly in the UI).
4. Copy the generated **URL** at the bottom, paste it into your browser, pick your **household server**, authorize.

You should see the bot join as **offline** until HomeBot runs with a valid token.

**Confirm**

- [ ] The bot appears in your server’s member list (may show **offline**).
- [ ] You saved the **bot token** somewhere safe (password manager or local **`.env`** only).

### 4.4 Copy your **Server (guild) ID** — `DISCORD_GUILD_ID`

1. In the Discord **desktop or web** app: **User Settings** → **App Settings** → **Advanced** → enable **Developer Mode**.
2. In the server list, **right‑click your server icon** → **Copy Server ID**.
3. That number (digits only) is **`DISCORD_GUILD_ID`**. Slash commands register to **this** server.

**Confirm**

- [ ] **`DISCORD_GUILD_ID`** is digits only (no spaces).
- [ ] You invited the bot to **that same server**.

### 4.5 OAuth2 client (only if you will use “Continue with Discord”)

Skip until [Section 12](#12-optional--discord-oauth-continue-with-discord). When needed: **OAuth2** → **General** → copy **Client ID** and **Client Secret**; add redirect URLs under **Redirects** (must match **`HOMEBOT_DISCORD_OAUTH_REDIRECT_URI`** exactly).

---

## 5. Environment files: `.env` and `webui/.env`

### 5.1 Create the files

From the **repository root** (same folder as `HomeBot.csproj`):

**Windows (PowerShell):**

```powershell
cd C:\path\to\HomeBot
Copy-Item .env.example .env
Copy-Item webui\.env.example webui\.env
```

**macOS / Linux:**

```bash
cd /path/to/HomeBot
cp .env.example .env
cp webui/.env.example webui/.env
```

Or copy the two files manually in your file manager. **`.env` is gitignored** — it must never be committed.

### 5.2 Fill in required values (Discord + API + Web sign-in)

Open **`.env`** in a text editor (Notepad, VS Code, etc.). Set these lines — **no quotes** around values unless the value itself contains spaces (rare).

| Line | What to paste |
|------|----------------|
| **`DISCORD_TOKEN=`** | Bot token from [Section 4.1](#41-create-the-application) |
| **`DISCORD_GUILD_ID=`** | Server id from [Section 4.4](#44-copy-your-server-guild-id--discord_guild_id) |
| **`HOMEBOT_API_ENABLED=`** | **`true`** (lowercase) |
| **`HOMEBOT_API_TOKEN=`** | A long random secret you invent (see below) |
| **`HOMEBOT_WEB_JWT_SECRET=`** | Another long random secret, **at least 32 characters** |

Example shape (use **your** values, not these):

```env
DISCORD_TOKEN=MTxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
DISCORD_GUILD_ID=1234567890123456789
HOMEBOT_API_ENABLED=true
HOMEBOT_API_TOKEN=k7H9pQ2mN4vR8sL1wX6yZ0aB3cD5eF7gH9jK2
HOMEBOT_WEB_JWT_SECRET=another-long-random-secret-at-least-32-characters-long
```

**Generate random secrets (pick one method)**

**PowerShell (Windows):**

```powershell
# Run twice — use first output for HOMEBOT_API_TOKEN, second for HOMEBOT_WEB_JWT_SECRET
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 40 | ForEach-Object { [char]$_ })
```

**Linux / macOS:**

```bash
openssl rand -base64 32
```

- **`HOMEBOT_API_TOKEN`** — optional shared secret for scripts; the Web UI normally uses a **JWT** from **Sign in**, not this token.
- **`HOMEBOT_WEB_JWT_SECRET`** — **never** put this in the Web UI or Discord; server only; signs login JWTs.

**`.env.example` leaves some keys commented** (for example **`HOMEBOT_API_ENABLED`**). You must still **add** the lines from the table above with real values — copying the example file alone is not enough.

Leave other lines in **`.env.example`** commented until you need OAuth, custom URLs, or budget digest timing.

**Confirm**

- [ ] **`.env`** exists in the **repository root** (same folder as **`HomeBot.csproj`**).
- [ ] **`DISCORD_TOKEN`** and **`DISCORD_GUILD_ID`** are filled in (no placeholder text).
- [ ] **`HOMEBOT_WEB_JWT_SECRET`** is at least 32 characters.
- [ ] You did **not** commit **`.env`** to Git (it should stay local only).

### 5.3 Web UI build-time defaults (`webui/.env`)

For local development, defaults are usually fine:

```env
VITE_API_BASE_URL=http://localhost:5050
VITE_BASE_PATH=/
```

Change **`VITE_API_BASE_URL`** if the API listens elsewhere (for example your Ubuntu server at **`http://192.168.1.10:5050`**). After you edit **`webui/.env`**, stop and restart **`npm run dev`** so Vite picks up the change.

For **GitHub Pages** project sites you will set **`VITE_BASE_PATH=/YourRepoName/`** at **build** time ([Section 13](#13-optional--github-pages-static-web-ui)).

**Confirm**

- [ ] **`webui/.env`** exists.
- [ ] **`VITE_API_BASE_URL`** points at where the API will run (usually **`http://localhost:5050`** on the same PC).

### 5.4 Optional — budget alerts and weekly digest (later)

Defaults work for most households. Uncomment in **`.env`** only when you want to change behavior (then **restart HomeBot**):

| Variable | Purpose |
|----------|---------|
| **`HOMEBOT_BUDGET_LARGE_EXPENSE_USD`** | Discord alert when a single expense exceeds this amount (default **500**). |
| **`HOMEBOT_BUDGET_DIGEST_DAY`** | Weekday for the weekly summary in the **budget** channel (name like **`Sunday`** or **0–6**, Sunday = 0). |
| **`HOMEBOT_BUDGET_DIGEST_UTC_HOUR`** | Hour in **UTC** for that digest (**0–23**, default **17**). |

Alerts and the digest only post after you bind **`budget`** with **`/setup-set`** ([Section 10](#10-discord--finish-in-server-setup-setup-set)).

---

## 6. Run HomeBot on Windows (first time)

Prerequisites: [Section 2](#2-prerequisites) and [Section 5](#5-environment-files-env-and-webuienv) complete.

### 6.1 Load environment variables and run

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

**C — Helper script (recommended for daily use):**

```powershell
cd C:\path\to\HomeBot
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\run-homebot.ps1
```

If you do not have **PowerShell 7** (`pwsh`), use **`powershell`** instead of **`pwsh`** in that command.

The script loads **`.env`** from the repo root and runs **`dotnet run`**. If **`.env`** is missing, it prints an error pointing you to this guide.

**First run:** the first **`dotnet run`** may take a minute while NuGet packages restore. Later starts are faster.

**What you should see in the terminal**

- A line like **`API listening on http://0.0.0.0:5050`** (or your **`HOMEBOT_API_URL`**).
- **`HomeBot connected as YourBotName#1234`** (or similar) when Discord is enabled and the token is valid.
- No repeated crash loop; the window stays open.

Leave this terminal **running**. Open a **second** terminal for the Web UI ([Section 9](#9-web-ui-on-your-pc)).

### 6.2 Confirm bot and API are running

With HomeBot still running, open **another** PowerShell window:

```powershell
Invoke-WebRequest -Uri http://localhost:5050/api/health -UseBasicParsing | Select-Object -ExpandProperty Content
```

You should see JSON containing **`"status":"ok"`** (or **`status": "ok"`**).

In Discord, your bot should show **online** (green). Type **`/`** in a channel; after a few seconds you should see HomeBot slash commands (for example **`/help`**). If commands do not appear, check **`DISCORD_GUILD_ID`** and restart HomeBot.

**Confirm**

- [ ] **`/api/health`** returns OK.
- [ ] Bot is **online** in Discord.
- [ ] Slash commands appear when you type **`/`** (may take up to a minute after first start).

### 6.3 Firewall (other devices on your LAN)

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
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\run-homebot.ps1
```

Use the same script as daily runs so **`.env`** is loaded. Plain **`dotnet run`** without loading **`.env`** will fail if secrets are only in the file.

**Confirm**

- [ ] Task Scheduler action points at the correct repo path and **`run-homebot.ps1`**.
- [ ] After a test reboot or logon, the bot is **online** in Discord and **`/api/health`** responds.

---

## 8. Ubuntu server — install, `systemd`, auto-start on reboot

**No server yet?** Read [Section 2.5 — Free VM hosting](#25-free-vm-hosting-optional) (Oracle Always Free, DuckDNS, GitHub Pages layout).

**Want the shortest path?** Use **[UBUNTU_DEPLOY.md](UBUNTU_DEPLOY.md)** — one install script, one update script, and a small troubleshooting table.

**Quick install (on the server, after cloning or with the repo URL):**

```bash
sudo bash scripts/ubuntu/install-homebot.sh https://github.com/OWNER/HomeBot.git
sudo -u homebot nano /opt/homebot/app/.env    # fill DISCORD_TOKEN, DISCORD_GUILD_ID, API secrets
sudo systemctl restart homebot.service
curl -sS http://127.0.0.1:5050/api/health
```

**Updates later:** `sudo bash /opt/homebot/app/scripts/ubuntu/update-homebot.sh`

The subsections below are the **manual equivalent** of the same layout (`/opt/homebot/app`, user **`homebot`**, unit **`homebot.service`**). Adjust URLs if Microsoft’s docs change: **[Install .NET on Ubuntu](https://learn.microsoft.com/dotnet/core/install/linux-ubuntu)**.

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

Copy the example unit (or create the same file by hand):

```bash
sudo cp /opt/homebot/app/scripts/systemd/homebot.service.example /etc/systemd/system/homebot.service
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

**Confirm**

- [ ] **`curl -sS http://127.0.0.1:5050/api/health`** returns JSON with **`"status":"ok"`**.
- [ ] **`journalctl -u homebot.service`** shows no crash loop.
- [ ] Discord shows the bot **online** (when Discord is enabled).

### 8.8 Updates after `git pull`

```bash
sudo bash /opt/homebot/app/scripts/ubuntu/update-homebot.sh
```

(Manual equivalent: `git pull`, `dotnet publish`, `systemctl restart` — see [UBUNTU_DEPLOY.md](UBUNTU_DEPLOY.md).)

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

HomeBot must already be running with **`HOMEBOT_API_ENABLED=true`** ([Section 6](#6-run-homebot-on-windows-first-time) or [Section 8](#8-ubuntu-server--install-systemd-auto-start-on-reboot)).

### 9.1 Install Web UI dependencies (first time only)

Open a **new** terminal (keep HomeBot running in the first one).

**Windows:**

```powershell
cd C:\path\to\HomeBot\webui
npm install
```

**Ubuntu (on your dev PC or server):**

```bash
cd /path/to/HomeBot/webui
npm install
```

This downloads packages into **`webui/node_modules`**. It can take a few minutes.

### 9.2 Start the dev server

From **`webui`**:

```bash
npm run dev
```

The terminal prints a local URL, usually:

```text
  ➜  Local:   http://localhost:5173/
```

### 9.3 Open the app in your browser

1. Open **`http://localhost:5173`** (or the URL Vite printed).
2. Look at the **top of the page** for connection status:
   - **Connected** (green dot) — the browser reached **`/api/health`**.
   - **Cannot reach API** — HomeBot is not running, **`VITE_API_BASE_URL`** / **`webui/.env`** is wrong, or a firewall blocked port **5050**. Fix [Section 6](#6-run-homebot-on-windows-first-time) or your server install first.
   - **Token not accepted** — you are signed in but the stored token is invalid; open **Settings** or **Sign in** again ([Section 11](#11-web-accounts--sign-in-discord-verify-bootstrap)).
3. Optional: open **`/health`** in the browser for raw **`/api/health`** and **`/api/meta`** JSON.

You can browse the sidebar while signed out, but **Buy**, **Budget**, and other write actions need an account ([Section 11](#11-web-accounts--sign-in-discord-verify-bootstrap)).

**Confirm**

- [ ] **`npm run dev`** is running without errors.
- [ ] The browser loads the HomeBot UI (sidebar: Home, Buy, Wishlist, Money, Budget, Calendar, Settings).
- [ ] Connection indicator does **not** say the API is unreachable.

---

## 10. Discord — finish in-server setup (`/setup-set`)

Slash commands are registered only on the server whose id is **`DISCORD_GUILD_ID`**. The bot must be **online** ([Section 6.2](#62-confirm-bot-and-api-are-running)).

### 10.1 Pick channels

Decide which text channel each feature uses. Common layout:

| Feature key | Typical channel purpose |
|-------------|-------------------------|
| **`buy`** | Grocery / shopping list |
| **`wishlist`** | Gift ideas |
| **`money`** | Shared expenses between people |
| **`budget`** | Household budget commands, alerts, weekly digest |
| **`calendar`** | Events and reminders |
| **`audit`** | (Optional) Log when someone signs into the Web UI |

Create those channels in Discord if they do not exist yet.

### 10.2 Bind each feature (step by step)

In Discord, go to the channel you want for **buy** (for example **`#shopping`**).

1. Type **`/setup-set`** and press Enter.
2. For **feature**, choose **`buy`**.
3. For **channel**, pick **`#shopping`** (the current channel is usually easiest).
4. Submit. Discord should confirm the binding.

Repeat for each feature you use:

```text
/setup-set   feature: wishlist   channel: #wishlist
/setup-set   feature: money      channel: #money
/setup-set   feature: budget     channel: #budget
/setup-set   feature: calendar   channel: #calendar
```

(Optional) **`/setup-set feature: audit channel: #mod-log`** if you want sign-in audit lines.

### 10.3 Verify bindings

Run **`/setup-view`**. Discord lists which feature is tied to which channel.

Run **`/help`** with topic **`setup`** for a reminder of how bindings work.

**Behavior after binding:** Most **`/buy-*`**, **`/wishlist-*`**, **`/money-*`**, **`/budget-*`**, and **`/calendar-*`** commands only work in the channel you bound. **`/setup-set`**, **`/config-set`**, **`/help`**, and **`/undo`** work in any channel.

**Permissions:** The bot’s role must be allowed to **View Channel**, **Send Messages**, and **Use Application Commands** in each bound channel. If commands fail silently, check channel overrides and that the bot can see the channel.

**Confirm**

- [ ] **`/setup-view`** shows your channels.
- [ ] **`/buy-list`** (or **`/budget-summary`**) works in the bound channel and is rejected or ignored elsewhere (if you test a wrong channel).

---

## 11. Web accounts — sign in, Discord verify, bootstrap

The Web UI needs at least one row in the **`WebUsers`** table. The **first** account is created from the browser; later accounts can use an invite flow if you configure one.

### 11.1 Choose how to create the first account

| Method | When to use it |
|--------|----------------|
| **A — Discord verify (recommended)** | You have Discord on the same account you want tied to the web login. |
| **B — Manual bootstrap** | You set **`HOMEBOT_WEB_SETUP_TOKEN`** in **`.env`** and create username/password without Discord first. |

Skip **B** unless you have a reason not to use Discord verify.

---

### 11.2 Method A — First account with Discord verify

Open **`/setup`** (**New account** in the sidebar). The page title is **Household accounts**. Keep the **Discord verify** tab selected and **First household user** selected (default).

**Part 1 — Get a code on the web**

1. With **`npm run dev`** and HomeBot running, open **`http://localhost:5173/setup`**.
2. Click **Get verification code**. The page shows a code (for example **`ABCD12`**) and an expiry time (**15 minutes**).
3. Leave this browser tab open; it polls Discord automatically.

**Part 2 — Confirm in Discord**

1. Open your Discord server (the same server as **`DISCORD_GUILD_ID`**).
2. Sign in as the **Discord user** you want tied to this web login (the verify command must be run by that account).
3. In any channel where the bot can read messages, run **`/webui-verify`**.
4. For **code**, paste the code from the browser (not case-sensitive). Submit. The bot should confirm success.

**Part 3 — Create the web login**

1. Return to the browser tab. When the status line says **Discord verified**, the form asks for **Web username** and **Password (8+ characters)**.
2. Choose a username (letters, numbers, underscore, hyphen; **3–40** characters) and a password (**at least 8** characters).
3. Click **Create first user**. You should see a green success message with a **Sign in** link — you are **not** signed in yet.

**Part 4 — Sign in**

1. Click **Sign in** (sidebar or the link on the setup page) and go to **`/login`**.
2. Enter the **same username and password** you just created. Submit.
3. You should land on **Home** with the header showing **Connected**.

**Part 5 — Settings check**

1. Open **Settings**.
2. Confirm **API base URL** is **`http://localhost:5050`** (or your API). Change it here if the API runs on another host ([Section 9](#93-open-the-app-in-your-browser)).
3. Confirm **`actorUserId`** was filled with your Discord user id (digits). If it is empty but the bot is online, pick yourself from the roster or paste your Discord user id (enable **Developer Mode** → right‑click your name → **Copy User ID**).

**Confirm**

- [ ] **Sign in** works and **Home** loads without “sign in to use …” on dashboard actions.
- [ ] **Settings** shows your **`actorUserId`**.
- [ ] Adding a test buy item on **Buy** works (and optionally appears in the bound Discord channel).

---

### 11.3 Method B — Manual bootstrap (optional)

Only if you set a setup token in **`.env`**:

```env
HOMEBOT_WEB_SETUP_TOKEN=some-long-random-token-you-choose
```

Restart HomeBot after editing **`.env`**.

1. Open **`/setup`** on the Web UI.
2. Open the **Manual · first user** tab.
3. Enter username, password (**8+** characters), Discord user id (digits), and the **setup token** matching **`.env`** if you configured one.
4. Submit **Create first user** (button label on the form). Use the **Sign in** link on the success message.
5. On **`/login`**, log in with the same username and password.

---

### 11.4 Additional household members (later)

- If **`HOMEBOT_WEB_INVITE_TOKEN`** is set in **`.env`**, use the **Manual · invite** tab on **`/setup`** with that token plus username, password, and Discord user id.
- Otherwise use **Discord verify**, select **Additional member**, then the same code flow as the first user (**Get verification code** → **`/webui-verify`** → **Create account** → **Sign in**).

Details of every auth endpoint: **[README.md](../README.md)** and **[Section 19](#19-reference--every-environment-variable)**.

---

### 11.5 If sign-in fails

| Symptom | What to do |
|---------|------------|
| **503** on API calls | Set **`HOMEBOT_API_TOKEN`** and/or **`HOMEBOT_WEB_JWT_SECRET`** in **`.env`**; restart HomeBot. |
| **Cannot reach API** in the UI | [Section 6.2](#62-confirm-bot-and-api-are-running); check **`webui/.env`** **`VITE_API_BASE_URL`**. |
| **`/webui-verify` fails** | Code expired (**15 minutes**), typo, or wrong Discord user ran the command; click **Start over** on **`/setup`** and get a new code. Bot must be online in the **same** server as **`DISCORD_GUILD_ID`**. |
| **401 / invalid login** | Use **Sign in** with the username/password from **`/setup`**; OAuth does not create accounts. |
| **Port 5050 already in use** | Another program (or a second HomeBot) owns the port; stop it or change **`HOMEBOT_API_URL`**. |
| **Bot offline / invalid token** | Check **`DISCORD_TOKEN`** in **`.env`**, privileged intents ([Section 4.2](#42-gateway-intents-required-for-a-healthy-bot)), restart HomeBot. |
| **OAuth “Continue with Discord” fails** | Optional [Section 12](#12-optional--discord-oauth-continue-with-discord); account must **already exist** from verify or bootstrap. |

---

## 12. Optional — Discord OAuth (“Continue with Discord”)

Password login and Discord verify ([Section 11](#11-web-accounts--sign-in-discord-verify-bootstrap)) must already work. OAuth uses the **same** `WebUsers` row when **`DiscordUserId`** matches — there is **no** sign-up from the OAuth button alone.

### 12.1 Create OAuth credentials in the Developer Portal

1. Open your application at [Discord Developer Portal](https://discord.com/developers/applications).
2. **OAuth2** → **General** — copy **Client ID** and **Client Secret** (reset secret if you expose it by mistake).
3. Under **Redirects**, click **Add Redirect** and add your API callback URL. For local dev with the API on port 5050:

   ```text
   http://localhost:5050/api/auth/discord/oauth/callback
   ```

   For production, use **`https://api.yourdomain.com/api/auth/discord/oauth/callback`** (your real hostname). The string must match **character for character** what you put in **`.env`**.

### 12.2 Set server environment variables

Add to **`.env`** (repository root), then restart HomeBot:

```env
HOMEBOT_DISCORD_OAUTH_CLIENT_ID=your_client_id
HOMEBOT_DISCORD_OAUTH_CLIENT_SECRET=your_client_secret
HOMEBOT_DISCORD_OAUTH_REDIRECT_URI=http://localhost:5050/api/auth/discord/oauth/callback
HOMEBOT_WEB_OAUTH_FRONTEND_URL=http://localhost:5173
```

- **`HOMEBOT_DISCORD_OAUTH_REDIRECT_URI`** — always the **API** host, not the Vite dev URL.
- **`HOMEBOT_WEB_OAUTH_FRONTEND_URL`** — where the browser loads the SPA after login (local: **`http://localhost:5173`**; GitHub project site: full SPA root like **`https://OWNER.github.io/HomeBot`** — [Section 13](#13-optional--github-pages-static-web-ui)).
- **`HOMEBOT_WEB_JWT_SECRET`** must remain set ([Section 5](#52-fill-in-required-values-discord--api--web-sign-in)).

In **Production**, partial OAuth env fails startup unless **`HOMEBOT_ALLOW_PARTIAL_OAUTH_ENV=true`**. Details: **[README.md](../README.md)**.

### 12.3 Test the button

1. Sign out of the Web UI if you are signed in.
2. On **Sign in**, click **Continue with Discord**.
3. Approve in Discord; you should return to the app signed in as the user whose **`DiscordUserId`** already exists.

**Confirm**

- [ ] No “redirect_uri mismatch” error from Discord.
- [ ] You land back on **Home** signed in (account must have been created via verify or bootstrap first).

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
   - **`HOMEBOT_API_PUBLIC_URL`** (**required** for a working remote Web UI) — public API base baked into the static build, e.g. **`https://api.example.com`** or **`https://myhomebot.duckdns.org`** (**no** trailing slash). If unset, the workflow may still **build** but logs a **warning** and the SPA will call **`localhost:5050`** in users’ browsers.
   - **`HOMEBOT_WEBUI_BASE_PATH`** (optional) — override **`VITE_BASE_PATH`** for the Actions build. If unset, the workflow defaults to **`/REPO_NAME/`** from **`GITHUB_REPOSITORY`** (correct for **project** Pages at **`https://OWNER.github.io/REPO/`**). Use **`/`** for a **user** site at the domain root.

The repo ships **[`.github/workflows/pages-webui.yml`](../.github/workflows/pages-webui.yml)** (runs on **`webui/**`** pushes to **`main`** and **`workflow_dispatch`**). The **build** job runs **`npm ci`**, **`npm run lint`**, **`npm run test`**, and **`npm run build`** — same as [Section 16.2](#162-ci-ciyml--every-push-to-main) **`webui`** job. The first **`deploy-pages`** run may ask you to approve the **`github-pages`** environment.

**If the workflow fails:** open the failed **build** job (not **deploy**). Reproduce locally: `cd webui && npm ci && npm run lint && npm run test && npm run build` ([Section 16.1](#161-local-checks)).

**Optional:** keep a **local-only** workflow filename **`deploy-webui.yml`** — it stays **gitignored** in this repo so it never overwrites the shared **`pages-webui.yml`** on push.

To customize the pipeline further, copy **`pages-webui.yml`** under a new name in **`.github/workflows/`** and edit triggers or env.

### 13.5 Confirm Pages deployment

- [ ] **`https://OWNER.github.io/REPO/`** loads without blank page or 404 on **`/REPO/assets/...`**.
- [ ] Browser devtools **Network** tab shows API calls to your **`HOMEBOT_API_PUBLIC_URL`** (not **`localhost`**).
- [ ] Sign-in or OAuth works from the Pages origin (CORS and **`HOMEBOT_WEB_OAUTH_FRONTEND_URL`** set on the API host).

---

## 14. Optional — public HTTPS API (reverse proxy)

Use this when the Web UI runs on **GitHub Pages**, another PC, or a phone and must call the API over the **internet** with **HTTPS**. HomeBot itself can keep listening on **`127.0.0.1:5050`**; only the proxy faces the public.

### 14.1 DNS and firewall

1. Point a hostname (e.g. **`api.example.com`**) at your server’s public IP.
2. Open **443** (and **80** for ACME HTTP challenges) on the server firewall.
3. Keep **`HOMEBOT_API_URL=http://0.0.0.0:5050`** on the same machine unless you intentionally bind elsewhere.

### 14.2 Proxy configuration

Put **Caddy** or **nginx** on **`80`/`443`**, terminate TLS, and forward to **`http://127.0.0.1:5050`**.

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

### 14.3 CORS and Web UI URL

Before restarting HomeBot, set in **`.env`** (or **`systemd`** **`EnvironmentFile`**):

```env
HOMEBOT_ALLOWED_ORIGINS=https://OWNER.github.io,http://localhost:5173
```

Use the **origin only** (scheme + host, no path). Add every place users open the SPA.

Set **`webui`** build variable **`VITE_API_BASE_URL=https://api.example.com`** when building for production ([Section 13](#132-build-locally-smoke-test)).

**Confirm**

- [ ] **`curl -sS https://api.example.com/api/health`** returns OK from outside your LAN.
- [ ] Browser on Pages (or LAN) can call the API without CORS errors.

**Renewals:** **`certbot renew`** for Let’s Encrypt; reload the proxy afterward. Rotate Discord secrets in the portal and **`.env`** when needed.

---

## 15. Phone or another PC on your LAN (Windows dev)

1. Same Wi‑Fi as the PC; avoid guest/AP isolation.
2. **`ipconfig`** → note **IPv4** (e.g. **`192.168.1.42`**). Use that address everywhere below instead of the example.
3. Keep **`HOMEBOT_API_URL`** as default **`http://0.0.0.0:5050`** so the API listens on all interfaces.
4. Allow **TCP 5050** in Windows Firewall ([Section 6.3](#63-firewall-other-devices-on-your-lan)).
5. Add CORS **before** starting HomeBot (in **`.env`** on the repo machine, then restart):

   ```env
   HOMEBOT_ALLOWED_ORIGINS=http://localhost:5173,http://192.168.1.42:5173
   ```

   Or for one PowerShell session only: **`$env:HOMEBOT_ALLOWED_ORIGINS = "http://localhost:5173,http://192.168.1.42:5173"`** then load **`.env`** and run HomeBot.

6. From **`webui`**: **`npm run dev -- --host 0.0.0.0`**. On the phone, open **`http://192.168.1.42:5173`**.
7. On the phone, open **Settings** (after sign-in) or set **`VITE_API_BASE_URL=http://192.168.1.42:5050`** in **`webui/.env`** and restart **`npm run dev`** so the UI calls the PC’s API, not **`localhost`** (which on the phone means the phone itself).
8. Sanity check from the phone’s browser: **`http://192.168.1.42:5050/api/health`**.

**Install as an app (iPhone):** After the site loads over HTTPS (or localhost during dev), use **Add to Home Screen** for a full-screen PWA. Optional **Web Push** needs **`HOMEBOT_VAPID_*`** on the server — see **[MOBILE.md](./MOBILE.md)**.

**Keyboard shortcuts** in the Web UI: **`/`** search, **`?`** help — see **[FEATURES.md](./FEATURES.md)**.

## 16. Tests, lint, and GitHub Actions

### 16.1 Local checks

Optional sanity checks after setup or before you change code.

**Backend** (repository root):

```bash
dotnet test HomeBot.Tests/HomeBot.Tests.csproj
```

Includes integration tests for buy, wishlist, money, budget, calendar, meals, search, webhooks, push, polish (bulk/stale/receipt), and undo over HTTP.

**OpenAPI types** (optional, API must be running):

```bash
cd webui
npm run openapi:types
```

Writes **`webui/src/generated/openapi.d.ts`** from **`GET /openapi/v1.json`**.

**Web UI** (match what CI runs):

```bash
cd webui
npm ci
npm run lint
npm run test
npm run build
```

Use **`npm ci`** (not **`npm install`**) when you want the exact versions from **`package-lock.json`**, same as GitHub Actions.

Stop any running **`dotnet run`** if the build cannot overwrite **`HomeBot.dll`**.

### 16.2 CI (`ci.yml`) — every push to `main`

**[`.github/workflows/ci.yml`](../.github/workflows/ci.yml)** runs on push and pull requests to **`main`**.

| Job | What it runs |
|-----|----------------|
| **`dotnet`** | Restore, Release build, **`dotnet test`** |
| **`webui`** | **`npm ci`**, **`npm run lint`**, **`npm run test`**, **`npm run build`** (Node **22**) |

**Does not need your VM, Discord, or GitHub Pages secrets.** It only proves the repo builds on GitHub’s runners.

If **`webui`** fails, open **Actions → CI → webui** and scroll to the first **error** (often **`npm run lint`** or **`npm run build`**). Fix locally with the commands in [§16.1](#161-local-checks), commit, and push.

### 16.3 Deploy Web UI to GitHub Pages (`pages-webui.yml`)

**[`.github/workflows/pages-webui.yml`](../.github/workflows/pages-webui.yml)** publishes the static Web UI.

| Prerequisite | Where |
|--------------|--------|
| **Pages → Source: GitHub Actions** | Repo **Settings → Pages** |
| **`HOMEBOT_API_PUBLIC_URL`** | **Settings → Secrets and variables → Actions → Variables** — your public API origin (**no** trailing slash) |
| **`github-pages` environment** | Approve on first deploy if prompted |

Triggers: pushes to **`main`** that change **`webui/**`**, or **Actions → Deploy Web UI to GitHub Pages → Run workflow**.

The **build** job must pass before **deploy** runs. A green deploy does **not** mean the site works in the browser until your VM API is up, **HTTPS** is configured, **`HOMEBOT_API_PUBLIC_URL`** matches **`YOUR_API_PUBLIC`**, and **CORS** includes your Pages origin ([Step I](#step-i--cors-on-the-server), [Section 13](#13-optional--github-pages-static-web-ui)).

### 16.4 VM API updates

GitHub Actions does **not** SSH to the Ubuntu server. After CI is green, update the bot on the VM:

```bash
sudo bash /opt/homebot/app/scripts/ubuntu/update-homebot.sh
```

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
| **`/budget-*` does nothing** | Run **`/setup-set feature: budget`** in the channel you use; commands only work in bound channels ([Section 10](#10-discord--finish-in-server-setup-setup-set)). |
| No budget digest in Discord | **`budget`** channel bound; wait until **`HOMEBOT_BUDGET_DIGEST_*`** window (UTC); bot must stay online. |
| **`/webui-verify` invalid or expired** | Generate a fresh code on **`/setup`**; complete within the timeout; same server as **`DISCORD_GUILD_ID`**. |
| Web UI tests fail locally | From **`webui`**: **`npm install`** then **`npm run test`**; API tests need **`dotnet test`** with HomeBot **not** locking **`HomeBot.dll`**. |
| **`actorUserId` required** errors | Open **Settings**; set your Discord user id or pick from roster when the bot is online. |
| Google Calendar connect fails | **`HOMEBOT_GOOGLE_OAUTH_*`** redirect must match Google Cloud Console; API must be HTTPS in production. |
| Web Push not offered | Set **`HOMEBOT_VAPID_PUBLIC_KEY`**, **`HOMEBOT_VAPID_PRIVATE_KEY`**, **`HOMEBOT_VAPID_SUBJECT`**; use HTTPS or localhost. |
| Webhooks return **401** | **`HOMEBOT_WEBHOOK_SECRET`** must match header **`X-HomeBot-Webhook-Secret`**. |
| GitHub **CI** **`webui`** job failed | **Actions → CI → webui** log. Locally: `cd webui && npm ci && npm run lint && npm run test && npm run build` ([Section 16](#16-tests-lint-and-github-actions)). |
| **Deploy Web UI to GitHub Pages** **build** failed | Same local commands as CI **`webui`**. Confirm **Pages → Source: GitHub Actions**. |
| Pages loads but API calls **`localhost`** | Set **`HOMEBOT_API_PUBLIC_URL`** to **`YOUR_API_PUBLIC`**, re-run **Deploy Web UI to GitHub Pages**. |
| Pages **CORS** errors | **`HOMEBOT_ALLOWED_ORIGINS`** on the VM must include **`YOUR_PAGES_ORIGIN`** (no path) — [Step I](#step-i--cors-on-the-server). |
| API still on an old commit after a push | GitHub Pages updates the Web UI automatically. The VM API needs a manual `sudo bash /opt/homebot/app/scripts/ubuntu/update-homebot.sh`. |

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

### Budget (optional)

| Variable | Default / notes |
|----------|-----------------|
| **`HOMEBOT_BUDGET_LARGE_EXPENSE_USD`** | **500** — large single-expense Discord alert. |
| **`HOMEBOT_BUDGET_DIGEST_DAY`** | **Sunday** (or **0–6**) — weekly digest weekday (UTC). |
| **`HOMEBOT_BUDGET_DIGEST_UTC_HOUR`** | **17** — digest hour **0–23** UTC. |

Requires **`/setup-set`** for feature **`budget`** ([Section 10](#10-discord--finish-in-server-setup-setup-set)).

### Calendar reminders (optional)

| Variable | Default / notes |
|----------|-----------------|
| **`HOMEBOT_REMINDER_POLL_SECONDS`** | **30** (min 10, max 300) — background poll for due reminders. |
| **`HOMEBOT_CALENDAR_REMINDER_DM`** | **`true`** — also DM assigned users (when Discord is on). |

### Medium features (optional)

| Variable | Notes |
|----------|--------|
| **`HOMEBOT_BUY_RECURRING_POLL_MINUTES`** | Recurring buy worker interval (default **60**). |
| **`HOMEBOT_WEBHOOK_SECRET`** | Shared secret for **`POST /api/hooks/*`** — see **[WEBHOOKS.md](./WEBHOOKS.md)**. |
| **`HOMEBOT_WEB_ADMIN_DISCORD_IDS`** | Comma-separated Discord ids with web admin rights. |

### Google Calendar sync (optional)

| Variable | Notes |
|----------|--------|
| **`HOMEBOT_GOOGLE_OAUTH_CLIENT_ID`** | Google Cloud OAuth client. |
| **`HOMEBOT_GOOGLE_OAUTH_CLIENT_SECRET`** | Client secret. |
| **`HOMEBOT_GOOGLE_OAUTH_REDIRECT_URI`** | Must match Google redirect URIs exactly. |
| **`HOMEBOT_GOOGLE_CALENDAR_SYNC_MINUTES`** | Background sync interval (default **15**). |
| **`HOMEBOT_GOOGLE_SYNC_CONFLICT`** | **`newest`**, **`google`**, or **`local`** when both sides changed. |

### Budget notification channels (optional)

| Variable | Notes |
|----------|--------|
| **`HOMEBOT_BUDGET_DIGEST_TO_CHANNEL`** | Post weekly digest to bound **budget** channel (default on when channel exists). |
| **`HOMEBOT_BUDGET_ALERTS_TO_CHANNEL`** | Post envelope/large-expense alerts to **budget** channel. |

### Web Push (optional PWA)

| Variable | Notes |
|----------|--------|
| **`HOMEBOT_VAPID_PUBLIC_KEY`** | From **`npx web-push generate-vapid-keys`**. |
| **`HOMEBOT_VAPID_PRIVATE_KEY`** | Server-only. |
| **`HOMEBOT_VAPID_SUBJECT`** | e.g. **`mailto:you@example.com`**. |

See **[MOBILE.md](./MOBILE.md)** for install and enable steps.

### Off-site backup (Google Drive via rclone)

| Variable | Notes |
|----------|--------|
| **`HOMEBOT_GDRIVE_BACKUP_ENABLED`** | **`true`** to run upload/prune ([Section 20.2](#202-off-site-backup-to-google-drive-optional)). |
| **`HOMEBOT_GDRIVE_RCLONE_REMOTE`** | rclone remote name (e.g. **`gdrive`**). |
| **`HOMEBOT_GDRIVE_BACKUP_PATH`** | Drive folder (default **`HomeBot/backups`**). |
| **`HOMEBOT_GDRIVE_RETENTION_DAYS`** | Delete remote backups older than N days (default **90**). |
| **`HOMEBOT_LOCAL_BACKUP_RETENTION_DAYS`** | Delete local **`/opt/homebot/backups`** files older than N days (default **30**). |
| **`HOMEBOT_BACKUP_DIR`** | Local backup directory. |
| **`HOMEBOT_GDRIVE_BACKUP_DRY_RUN`** | **`true`** = log only, no changes. |
| **`HOMEBOT_GDRIVE_BACKUP_ENCRYPT`** | **`true`** — GPG-encrypt before upload (see **[OPS.md](./OPS.md)**). |
| **`HOMEBOT_GDRIVE_BACKUP_ENCRYPT_PASSPHRASE_FILE`** | Path to passphrase file on the server. |

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

| Path | What |
|------|------|
| **[20.1](#201-automated-backups-optional)** | Local timestamped copies (`backup-homebot-sqlite.sh`, optional weekly **`systemd`** timer). |
| **[20.2](#202-off-site-backup-to-google-drive-optional)** | Upload copies to **Google Drive** with **rclone**; automatic **retention** on Drive and on the server (defaults: **90** / **30** days). |

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

These files live in the repo:

| File | Role |
|------|------|
| **[`scripts/backup-homebot-sqlite.sh`](../scripts/backup-homebot-sqlite.sh)** | Linux: stop **`systemd`** service → copy DB + WAL/SHM with timestamp → start service. |
| **[`scripts/systemd/homebot-sqlite-backup.service.example`](../scripts/systemd/homebot-sqlite-backup.service.example)** | **`systemd` oneshot** unit that runs the script. |
| **[`scripts/systemd/homebot-sqlite-backup.timer.example`](../scripts/systemd/homebot-sqlite-backup.timer.example)** | **`systemd` timer** (sample: weekly Sunday 03:15). |
| **[`scripts/backup-homebot-sqlite.ps1`](../scripts/backup-homebot-sqlite.ps1)** | Windows: copy **`homebot.db`** (+ sidecars) into **`backups/`** with a timestamp (does **not** stop **`dotnet`** for you). |
| **[`scripts/sync-homebot-backups-to-gdrive.sh`](../scripts/sync-homebot-backups-to-gdrive.sh)** | Upload **`homebot.db.*`** to Google Drive via **rclone**; prune old files on Drive and locally. |
| **[`scripts/backup-homebot-with-gdrive.sh`](../scripts/backup-homebot-with-gdrive.sh)** | Linux: local backup + Google Drive sync in one run. |
| **[`scripts/systemd/homebot-backup-with-gdrive.*.example`](../scripts/systemd/homebot-backup-with-gdrive.service.example)** | Weekly **`systemd`** timer for local + off-site backup. |

The **`backups/`** folder under your repo root is **gitignored** so backup files are never committed.

**Where is the database?** The scripts assume the default filename **`homebot.db`** next to your app ([Section 8](#8-ubuntu-server--install-systemd-auto-start-on-reboot) uses **`/opt/homebot/app`**). If you set **`HOMEBOT_DATABASE_PATH`** to another path, pass that directory as **`APP_DIR`** (Linux) or **`RepoRoot`** (Windows), or edit the **`systemd`** **`ExecStart`** line to point at the folder that **contains** **`homebot.db`**.

---

#### 20.1.1 Linux — install and smoke-test `backup-homebot-sqlite.sh`

1. **Confirm the service name** matches your unit (often **`homebot.service`** from [Section 8.7](#87-publish-and-install-the-systemd-unit)).
2. On the server, from your clone (or after copying the script onto the box), make it executable:

   ```bash
   chmod +x /opt/homebot/app/scripts/backup-homebot-sqlite.sh
   ```

3. **Create the backup directory** (once), owned by **`homebot`** if that user exists:

   ```bash
   sudo mkdir -p /opt/homebot/backups
   sudo chown homebot:homebot /opt/homebot/backups
   ```

4. **Run one backup manually** (stops the bot for a few seconds):

   ```bash
   sudo /opt/homebot/app/scripts/backup-homebot-sqlite.sh
   ```

   This uses the defaults: **`APP_DIR=/opt/homebot/app`**, **`BACKUP_DIR=/opt/homebot/backups`**, **`SERVICE=homebot.service`**.

5. **Check output:** you should see new files such as **`homebot.db.2026-05-03-0315`** and, if WAL mode created them, **`homebot.db.2026-05-03-0315-wal`** / **`…-shm`**.

6. **Custom paths or service name** — arguments are positional:

   ```bash
   sudo /path/to/backup-homebot-sqlite.sh /path/to/app/dir /path/to/backups your-service.service
   ```

7. **Must run as root** (`sudo`) so **`systemctl stop`** / **`start`** succeed. The script uses **`sudo -u homebot cp`** when the **`homebot`** user exists so files stay owned by the app user.

---

#### 20.1.2 Linux — enable the weekly `systemd` timer

1. **Copy** the example unit files into **`/etc/systemd/system/`** and drop the **`.example`** suffix:

   ```bash
   sudo cp /opt/homebot/app/scripts/systemd/homebot-sqlite-backup.service.example /etc/systemd/system/homebot-sqlite-backup.service
   sudo cp /opt/homebot/app/scripts/systemd/homebot-sqlite-backup.timer.example /etc/systemd/system/homebot-sqlite-backup.timer
   ```

2. **Edit the service file** with your real paths (the sample **`ExecStart`** points at **`/opt/homebot/app/scripts/backup-homebot-sqlite.sh`** and passes app dir, backup dir, and **`homebot.service`**). If your clone lives elsewhere, update every path.

3. **Reload systemd** and **enable the timer** (starts scheduling; does not run a backup until the next calendar slot unless you trigger one):

   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable homebot-sqlite-backup.timer
   sudo systemctl start homebot-sqlite-backup.timer
   ```

4. **Check the timer** is active and see the next run time:

   ```bash
   systemctl list-timers homebot-sqlite-backup.timer
   ```

5. **Run a backup immediately** (without waiting for Sunday) — start the **oneshot** service by hand:

   ```bash
   sudo systemctl start homebot-sqlite-backup.service
   sudo systemctl status homebot-sqlite-backup.service
   ```

6. **Change the schedule** — edit **`OnCalendar=`** in **`homebot-sqlite-backup.timer`** (see **`man systemd.time`**), then **`sudo systemctl daemon-reload`** and **`sudo systemctl restart homebot-sqlite-backup.timer`**.

7. **Logs** if something fails:

   ```bash
   journalctl -u homebot-sqlite-backup.service -b
   ```

---

#### 20.1.3 Windows — run `backup-homebot-sqlite.ps1` correctly

1. **Prefer a clean copy:** stop HomeBot before running the script (close the **`dotnet run`** window, end the Task Scheduler task if you use one, or stop **`HomeBot.exe`**). The script **refuses** to run if a process named **`HomeBot`** is running, unless you pass **`-Force`** (unsafe if SQLite is writing).

2. Open **PowerShell**, **`cd`** to your repo root (the folder that contains **`homebot.db`** and the **`scripts`** folder):

   ```powershell
   cd C:\path\to\HomeBot
   ```

3. **Allow scripts** if execution policy blocks them (one session):

   ```powershell
   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
   ```

4. **Run the backup:**

   ```powershell
   .\scripts\backup-homebot-sqlite.ps1
   ```

   By default this writes under **`.\backups\`** with filenames like **`homebot.db.2026-05-03-1430`**.

5. **Custom folders:**

   ```powershell
   .\scripts\backup-homebot-sqlite.ps1 -RepoRoot "D:\Data\HomeBot" -BackupDir "D:\Backups\HomeBot"
   ```

6. **Only use `-Force`** if you understand the risk (e.g. quick copy while nothing is writing to the DB).

7. **Google Drive (optional):** after local copies exist under **`backups\`**, use **`.\scripts\sync-homebot-backups-to-gdrive.ps1`** with the same **`HOMEBOT_GDRIVE_*`** variables as Linux (set in your shell or a small **`.env`** loader). See [Section 20.2](#202-off-site-backup-to-google-drive-optional).

---

#### 20.1.4 Windows — schedule with Task Scheduler (optional)

1. Open **Task Scheduler** → **Create Task…**.
2. **General:** name **`HomeBot SQLite backup`**; choose **Run only when user is logged on** (simplest) or **Run whether user is logged on or not** if you use a service account and stored password.
3. **Triggers:** **New…** → **Weekly** (or **Daily**) and pick a quiet time.
4. **Actions:** **New…** → **Start a program**
   - **Program:** **`powershell`**
   - **Add arguments:** **`-NoProfile -ExecutionPolicy Bypass -File "C:\full\path\to\HomeBot\scripts\backup-homebot-sqlite.ps1"`**
   - **Start in:** **`C:\full\path\to\HomeBot`**
5. Ensure nothing else runs **`dotnet run`** for HomeBot at the same instant, or stop the main HomeBot task **before** this task and restart **after** (two tasks in sequence), if you need a guaranteed quiescent DB. The script does **not** stop **`dotnet`** automatically.

---

#### 20.1.5 Restore from a backup (short procedure)

1. **Stop HomeBot** (same as for a backup).
2. **Rename or move away** the current live files (**`homebot.db`**, **`homebot.db-wal`**, **`homebot.db-shm`**) so you can roll back if needed.
3. **Copy** the chosen backup file back to **`homebot.db`** (and restore **`-wal`** / **`-shm`** only if they were part of that backup set; if you are unsure, restore **only** **`homebot.db`** and delete stray **`-wal`**/**`-shm`** so SQLite recreates them — ask a backup guide if you need WAL-specific restore).
4. **Fix ownership** on Linux if needed (**`chown homebot:homebot homebot.db`**).
5. **Start HomeBot** again and smoke-test the Web UI and Discord.

---

#### 20.1.6 Retention (optional)

Backup files accumulate. For **automatic** local and Google Drive retention, use [Section 20.2](#202-off-site-backup-to-google-drive-optional). Otherwise delete old dated copies by hand (keep several generations).

### 20.2 Off-site backup to Google Drive (optional)

Copies timestamped files from **`HOMEBOT_BACKUP_DIR`** (default **`/opt/homebot/backups`**) to **Google Drive** using **[rclone](https://rclone.org/)**, then **deletes old backups** on Drive and on the server so space does not grow forever.

**You need**

- **rclone** installed on the machine that runs backups (`sudo apt install -y rclone` on Ubuntu).
- A one-time **`rclone config`** remote (e.g. name **`gdrive`** → **Google Drive**).
- Flags in **`.env`** (see **`.env.example`**).

**Environment variables**

| Variable | Default | Purpose |
|----------|---------|---------|
| **`HOMEBOT_GDRIVE_BACKUP_ENABLED`** | off | Must be **`true`** to run sync. |
| **`HOMEBOT_GDRIVE_RCLONE_REMOTE`** | — | rclone remote name (e.g. **`gdrive`**). |
| **`HOMEBOT_GDRIVE_BACKUP_PATH`** | **`HomeBot/backups`** | Folder on Google Drive (no leading **`/`**). |
| **`HOMEBOT_GDRIVE_RETENTION_DAYS`** | **90** | Delete remote **`homebot.db.*`** older than this (**0** = no remote prune). |
| **`HOMEBOT_LOCAL_BACKUP_RETENTION_DAYS`** | **30** | Delete local **`homebot.db.*`** older than this (**0** = keep all local copies). |
| **`HOMEBOT_BACKUP_DIR`** | **`/opt/homebot/backups`** | Local backup folder (same as SQLite backup script). |
| **`HOMEBOT_GDRIVE_BACKUP_DRY_RUN`** | off | **`true`** — print what would happen; no upload/delete. |

**One-time: configure rclone (on the server)**

```bash
sudo apt install -y rclone
sudo rclone config
```

Create a remote (example name **`gdrive`**) → **Google Drive** → follow the OAuth link. Test:

```bash
sudo rclone lsd gdrive:
```

**Enable in `.env`**

```env
HOMEBOT_GDRIVE_BACKUP_ENABLED=true
HOMEBOT_GDRIVE_RCLONE_REMOTE=gdrive
HOMEBOT_GDRIVE_BACKUP_PATH=HomeBot/backups
HOMEBOT_GDRIVE_RETENTION_DAYS=90
HOMEBOT_LOCAL_BACKUP_RETENTION_DAYS=30
```

**Manual run (local backup + Drive)**

```bash
chmod +x /opt/homebot/app/scripts/backup-homebot-with-gdrive.sh
chmod +x /opt/homebot/app/scripts/sync-homebot-backups-to-gdrive.sh
sudo bash /opt/homebot/app/scripts/backup-homebot-with-gdrive.sh
```

Or upload only (after a local backup already exists):

```bash
sudo -E bash /opt/homebot/app/scripts/sync-homebot-backups-to-gdrive.sh
```

(`-E` keeps **`HOMEBOT_*`** from your shell if you exported them; **`systemd`** uses **`EnvironmentFile=`** instead.)

**Weekly `systemd` timer (recommended)**

```bash
sudo cp /opt/homebot/app/scripts/systemd/homebot-backup-with-gdrive.service.example /etc/systemd/system/homebot-backup-with-gdrive.service
sudo cp /opt/homebot/app/scripts/systemd/homebot-backup-with-gdrive.timer.example /etc/systemd/system/homebot-backup-with-gdrive.timer
sudo systemctl daemon-reload
sudo systemctl enable --now homebot-backup-with-gdrive.timer
sudo systemctl start homebot-backup-with-gdrive.service
```

Use **either** the local-only timer ([20.1.2](#2012-linux--enable-the-weekly-systemd-timer)) **or** the Drive timer, not both on the same schedule unless you intend two backups per week.

**Windows (optional)**

Install rclone, set the same **`HOMEBOT_*`** variables, run **`backup-homebot-sqlite.ps1`**, then **`sync-homebot-backups-to-gdrive.ps1`**.

**Security:** The database may contain household financial data. Drive is off-site — use a Google account you control; consider encrypting backups before upload if you need extra protection (not built in).

**Storage (typical):** With **weekly** backups, about **13** files on Drive over **90** days. Total Drive use ≈ **`homebot.db` size × 13** (often **tens of MB**, not GB for a normal household DB). See retention variables in the table above.

**Confirm**

- [ ] **`rclone lsd gdrive:`** (your remote name) works.
- [ ] After a run, files appear under **`HomeBot/backups`** on Drive.
- [ ] Old dated files disappear from Drive after **`HOMEBOT_GDRIVE_RETENTION_DAYS`**.

### Online backup without stopping (advanced)

SQLite supports **online backup** APIs and tools (for example the **`sqlite3`** `.backup` command or application-level backup). HomeBot does not expose a built-in backup endpoint; use official SQLite documentation or a DBA tool if you need zero-downtime copies.

---

## Final checklist

Work through this table after Sections 1–11.

| # | Check | How | Expected |
|---|--------|-----|----------|
| 1 | API health | Browser: **`http://localhost:5050/api/health`** or PowerShell in [Section 6.2](#62-confirm-bot-and-api-are-running) | JSON with **`ok`** status |
| 2 | Discord bot | Server member list | **Online** (green) |
| 3 | Slash commands | Type **`/`** in a channel | HomeBot commands listed |
| 4 | Channel bindings | **`/setup-view`** | **buy**, **wishlist**, **money**, **budget**, **calendar** mapped |
| 5 | Web UI loads | **`http://localhost:5173`** | Sidebar: Home, Buy, Wishlist, Money, Budget, Calendar, **Meals**, Settings |
| 6 | Web sign-in | **Sign in** on **`/login`** after [Section 11](#11-web-accounts--sign-in-discord-verify-bootstrap) | **Home** loads; header shows **Connected**; writes work on **Buy** |
| 7 | One write path | Add a buy item in Web UI or **`/buy-add`** in Discord | Item appears in list / channel notify (if bound) |
| 8 | Dashboard | Open **Home** | Stale buy, budget alerts, backup warning (if applicable) |
| 9 | GitHub Pages (if used) | Open your Pages URL; **Actions → Deploy Web UI to GitHub Pages** | No 404 under **`/REPO/assets/`**; Network tab calls **`HOMEBOT_API_PUBLIC_URL`**; **build** job green |
| 10 | CI (optional sanity) | **Actions → CI** on latest **`main`** | **`dotnet`** and **`webui`** jobs green (no VM required) |
| 11 | Backups (if enabled) | After [20.2](#202-off-site-backup-to-google-drive-optional): files under **`HomeBot/backups`** on Drive; old copies pruned per retention |

**Next steps (optional):** Discord OAuth [Section 12](#12-optional--discord-oauth-continue-with-discord), GitHub Pages [Section 13](#13-optional--github-pages-static-web-ui), HTTPS API [Section 14](#14-optional--public-https-api-reverse-proxy), **PWA / push** [MOBILE.md](./MOBILE.md), **Google Calendar** / **webhooks** (Section 19 env + **[FEATURES.md](./FEATURES.md)**), backups [Section 20](#20-backing-up-sqlite-homebotdb).

Product reference: **[FEATURES.md](FEATURES.md)**. Configuration reference: **[README.md](../README.md)** and [Section 19](#19-reference--every-environment-variable).
