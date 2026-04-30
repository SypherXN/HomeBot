# 🌐 HomeBot Web UI Plan

## 🎯 Goal
Build a web-based interface for HomeBot that:
- Removes the need for Discord command input
- Reuses existing backend logic
- Provides intuitive UI per feature

---

## 🧠 Architecture Overview

### Current
Discord → Commands → Services → SQLite

### Target
Web UI (GitHub Pages)
        ↓
Web API (ASP.NET)
        ↓
Services
        ↓
SQLite

---

## 🔒 Security Model
- Frontend: NO secrets
- Backend: holds tokens, DB access

---

## 🧱 Phase 1 — Service Refactor
Replace Discord outputs (Embed) with plain models:
- CalendarItem
- Transaction
- WishlistItem
- BuyItem

---

## 🧱 Phase 2 — API Layer

### Calendar
GET /calendar  
GET /calendar/today  
GET /calendar/upcoming  
POST /calendar  
PUT /calendar/{id}  
DELETE /calendar/{id}  

### Money
GET /money/summary  
GET /money/transactions  
POST /money/add  
POST /money/pay  

### Wishlist
GET /wishlist  
POST /wishlist  
PUT /wishlist/{id}  
DELETE /wishlist/{id}  

### Buy
GET /buy  
POST /buy  
DELETE /buy/{id}  

---

## 🧱 Phase 3 — Web UI

Tech:
- React + Vite
- Tailwind CSS

---

# 📅 Calendar
- Google Calendar style grid
- Sidebar task list
- Reminders + recurrence indicators

---

# 💰 Money
- Splitwise style
- Summary + transactions
- Add expense/payment

---

# 🎁 Wishlist
- Amazon-style list
- Links, price, priority

---

# 🛒 Buy
- Simple checklist
- Category grouping

---

# 📊 Dashboard
- Today view
- Money summary
- Quick lists

---

# 🧠 UX Principles
- No command typing
- Consistent UI
- Fast interactions
- Mobile-friendly

---

# 🚀 Deployment
Frontend: GitHub Pages  
Backend: Local / Cloud  

---

# 🔮 Future
- Mobile app
- Notifications
- Authentication

---

# 🎯 Final Result
Web UI + API + existing backend → full platform
