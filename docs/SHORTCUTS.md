# iOS Shortcuts for HomeBot

Use the [webhook API](./WEBHOOKS.md) from Apple Shortcuts on iPhone. Store secrets in Shortcut variables — do not share shortcuts publicly with your webhook secret embedded.

**Requirements:** HomeBot API reachable over HTTPS, `HOMEBOT_WEBHOOK_SECRET` set, your Discord user id as `actorUserId`.

---

## Web app keyboard shortcuts (browser / PWA)

When using HomeBot in Safari or the installed PWA (not Shortcuts):

| Key | Action |
|-----|--------|
| **`/`** | Focus global search |
| **`?`** | Open shortcuts help |
| **`g` then `h`** | Go to Home |
| **`g` then `b/w/m/c/s`** | Buy, Wishlist, Money, Calendar, Settings |
| **`n`** | Focus add form on Buy or Wishlist |
| **`Esc`** | Close help overlay |

Press **`?`** in the app for the live list.

---

## Quick add to buy list

1. Shortcuts → **+** → add **Ask for Input** (e.g. “Item name”).
2. Add **Get Contents of URL**:
   - URL: `https://YOUR-HOST/api/hooks/buy/add?actorUserId=YOUR_DISCORD_ID`
   - Method: **POST**
   - Headers: `Content-Type` = `application/json`, `X-HomeBot-Webhook-Secret` = your secret
   - Request body: JSON with `"name"` from the Ask step and `"quantity":"1"`

3. Optional: **Show Result** or haptic on success.

---

## Log a budget expense

Same pattern against `POST /api/hooks/budget/expense`:

```json
{
  "amount": 12.50,
  "categoryName": "Groceries",
  "merchant": "Shortcut",
  "note": "Quick log",
  "receiptUrl": "https://example.com/receipt.pdf"
}
```

`receiptUrl` is optional — same field as the Web UI budget ledger.

Category name must already exist in HomeBot (create in Web UI first).

---

## Add a calendar event

`POST /api/hooks/calendar/add`:

```json
{
  "title": "Dentist",
  "start": "2026-06-01 14:00",
  "end": "2026-06-01 15:00"
}
```

Use **Current Date** formatted as `yyyy-MM-dd HH:mm` in Shortcuts for dynamic times.

---

## “What’s for dinner?”

Use Discord **`/meal-dinner`** in your server, or open the Web UI **Meals** page / installed PWA.

---

## Siri phrases

After building a Shortcut, tap the shortcut name → **Add to Siri** → e.g. “Add to HomeBot buy list”.

---

See also [MOBILE.md](./MOBILE.md) and [WEBHOOKS.md](./WEBHOOKS.md).
