# HomeBot webhooks

Automation endpoints for scripts, Home Assistant, iOS Shortcuts, and other tools. All webhook routes require:

- Header **`X-HomeBot-Webhook-Secret`**: must match **`HOMEBOT_WEBHOOK_SECRET`** on the server
- Query **`actorUserId`**: Discord snowflake (digits) of who performed the action — same as other API mutations

Base URL examples below use `https://homebot.example.com`. Replace with your API host.

---

## Buy list — add item

**`POST /api/hooks/buy/add`**

```bash
curl -sS -X POST "https://homebot.example.com/api/hooks/buy/add?actorUserId=YOUR_DISCORD_ID" \
  -H "Content-Type: application/json" \
  -H "X-HomeBot-Webhook-Secret: YOUR_SECRET" \
  -d '{"name":"Milk","quantity":"1","store":"Costco","tags":"dairy","notes":"2%"}'
```

| Field | Required | Notes |
|-------|----------|-------|
| `name` | yes | Item name |
| `quantity` | no | Defaults to `1` |
| `store`, `tags`, `notes` | no | Same rules as Web UI / Discord |

---

## Calendar — add event

**`POST /api/hooks/calendar/add`**

```bash
curl -sS -X POST "https://homebot.example.com/api/hooks/calendar/add?actorUserId=YOUR_DISCORD_ID" \
  -H "Content-Type: application/json" \
  -H "X-HomeBot-Webhook-Secret: YOUR_SECRET" \
  -d '{"title":"Trash night","start":"2026-05-28 18:00","end":"2026-05-28 19:00","allDay":false,"description":"Curbside"}'
```

| Field | Required | Notes |
|-------|----------|-------|
| `title` | yes | Event title |
| `start` | no | `yyyy-MM-dd HH:mm` — defaults to now |
| `end` | no | Optional end time |
| `allDay` | no | Boolean |
| `description` | no | Event notes |

If Google Calendar sync is connected, the event is pushed on the next sync cycle.

---

## Budget — log expense

**`POST /api/hooks/budget/expense`**

```bash
curl -sS -X POST "https://homebot.example.com/api/hooks/budget/expense?actorUserId=YOUR_DISCORD_ID" \
  -H "Content-Type: application/json" \
  -H "X-HomeBot-Webhook-Secret: YOUR_SECRET" \
  -d '{"amount":42.50,"categoryName":"Groceries","merchant":"Whole Foods","note":"Weekly shop","receiptUrl":"https://example.com/receipt"}'
```

| Field | Required | Notes |
|-------|----------|-------|
| `amount` | yes | Positive number |
| `categoryName` | yes | Must match an existing budget category |
| `merchant`, `note` | no | Stored on the transaction |
| `receiptUrl` | no | Optional link to receipt (shown in Web UI ledger) |

---

## iOS Shortcuts tip

Create a Shortcut that:

1. Asks for text (item name or amount)
2. Runs **Get Contents of URL** with the curl payloads above
3. Saves `HOMEBOT_WEBHOOK_SECRET` and your `actorUserId` in Shortcut variables (not in a shared gallery shortcut)

---

## Home Assistant example

```yaml
rest_command:
  homebot_buy_milk:
    url: "https://homebot.example.com/api/hooks/buy/add?actorUserId=123456789012345678"
    method: POST
    headers:
      Content-Type: "application/json"
      X-HomeBot-Webhook-Secret: !secret homebot_webhook_secret
    payload: '{"name":"Milk","quantity":"1"}'
```

---

## Errors

| HTTP | Meaning |
|------|---------|
| 401 | Missing or wrong webhook secret |
| 400 | Missing body, invalid `actorUserId`, or validation error |
| 404 | Budget category not found (expense hook) |

See also **`HOMEBOT_WEBHOOK_SECRET`** in [`.env.example`](../.env.example) and [FEATURES.md](./FEATURES.md).
