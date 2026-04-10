# food-donation-supabase-web

Vanilla HTML/CSS/JS (ES Modules) single-page app for the Food Donation Management System using Supabase (PostgreSQL).

## Quick Start

1. Configure environment keys:
   - Copy `.env.example` values into `js/_env.js`.
   - Fill:
     - `SUPABASE_URL`
     - `SUPABASE_ANON_KEY`

```js
// js/_env.js
window._env = {
  SUPABASE_URL: "<YOUR_SUPABASE_URL>",
  SUPABASE_ANON_KEY: "<YOUR_SUPABASE_ANON_KEY>",
};
```

2. Run with a local server (no build step):
   - `python -m http.server 8000`
   - then open `http://localhost:8000/food-donation-supabase-web/`
   - or use VS Code Live Server.

## Supabase Assumptions

Tables already exist:

- `tblDonor`
- `tblProduct`
- `tblDonationLot`
- `tblStorageZone`
- `tblInventory`
- `tblBeneficiary`
- `tblOrders`
- `tblOrderLine`
- `tblPickAllocation`
- `tblZoneCapacityLog`

For demo simplicity, use anon key with either:

- RLS disabled, or
- permissive RLS policies for the above tables.

## Features

- Hash-router SPA (`/#/...`) with lazy-loaded page modules.
- Demo login page (`/#/login`) with stakeholder identities.
- Global topbar actions, sidebar navigation, dark mode persistence.
- Search + pagination for key lists.
- CRUD pages for donor/product/beneficiary/zone and operational pages for lots, orders, inventory, picking.
- FEFO-based allocation support.
- Reports page with required graded queries:
  - Near-expiry lots (7 days)
  - Zone utilization
  - Open order fulfillment
  - Donor contribution summary
- CSV export for each report.

## Demo Login Accounts

Stakeholder login details are stored in:

- `./exampleloginInfo/login-details.md`
- `./exampleloginInfo/login-details.csv`

Use any account on the login page.

## Architecture Overview

```text
index.html
  -> js/main.js
      -> js/router.js (hash routes)
          -> js/pages/*.js
              -> js/services/api/*.js
                  -> js/services/supabaseClient.js
                      -> Supabase PostgreSQL
```

## Folder Structure

```text
food-donation-supabase-web/
├─ index.html
├─ README.md
├─ .env.example
├─ assets/
├─ css/
├─ js/
│  ├─ _env.js
│  ├─ main.js
│  ├─ router.js
│  ├─ ui/
│  ├─ services/
│  └─ pages/
└─ docs/
   ├─ screenshots/
   └─ sql/
```

## Screenshots

Place submission proof images in:

- `docs/screenshots/dashboard.svg`
- `docs/screenshots/crud-pages.svg`
- `docs/screenshots/reports.svg`
- `docs/screenshots/picking-flow.svg`

You can replace these placeholders with real screenshots from your running app.

## Notes for SEHH2240 Implementation Alignment

- **Structure:** modular API/page/router architecture.
- **Interface:** responsive layout, keyboard focus, semantic HTML, micro interactions.
- **Queries:** dedicated reports page + CSV export.
- **Forms:** validated create/edit flows with feedback toasts.
- **Reports:** all 4 required reports implemented.
