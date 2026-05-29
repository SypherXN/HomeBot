# Ubuntu deployment

Deploy HomeBot on **Ubuntu 22.04 or 24.04** so the Discord bot and HTTP API start on boot and keep running after you close SSH.

**Full install guide (Windows + Discord + Web UI):** **[SETUP.md](SETUP.md)**. This document focuses on the **server only**.

**What runs on the server**

| Component | Path / name |
|-----------|-------------|
| App user | **`homebot`** |
| Install root | **`/opt/homebot`** |
| Git clone + **`.env`** + SQLite | **`/opt/homebot/app`** |
| Published binaries | **`/opt/homebot/app/publish/`** |
| **`systemd` unit** | **`homebot.service`** |
| API port (default) | **5050** (`HOMEBOT_API_URL` in **`.env`**) |

**What does *not* need to be on the server**

- **Node.js** — unless you build the Web UI on the server. Normal setup: run **`npm run dev`** on your PC ([SETUP.md — Web UI](SETUP.md#9-web-ui-on-your-pc)) or use **GitHub Pages** for the static UI.

### Resource expectations (single household)

| Component | Typical load | Notes |
|-----------|----------------|-------|
| **HomeBot (.NET)** | ~100–250 MB RAM idle; brief CPU on API use | One process for Discord + API + SQLite. |
| **Caddy/nginx** | Low | Only if you use HTTPS reverse proxy ([Section 6](#6-public-https-api-optional)). |
| **SQLite** | Small disk; WAL enabled at startup | Grows with years of buy/budget/calendar data; back up `homebot.db` ([SETUP.md — §20](SETUP.md#20-backing-up-sqlite-homebotdb)). |
| **Backups (optional)** | Brief stop during weekly snapshot | Local **`/opt/homebot/backups`**; optional **Google Drive** via **rclone** (~**13** weekly files over **90** days — often tens of MB) — [§20.2](SETUP.md#202-off-site-backup-to-google-drive-optional). |
| **Background work** | Calendar reminder poll (default **30s**); budget alerts every **6h** | Optional: `HOMEBOT_REMINDER_POLL_SECONDS` in `.env` (10–300). |
| **Web UI polling** | Only when someone keeps a browser tab open | GitHub Pages does not load your server; open tabs poll health (~45s) and budget badge (~5 min). |

A **1 GB RAM / 1 vCPU** VPS is usually enough. Heavy use (very large budget history + UI left open 24/7) may warrant **2 GB**; you do not need a GPU or Node on the server for the standard layout.

---

## Table of contents

1. [Before you SSH in](#1-before-you-ssh-in)
2. [Option A — Install script (recommended)](#2-option-a--install-script-recommended)
3. [Option B — Manual install (same layout)](#3-option-b--manual-install-same-layout)
4. [After install — Discord and Web UI](#4-after-install--discord-and-web-ui)
5. [Updates when you push to GitHub](#5-updates-when-you-push-to-github)
6. [Public HTTPS API (optional)](#6-public-https-api-optional)
7. [Firewall](#7-firewall)
8. [Useful commands](#8-useful-commands)
9. [Troubleshooting](#9-troubleshooting)

---

## 1. Before you SSH in

Gather these values **before** running the install script. You will paste them into **`/opt/homebot/app/.env`** on the server.

| Item | What it is | Where to get it |
|------|------------|-----------------|
| **Git clone URL** | HTTPS URL of your repo | e.g. `https://github.com/YOUR_USER/HomeBot.git` |
| **`DISCORD_TOKEN`** | Bot token | [Discord Developer Portal](https://discord.com/developers/applications) → your app → **Bot** → token ([SETUP.md — Section 4](SETUP.md#4-discord--application-bot-token-invite-server-id)) |
| **`DISCORD_GUILD_ID`** | Your server’s numeric id | Discord → enable **Developer Mode** → right‑click server icon → **Copy Server ID** |
| **`HOMEBOT_API_TOKEN`** | Long random secret | Password manager or `openssl rand -base64 32` on the server |
| **`HOMEBOT_WEB_JWT_SECRET`** | Another long secret, **≥ 32 characters** | Same as above (use a **different** value than the API token) |

You also need:

- A machine running **Ubuntu 22.04 or 24.04** with **sudo** and internet access.
- SSH access as a user that can run **`sudo`**.

**Confirm you have**

- [ ] Bot invited to your Discord server (can show **offline** until HomeBot runs).
- [ ] Clone URL and all secrets ready to paste (not committed to Git).

---

## 2. Option A — Install script (recommended)

### 2.1 Connect to the server

On your PC:

```bash
ssh youruser@YOUR_SERVER_IP
```

### 2.2 Download the installer (pick one)

**Path 1 — Clone the repo, then run the script from it (best)**

Replace **`YOUR_USER/HomeBot`** with your fork or upstream repo.

```bash
sudo apt update
sudo apt install -y git
git clone https://github.com/YOUR_USER/HomeBot.git /tmp/HomeBot
cd /tmp/HomeBot
sudo bash scripts/ubuntu/install-homebot.sh https://github.com/YOUR_USER/HomeBot.git
```

The argument URL is where **`/opt/homebot/app`** is cloned from. Use the **same** URL you want for future **`git pull`** updates.

**Path 2 — One-liner from an existing clone URL**

If you already have the repo elsewhere on the server:

```bash
cd /path/to/HomeBot
sudo bash scripts/ubuntu/install-homebot.sh https://github.com/YOUR_USER/HomeBot.git
```

### 2.3 What the script does

1. Installs **git**, **curl**, **wget**, and **.NET 10 SDK** (if missing).
2. Creates Linux user **`homebot`** and directory **`/opt/homebot`**.
3. Clones the repository to **`/opt/homebot/app`** (skips clone if **`.git`** already exists).
4. Copies **`.env.example`** → **`.env`** if **`.env`** is missing (`chmod 600`).
5. Stops **`homebot.service`** if it was running, runs **`dotnet publish`**, installs **`systemd`** unit.
6. **Enables** the service on boot.
7. If **`.env`** still has empty required fields, **does not start** the service and prints what to edit.
8. If **`.env`** is complete, **starts** the service and prints status.

### 2.4 Edit secrets (required once)

If the script stopped with a message about configuring secrets, or this is a fresh **`.env`**:

```bash
sudo -u homebot nano /opt/homebot/app/.env
```

Set at least these lines (**no quotes** around values):

```env
DISCORD_TOKEN=paste-bot-token-here
DISCORD_GUILD_ID=1234567890123456789
HOMEBOT_API_ENABLED=true
HOMEBOT_API_TOKEN=paste-long-random-secret-here
HOMEBOT_WEB_JWT_SECRET=paste-another-secret-at-least-32-characters-long
```

**`.env` rules for `systemd`**

- One variable per line: **`KEY=value`**
- Do **not** use **`export`**
- Avoid **`#` comments on the same line** as a value (comments on their own line are OK)

Save (**Ctrl+O**, Enter) and exit (**Ctrl+X**).

### 2.5 Start (or restart) the service

```bash
sudo systemctl restart homebot.service
```

### 2.6 Verify on the server

```bash
curl -sS http://127.0.0.1:5050/api/health
sudo systemctl status homebot.service
```

You want JSON that includes **`"status":"ok"`** and **`active (running)`** in systemd.

Follow logs if anything fails:

```bash
journalctl -u homebot.service -n 50 --no-pager
journalctl -u homebot.service -f
```

In Discord, the bot should show **online** (green) within a minute.

**Confirm**

- [ ] **`curl …/api/health`** returns OK on the server.
- [ ] **`systemctl status homebot.service`** is **active (running)**.
- [ ] Bot is **online** in Discord.
- [ ] Typing **`/`** in a channel lists HomeBot slash commands.

---

## 3. Option B — Manual install (same layout)

Use this if you cannot run the install script. Result matches Option A.

### 3.1 Packages and .NET 10

**Ubuntu 22.04:**

```bash
sudo apt update
sudo apt install -y curl git ca-certificates wget
wget https://packages.microsoft.com/config/ubuntu/22.04/packages-microsoft-prod.deb -O /tmp/packages-microsoft-prod.deb
sudo dpkg -i /tmp/packages-microsoft-prod.deb
sudo apt update
sudo apt install -y dotnet-sdk-10.0
dotnet --version
```

**Ubuntu 24.04** — use **`24.04`** in the **`wget`** URL instead of **`22.04`**, then the same **`dpkg`** / **`apt install`** steps.

### 3.2 User and clone

```bash
sudo adduser --disabled-password --gecos "" homebot
sudo mkdir -p /opt/homebot && sudo chown homebot:homebot /opt/homebot
sudo -u homebot git clone https://github.com/YOUR_USER/HomeBot.git /opt/homebot/app
```

### 3.3 Environment file

```bash
sudo cp /opt/homebot/app/.env.example /opt/homebot/app/.env
sudo chown homebot:homebot /opt/homebot/app/.env
sudo chmod 600 /opt/homebot/app/.env
sudo -u homebot nano /opt/homebot/app/.env
```

Fill the same minimum keys as [Section 2.4](#24-edit-secrets-required-once).

### 3.4 Publish

```bash
sudo -u homebot bash -c 'cd /opt/homebot/app && dotnet publish -c Release -o /opt/homebot/app/publish'
```

### 3.5 systemd

```bash
sudo cp /opt/homebot/app/scripts/systemd/homebot.service.example /etc/systemd/system/homebot.service
# If you used a non-default app path, edit WorkingDirectory, EnvironmentFile, and ExecStart in that file.
sudo systemctl daemon-reload
sudo systemctl enable --now homebot.service
curl -sS http://127.0.0.1:5050/api/health
```

---

## 4. After install — Discord and Web UI

The server only runs the **.NET** process. Finish household setup from your PC:

| Step | Where |
|------|--------|
| Bind Discord channels (`/setup-set` for buy, wishlist, money, budget, calendar) | [SETUP.md — Section 10](SETUP.md#10-discord--finish-in-server-setup-setup-set) |
| Run Web UI locally (`npm run dev`) | [SETUP.md — Section 9](SETUP.md#9-web-ui-on-your-pc) |
| Create first web account + **Sign in** | [SETUP.md — Section 11](SETUP.md#11-web-accounts--sign-in-discord-verify-bootstrap) |

### 4.1 Point the Web UI at your server

On your PC, in **`webui/.env`** (or in the app under **Settings** after sign-in):

- **Same LAN:** `VITE_API_BASE_URL=http://YOUR_SERVER_IP:5050`
- **HTTPS reverse proxy:** `VITE_API_BASE_URL=https://api.yourdomain.com`

Restart **`npm run dev`** after changing **`webui/.env`**.

If the browser shows **Cannot reach API**, open port **5050** ([Section 7](#7-firewall)) and set **`HOMEBOT_ALLOWED_ORIGINS`** on the server to include your Web UI origin (e.g. `http://localhost:5173`).

### 4.2 Backups (optional, recommended on VPS)

| Goal | Action |
|------|--------|
| **One-off local copy** | `sudo bash /opt/homebot/app/scripts/backup-homebot-sqlite.sh` |
| **Weekly local + Google Drive** | Set **`HOMEBOT_GDRIVE_*`** in **`.env`**, run **`rclone config`**, enable **`homebot-backup-with-gdrive.timer`** |

Full steps: **[SETUP.md — Section 20](SETUP.md#20-backing-up-sqlite-homebotdb)** (local §20.1, Drive §20.2 with retention).

---

## 5. Updates when you push to GitHub

On the server (after **`git push`** to the branch **`/opt/homebot/app`** tracks):

```bash
sudo bash /opt/homebot/app/scripts/ubuntu/update-homebot.sh
```

The update script:

1. Verifies **`.env`** has required secrets.
2. **Stops** **`homebot.service`**
3. Runs **`git pull --ff-only`** as **`homebot`**
4. Runs **`dotnet publish`**
5. **Starts** the service again

**Manual equivalent:**

```bash
sudo systemctl stop homebot.service
sudo -u homebot bash -c 'cd /opt/homebot/app && git pull --ff-only && dotnet publish -c Release -o /opt/homebot/app/publish'
sudo systemctl start homebot.service
curl -sS http://127.0.0.1:5050/api/health
```

**Confirm**

- [ ] **`curl …/api/health`** still OK after update.
- [ ] Discord bot still **online**.

---

## 6. Public HTTPS API (optional)

Browsers on **`https://…github.io`** cannot call **`http://YOUR_LAN_IP:5050`** reliably. For a public Web UI:

1. Point DNS (e.g. **`api.yourdomain.com`**) at your server.
2. Install **Caddy** or **nginx** on **80/443** and proxy to **`http://127.0.0.1:5050`**.
3. In **`/opt/homebot/app/.env`**, set for example:

   ```env
   HOMEBOT_API_URL=http://0.0.0.0:5050
   HOMEBOT_ALLOWED_ORIGINS=https://YOUR_USER.github.io,http://localhost:5173
   ```

4. Restart: **`sudo systemctl restart homebot.service`**
5. Build or deploy the Web UI with **`VITE_API_BASE_URL=https://api.yourdomain.com`**

Copy-paste proxy examples: **[OPS.md](OPS.md)** and **[SETUP.md — Section 14](SETUP.md#14-optional--public-https-api-reverse-proxy)**.

---

## 7. Firewall

**LAN only (phone/PC on same Wi‑Fi):**

```bash
sudo ufw allow OpenSSH
sudo ufw allow 5050/tcp
sudo ufw enable
sudo ufw status
```

**Public internet:** prefer **HTTPS on 443** via a reverse proxy ([Section 6](#6-public-https-api-optional)); do not expose **5050** to the world unless you know the risk.

---

## 8. Useful commands

| Task | Command |
|------|---------|
| View logs (live) | `journalctl -u homebot.service -f` |
| Last 50 log lines | `journalctl -u homebot.service -n 50 --no-pager` |
| Restart | `sudo systemctl restart homebot.service` |
| Stop | `sudo systemctl stop homebot.service` |
| Start | `sudo systemctl start homebot.service` |
| Status | `sudo systemctl status homebot.service` |
| Edit config | `sudo -u homebot nano /opt/homebot/app/.env` |
| Health check | `curl -sS http://127.0.0.1:5050/api/health` |
| Install / reinstall layout | `sudo bash /opt/homebot/app/scripts/ubuntu/install-homebot.sh <git-url>` |
| Update after `git push` | `sudo bash /opt/homebot/app/scripts/ubuntu/update-homebot.sh` |
| SQLite backup | [SETUP.md — Section 20](SETUP.md#20-backing-up-sqlite-homebotdb) |
| Google Drive backup | [SETUP.md — Section 20.2](SETUP.md#202-off-site-backup-to-google-drive-optional) (`backup-homebot-with-gdrive.sh` + rclone) |

**Custom paths** (optional): set **`HOMEBOT_APP_DIR`**, **`HOMEBOT_INSTALL_ROOT`**, or **`HOMEBOT_SERVICE_NAME`** when calling the scripts.

---

## 9. Troubleshooting

| Symptom | What to do |
|---------|------------|
| Install exits asking to edit **`.env`** | Expected on first run. Fill [Section 2.4](#24-edit-secrets-required-once), then **`sudo systemctl restart homebot.service`**. |
| **`systemctl status`** → **failed** / **activating** | `journalctl -u homebot.service -xe` — often empty **`DISCORD_TOKEN`**, wrong **`DISCORD_GUILD_ID`**, or **`HOMEBOT_API_ENABLED`** not **`true`**. |
| **`curl …/api/health`** connection refused | Service not running: **`systemctl start homebot.service`**. Or API disabled: set **`HOMEBOT_API_ENABLED=true`**. |
| **`http://server:5050/`** returns **404** | Normal — use **`/api/health`**, not `/`. |
| Bot **offline** in Discord | Check token and [privileged intents](SETUP.md#42-gateway-intents-required-for-a-healthy-bot); **`journalctl`** for login errors. |
| Slash commands missing | **`DISCORD_GUILD_ID`** must match the server where the bot was invited; restart after fixing **`.env`**. |
| Web UI **Cannot reach API** from PC | Firewall [Section 7](#7-firewall); **`HOMEBOT_ALLOWED_ORIGINS`** includes your browser origin; **`VITE_API_BASE_URL`** uses server IP or HTTPS URL, not **`localhost`** on another device. |
| Web UI **503** on sign-in / writes | Set **`HOMEBOT_WEB_JWT_SECRET`** (≥ 32 chars) and **`HOMEBOT_API_TOKEN`** in **`.env`**; restart service. |
| **`git pull`** fails in update script | Fix merge conflicts on the server or reset to a clean branch; install script does not overwrite an existing **`.env`**. |
| **`dotnet publish`** fails | Run **`dotnet --version`** (expect 10.x); ensure disk space; read compile errors in the terminal. |

More detail: **[SETUP.md — Section 17](SETUP.md#17-troubleshooting)** and **[README.md](../README.md)**.

---

## Final checklist (server)

| # | Check | Command / expected |
|---|--------|-------------------|
| 1 | Service enabled on boot | `systemctl is-enabled homebot.service` → **enabled** |
| 2 | Service running | `systemctl is-active homebot.service` → **active** |
| 3 | API health | `curl -sS http://127.0.0.1:5050/api/health` → **`"status":"ok"`** |
| 4 | Discord | Bot **online** in your server |
| 5 | Secrets file | `ls -la /opt/homebot/app/.env` → owned by **homebot**, mode **600** |
| 6 | Web UI from PC | Browser reaches API using server IP or HTTPS URL |

Then complete [SETUP.md](SETUP.md) Sections **9–11** on your PC for channels, Web UI, and accounts.
