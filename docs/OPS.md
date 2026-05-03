# HomeBot — optional ops notes

Short **hosting** snippets for operators who already followed **[SETUP.md](../SETUP.md)**. Not required for local dev.

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

The repo ships **`.github/workflows/deploy-webui.yml`**. Configure the **`HOMEBOT_API_PUBLIC_URL`** [repository variable](https://docs.github.com/en/actions/learn-github-actions/variables#defining-configuration-variables-for-multiple-workflows) and enable **Pages → GitHub Actions** as in SETUP §5.

---

## Renewals

- **Let’s Encrypt:** `certbot renew` (often cron/systemd timer). After renewal, reload nginx/Caddy if your stack requires it.
- **Discord / OAuth secrets:** rotate in Discord Developer Portal and `.env`; restart the process.
