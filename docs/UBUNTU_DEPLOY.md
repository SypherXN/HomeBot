# Ubuntu deployment (simple)

Deploy HomeBot on **Ubuntu 22.04 or 24.04** so it starts on boot and keeps running after you disconnect from SSH.

**You need before you start**

| Item | Where to get it |
|------|-----------------|
| Discord **bot token** | [Discord Developer Portal](https://discord.com/developers/applications) → your app → Bot |
| Discord **server (guild) ID** | Discord → Server settings → Widget (or developer mode + copy id) |
| Two long random secrets | Any password manager (`HOMEBOT_API_TOKEN`, `HOMEBOT_WEB_JWT_SECRET` ≥ 32 chars) |
| Git clone URL | Your repo on GitHub, e.g. `https://github.com/you/HomeBot.git` |

The app reads **environment variables only**. On Ubuntu, **`systemd`** loads them from **`/opt/homebot/app/.env`**.

---

## Option A — One script (recommended)

SSH into the server, then run **one command** (replace the URL):

```bash
# Recommended: clone on the server, then run the script from the repo
git clone https://github.com/YOUR_USER/HomeBot.git /tmp/HomeBot
cd /tmp/HomeBot
sudo bash scripts/ubuntu/install-homebot.sh https://github.com/YOUR_USER/HomeBot.git
```

You can also copy only the script from GitHub (`raw.githubusercontent.com/.../install-homebot.sh`); the script embeds the `systemd` unit if the example file is not present.

What the script does:

1. Installs **git**, **curl**, and **.NET 10 SDK**
2. Creates user **`homebot`** and directory **`/opt/homebot/app`**
3. Clones your repository
4. Copies **`.env.example`** → **`.env`** if missing
5. Runs **`dotnet publish`**
6. Installs **`homebot.service`** and enables it on boot

**Then edit secrets** (required once):

```bash
sudo -u homebot nano /opt/homebot/app/.env
```

Minimum lines to set:

```env
DISCORD_TOKEN=your-bot-token
DISCORD_GUILD_ID=123456789012345678
HOMEBOT_API_ENABLED=true
HOMEBOT_API_TOKEN=your-long-random-api-token
HOMEBOT_WEB_JWT_SECRET=your-long-random-secret-at-least-32-chars
```

Restart:

```bash
sudo systemctl restart homebot.service
```

**Verify:**

```bash
curl -sS http://127.0.0.1:5050/api/health
sudo systemctl status homebot.service
```

Open the Web UI on your PC ([SETUP.md — Web UI](../SETUP.md#9-web-ui-on-your-pc)) and point Settings → API base URL at your server (`http://SERVER_IP:5050` on LAN, or HTTPS URL after Part C below).

---

## Option B — Manual steps (same result, no script)

```bash
# 1. Packages + .NET 10 (Ubuntu 22.04 example)
sudo apt update && sudo apt install -y curl git ca-certificates wget
wget https://packages.microsoft.com/config/ubuntu/22.04/packages-microsoft-prod.deb -O /tmp/packages-microsoft-prod.deb
sudo dpkg -i /tmp/packages-microsoft-prod.deb && sudo apt update
sudo apt install -y dotnet-sdk-10.0

# 2. User + clone
sudo adduser --disabled-password --gecos "" homebot
sudo mkdir -p /opt/homebot && sudo chown homebot:homebot /opt/homebot
sudo -u homebot git clone https://github.com/YOUR_USER/HomeBot.git /opt/homebot/app

# 3. Environment file
sudo cp /opt/homebot/app/.env.example /opt/homebot/app/.env
sudo chown homebot:homebot /opt/homebot/app/.env
sudo chmod 600 /opt/homebot/app/.env
sudo -u homebot nano /opt/homebot/app/.env   # fill secrets (see Option A)

# 4. Publish
sudo -u homebot bash -c 'cd /opt/homebot/app && dotnet publish -c Release -o /opt/homebot/app/publish'

# 5. systemd
sudo cp /opt/homebot/app/scripts/systemd/homebot.service.example /etc/systemd/system/homebot.service
sudo systemctl daemon-reload
sudo systemctl enable --now homebot.service
```

---

## Updates after you push to GitHub

From the server:

```bash
sudo bash /opt/homebot/app/scripts/ubuntu/update-homebot.sh
```

Or manually:

```bash
sudo -u homebot bash -c 'cd /opt/homebot/app && git pull && dotnet publish -c Release -o /opt/homebot/app/publish'
sudo systemctl restart homebot.service
```

---

## Part C — Public HTTPS API (optional, for GitHub Pages)

Browsers on **`https://…github.io`** cannot call **`http://YOUR_LAN_IP:5050`** reliably. For a public Web UI:

1. Point DNS (e.g. **`api.yourdomain.com`**) at your server.
2. Put **Caddy** or **nginx** on ports **80/443** and proxy to **`127.0.0.1:5050`**.
3. In **`.env`**, set **`HOMEBOT_API_URL=http://127.0.0.1:5050`** and add your Pages origin to **`HOMEBOT_ALLOWED_ORIGINS`**.

Copy-paste proxy examples: **[OPS.md](OPS.md)** and **[SETUP.md — Section 14](../SETUP.md#14-optional--public-https-api-reverse-proxy)**.

---

## Useful commands

| Task | Command |
|------|---------|
| View logs | `journalctl -u homebot.service -f` |
| Restart | `sudo systemctl restart homebot.service` |
| Stop | `sudo systemctl stop homebot.service` |
| Status | `sudo systemctl status homebot.service` |
| Edit config | `sudo -u homebot nano /opt/homebot/app/.env` |

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Service fails immediately | `journalctl -u homebot.service -xe` — usually empty **`DISCORD_TOKEN`** or bad **`.env`** line |
| `curl …/api/health` fails | `systemctl status homebot.service`; confirm **`HOMEBOT_API_ENABLED=true`** |
| `http://server:5050/` returns **404** | Normal — use **`/api/health`** |
| Web UI “token not accepted” | Bearer in Settings must match **`HOMEBOT_API_TOKEN`** in **`.env`** |
| Protected API returns **503** | Set **`HOMEBOT_API_TOKEN`** or **`HOMEBOT_WEB_JWT_SECRET`** (≥ 32 bytes) |

More detail: **[SETUP.md — Section 17](../SETUP.md#17-troubleshooting)** and **[README.md](../README.md)**.

---

## What you do **not** need on the server

- **Node.js** — only required if you build the Web UI on the server. For **GitHub Pages**, Actions builds the static site; the server only runs the .NET API + Discord bot.
