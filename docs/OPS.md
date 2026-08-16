# HomeBot — optional ops notes

Short **hosting** snippets for operators who already followed **[SETUP.md](SETUP.md)**. Product capabilities: **[FEATURES.md](./FEATURES.md)**. Server implementation: **[BACKEND.md](./BACKEND.md)**. Not required for local dev.

---

## Reverse proxy + TLS (API on 443)

HomeBot’s HTTP listener defaults to **`5050`** (see README). Put **Caddy** or **nginx** on **`80`/`443`**, terminate TLS, and forward to **`127.0.0.1:5050`**.

### Caddy (example)

Replace `api.example.com` and ensure DNS points at this host.

```caddy
api.example.com {
    encode gzip
    reverse_proxy 127.0.0.1:5050
}
```

Caddy obtains certificates automatically. Reload: `caddy reload` (or your unit’s restart command).

### nginx (example)

Use **certbot** (`certbot --nginx`) or your CA to obtain certs, then:

```nginx
server {
    listen 443 ssl http2;
    server_name api.example.com;

    # ssl_certificate /etc/letsencrypt/live/api.example.com/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/api.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:5050;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Set **`HOMEBOT_ALLOWED_ORIGINS`** on the API to include every **browser origin** that calls the API (GitHub Pages URL, `https://app.example.com`, etc.) — not the API hostname alone.

---

## GitHub Pages deploy

The repo ships **`.github/workflows/pages-webui.yml`**. Configure the **`HOMEBOT_API_PUBLIC_URL`** [repository variable](https://docs.github.com/en/actions/learn-github-actions/variables#defining-configuration-variables-for-multiple-workflows) and enable **Pages → GitHub Actions** as in [SETUP.md — Section 13](SETUP.md#13-optional--github-pages-static-web-ui).

**Ubuntu install/update:** see **[UBUNTU_DEPLOY.md](UBUNTU_DEPLOY.md)** (`scripts/ubuntu/install-homebot.sh`, `update-homebot.sh`).

---

## Backups (local + optional Google Drive)

HomeBot backups are **operator scripts**, not API features. Data lives in **`homebot.db`** (and optional WAL sidecars).

| Step | Action |
|------|--------|
| **Before upgrades** | Always back up — see below. |
| **Local (Linux)** | `sudo bash /opt/homebot/app/scripts/backup-homebot-sqlite.sh` or enable **`homebot-sqlite-backup.timer`**. |
| **Local + Drive (recommended on VPS)** | Set **`HOMEBOT_GDRIVE_*`** in `.env`, configure **`rclone`**, enable **`homebot-backup-with-gdrive.timer`**. |
| **Restore** | Stop service → restore file → start — [SETUP.md §20.1.5](SETUP.md#2015-restore-from-a-backup-short-procedure) or **`scripts/restore-homebot-backup.sh`** (dry-run by default; pass **`--apply`**). |

Full guide: **[SETUP.md — Section 20](SETUP.md#20-backing-up-sqlite-homebotdb)** (local §20.1, Google Drive §20.2 with retention).

**Scripts in repo:**

| Script | Role |
|--------|------|
| `scripts/backup-homebot-sqlite.sh` | Stop → copy → start |
| `scripts/backup-homebot-with-gdrive.sh` | Local backup + Drive sync |
| `scripts/sync-homebot-backups-to-gdrive.sh` | Upload/prune only (needs existing local copies) |
| `scripts/restore-homebot-backup.sh` | Dry-run restore plan; **`--apply`** stops service, replaces DB, restarts |
| `scripts/systemd/homebot-backup-with-gdrive.*.example` | Weekly timer with `EnvironmentFile=` |

When **`HOMEBOT_GDRIVE_BACKUP_ENCRYPT=true`**, uploads are GPG-encrypted (`.gpg` on Drive); keep the passphrase file safe and test restore on a copy first.

---

## Ops API (admin only)

Requires **web admin** auth (admin web user or **`HOMEBOT_WEB_ADMIN_DISCORD_IDS`**) plus bearer JWT or **`HOMEBOT_API_TOKEN`**.

| Endpoint | Purpose |
|----------|---------|
| **`GET /api/ops/health`** | Detailed health JSON (DB, backup age, Google sync, workers) |
| **`GET /api/ops/metrics`** | Prometheus text with **`Accept: text/plain`**; JSON wrapper otherwise |

The Web UI **Diagnostics** page (`/health`) calls these when you are signed in as admin.

---

## VM updates

GitHub Actions does not SSH to the server. After a push, update the API on the VM:

```bash
sudo bash /opt/homebot/app/scripts/ubuntu/update-homebot.sh
```

That script runs `git pull`, `dotnet publish`, and restarts **`homebot.service`**. Your **`.env`** and **`homebot.db`** are left in place.

## Renewals

- **Let’s Encrypt:** `certbot renew` (often cron/systemd timer). After renewal, reload nginx/Caddy if your stack requires it.
- **Discord / OAuth secrets:** rotate in Discord Developer Portal and `.env`; restart the process.

---

## SQLite upgrades (never wipe `homebot.db`)

HomeBot applies **additive schema migrations** automatically on startup. Applied versions are recorded in the **`SchemaMigrations`** table.

**Before every upgrade:**

1. Back up the database ([SETUP.md — Section 20](SETUP.md#20-backing-up-sqlite-homebotdb); local §20.1, optional Google Drive §20.2).
2. Deploy the new build and restart the service.
3. Confirm logs show `[HomeBot DB] Applying schema migration: …` only for **new** IDs (or silence if already current).

**Developer rules:** migrations in `DatabaseSchemaMigrations.cs` must stay additive; never delete `homebot.db` in app code; never rename applied migration ids.

**Budget:** migration `002_budget_core` creates budget tables. Discord: `/setup-set feature:budget channel:#your-channel`.

---

## Runtime diagnostics (common local issues)

- **API root 404 is normal:** `GET /` on port `5050` is not a health page. Check `GET /api/health`, `GET /api/meta`, or `GET /openapi/v1.json`.
- **UI reachable, API unreachable:** verify the browser is calling the correct API origin (usually `http://localhost:5050` in local dev), then verify CORS includes the UI origin.
- **“Token not accepted” in UI:** ensure either `HOMEBOT_API_TOKEN` is configured and matches the UI bearer, or login JWTs are enabled with `HOMEBOT_WEB_JWT_SECRET`.
- **Protected routes return 503:** expected when neither `HOMEBOT_API_TOKEN` nor `HOMEBOT_WEB_JWT_SECRET` is set.
- **Blank Web UI (dev) after dependency churn:** reinstall `webui` dependencies from lockfile and restart Vite.
