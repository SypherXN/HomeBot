# 🏠 HomeBot — Design Document

## 🎯 Core Philosophy
A shared household system to manage tasks, purchases, finances, and scheduling.

## 🧠 System Architecture
UI Layer (**Discord** + **HTTP API / Web UI**)
→ Command / API layer
→ Service layer
→ Database (SQLite)

## 🧱 Core Systems
### Config
`/config-set`, `/config-view`, `/timezone-set`, `/timezone-list`

Keys include: **page_size**, **timezone**

### Setup
`/setup-set`, `/setup-view`

Features: **buy**, **wishlist**, **money**, **calendar**, optional **audit** (web sign-in log)

### Undo
`/undo` — per-user action log; applies to buy, wishlist, money, calendar, recurrence exception rows, etc.

### Help
`/help` with **topic**: `general`, `web`, `setup`, `config`, `calendar`, `money`, `wishlist`, `buy`

## 🛒 Buy System
Commands:
`/buy-add`, `/buy-list`, `/buy-complete`, `/buy-delete`, `/buy-edit`, `/buy-clear-completed`

## 🎁 Wishlist System
Commands:
`/wishlist-add`, `/wishlist-list`, `/wishlist-view`, `/wishlist-edit`, `/wishlist-complete`, `/wishlist-delete`, `/wishlist-clear-completed`

## 💰 Money System
Commands:
`/money-add`, `/money-pay`, `/money-summary`, `/money-list`, `/money-edit`, `/money-delete`

## 📅 Calendar System
Commands:
`/calendar-add`, `/calendar-list`, `/calendar-view`, `/calendar-today`, `/calendar-upcoming`, `/calendar-edit`, `/calendar-complete`, `/calendar-delete`

Per recurrence **occurrence** (canonical UTC slot, same key as API **instanceStartUtc**):
`/calendar-instance-omit`, `/calendar-instance-complete`, `/calendar-instance-edit`

Supports:
- Natural-language dates
- Reminders
- Recurrence (daily / weekly)
- Per-row and household time zones

## 📊 Dashboard
`/dashboard`

## 📐 UI Standards
Format:
`[ICON] #ID Name | Date | 👤 Assigned`

## 🚀 Product surface
**Shipped:** HTTP API (`/api/...`), React Web UI (Vite), JWT + optional Discord OAuth, same SQLite as Discord.
