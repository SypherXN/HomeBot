# 🏠 HomeBot — Design Document

## 🎯 Core Philosophy
A shared household system to manage tasks, purchases, finances, and scheduling.

## 🧠 System Architecture
UI Layer (Discord / Future Web UI)
→ Command Layer
→ Service Layer
→ Database (SQLite)

## 🧱 Core Systems
### Config
/config-set, /config-get
Keys: page_size, timezone

### Setup
/setup-set, /setup-view
Features: buy, wishlist, money, calendar

### Undo
/undo

### Help
/help [topic]

## 🛒 Buy System
Commands:
/buy-add, /buy-list, /buy-complete, /buy-delete

## 🎁 Wishlist System
Commands:
/wishlist-add, /wishlist-list, /wishlist-view, /wishlist-edit, /wishlist-delete

## 💰 Money System
Commands:
/money-add, /money-pay, /money-summary, /money-list, /money-edit, /money-delete

## 📅 Calendar System
Commands:
/calendar-add, /calendar-list, /calendar-today, /calendar-upcoming, /calendar-view

Supports:
- NLP dates
- reminders
- recurrence
- timezone

## 📊 Dashboard
/dashboard

## 📐 UI Standards
Format:
[ICON] #ID Name | Date | 👤 Assigned

## 🚀 Future
API, Web UI, Mobile
