# HomeBot on iPhone (without the App Store)

Apple does not allow installing native apps outside the App Store for most households. HomeBot supports **three practical options** — ranked by ease.

## 1. Progressive Web App (recommended)

The Web UI is a PWA. On iPhone:

1. Open your HomeBot URL in **Safari** (Chrome on iOS does not support full PWA install).
2. Tap **Share** → **Add to Home Screen**.
3. Launch HomeBot from the home screen icon — full-screen, no browser chrome.

Production builds register a service worker (`webui/public/sw.js`) for offline shell caching and **Web Push** (calendar reminders, budget alerts). API calls still need network reachability to your VM.

### Push notifications (installed PWA)

1. Set VAPID keys on the server (`HOMEBOT_VAPID_PUBLIC_KEY`, `HOMEBOT_VAPID_PRIVATE_KEY`, `HOMEBOT_VAPID_SUBJECT`) — generate with `npx web-push generate-vapid-keys`.
2. Add HomeBot to the home screen (above), open **Settings → Push notifications**, and enable.
3. iOS 16.4+ supports push for installed PWAs in Safari; you must grant notification permission when prompted.

Push respects per-user notification preferences (calendar DMs, budget alerts, weekly digest).

**In the installed PWA:** **Settings → Appearance** toggles dark/light theme. Keyboard shortcuts: **`/`** search, **`?`** help, **`g` then `h/b/w/m/c/s`** navigate — full list in **[FEATURES.md](./FEATURES.md)**.

**Tip:** Use HTTPS (Caddy + DuckDNS) so Safari treats the app as secure.

## 2. Capacitor wrapper (TestFlight or ad-hoc, still Apple rules)

The repo can wrap the built Web UI in [Capacitor](https://capacitorjs.com/) for a native shell (splash, icons, optional push later).

| Distribution | App Store review? | Notes |
|--------------|-----------------|-------|
| **Add to Home Screen (PWA)** | No | Best for two iPhones in one household |
| **TestFlight** | Light review | Up to 10k testers; rebuild via Xcode |
| **Ad-hoc / development** | No | Needs $99/yr Apple Developer; register each device UDID (100/yr) |
| **Enterprise** | No | Only for orgs with Apple Enterprise Program |

Capacitor does **not** bypass Apple — it only packages the same web app. For your stated goal (no App Store certification), **use the PWA**.

### Optional local Capacitor build (advanced)

```bash
cd webui
npm run build
npm install @capacitor/core @capacitor/cli @capacitor/ios
npx cap init HomeBot com.homebot.app --web-dir dist
npx cap add ios
npx cap copy ios
npx cap open ios
```

Install to your phones via Xcode → Devices (development provisioning) or TestFlight.

## 3. iOS Shortcuts & bookmark

For Siri/automation or a quick Safari launcher, see **[SHORTCUTS.md](./SHORTCUTS.md)** — example Shortcuts for “add to buy”, calendar peek, and opening the dashboard.

If PWA install is blocked, a simple bookmark Shortcut that opens your HomeBot URL is weaker than PWA but needs zero server setup.

---

## Networking

- **Same Wi‑Fi / VPN:** use `http://your-vm:5050` or your DuckDNS HTTPS URL.
- **GitHub Pages UI + Oracle API:** set `HOMEBOT_API_PUBLIC_URL` on Pages and CORS on the VM (`HOMEBOT_ALLOWED_ORIGINS`).

See [SETUP.md §2.5](SETUP.md#25-free-vm-hosting-optional) for Oracle + DuckDNS + Pages.
