# Luxtronic Rental Tracker

## Project Summary

A LAN web app for Luxtronic's shop to track PC/laptop rentals — inventory, customers, checkout/return, overdue flagging — and print a pre-filled Rental Agreement contract instead of hand-typing one for every customer. Every rental is also mirrored to Odoo Online as a rental sale order through the [Luxtronic Odoo API](https://github.com/poosh0803/Luxtronic-Odoo-API).

## Technologies Used

* **Frontend**: HTML, CSS, JavaScript (no build step), Font Awesome icons via CDN
* **Backend**: Node.js (ES modules), Express.js
* **Database**: PostgreSQL, queried with raw `pg` (no ORM)
* **Other**: multer for condition-photo uploads, pm2 for deployment

## Prerequisites

* [Node.js](https://nodejs.org/) v18 or higher (the app relies on the built-in `fetch`)
* [Docker](https://www.docker.com/products/docker-desktop/) (recommended, runs PostgreSQL 17), or your own PostgreSQL instance

## Installation & Setup

### 1. Clone the repository

```bash
git clone https://github.com/poosh0803/Luxtronic-Rental-NEO.git
cd Luxtronic-Rental-NEO
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up the database

Start the PostgreSQL container:

```bash
cd docker
docker compose up -d
```

On first start (an empty volume), Postgres runs every script in `docker/init-scripts/` in filename order. `001_schema.sql` already contains the full current schema, and `002_seed.sql` adds two placeholder units (one desktop, one laptop) to try the app with.

You can connect with a database GUI (VS Code PostgreSQL extension, pgAdmin, TablePlus, etc.) using:

- Host: `localhost` or `127.0.0.1`
- Port: `5434`
- Username: `luxtronic_user`
- Password: `luxtronic_password`
- Database: `luxtronic_rental_db`

> **Note:** the compose file sets an explicit project `name` and a uniquely-named volume on purpose — do not remove them. Several other Luxtronic repos keep `docker-compose.yml` in a folder also named `docker` with no project name set, which makes Docker Compose default them all to the same shared volume unless each one is named distinctly.

#### Upgrading an existing database

Init scripts only run against an empty volume, so an existing database does **not** pick up new schema changes automatically. Scripts `003`–`007` are idempotent migrations (`ADD COLUMN IF NOT EXISTS`, guarded constraints) — run any you haven't applied yet, in order, against the database the app points at:

| Script | Adds |
|---|---|
| `003_add_final_fee.sql` | `rentals.final_fee` — agreed total when it differs from rate × period |
| `004_add_late_notified.sql` | `rentals.late_notified_at` — so the overdue alert fires only once |
| `005_add_portal_notification_id.sql` | `rentals.portal_notification_id` — to clear that alert later |
| `006_add_security_bond_currency.sql` | `rentals.security_bond_currency` (`AUD` or `RMB`, default `AUD`) |
| `007_add_odoo_barcode.sql` | `units.odoo_barcode` — how the unit is matched to its Odoo product |

### 4. Configure environment variables

```bash
cp .env.example .env
```

| Variable | Purpose |
|---|---|
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | PostgreSQL connection — the defaults match the Docker setup above |
| `BUSINESS_NAME`, `BUSINESS_ABN`, `ADDRESS`, `WEBSITE`, `EMAIL`, `PHONE` | Printed on the Lessor side of the rental agreement |
| `PORT` | Port the app listens on (default `8003`) |
| `PORTAL_NOTIFICATIONS_URL` | Optional. Luxtronic Portal notifications endpoint (default `http://192.168.68.255/api/notifications`) |
| `PUBLIC_BASE_URL` | Optional. This app's public URL, used for the "Open" link on portal alerts (default `http://192.168.68.255:8003`) |
| `ODOO_API_URL` | Optional. Base URL of the Luxtronic Odoo API (default `http://localhost:4001`, correct when both run on the same server) |

### 5. Start the application

Development mode (auto-restart on file changes):

```bash
npm run dev
```

Production mode:

```bash
npm start
```

The app will be available at `http://localhost:8003` (or whatever `PORT` is set to), and the console logs "✅ Database connection successful" once it can reach PostgreSQL.

## Project Structure

```
Luxtronic-Rental-NEO/
├── app.js                  # Express app: static files, API routes, page routes, overdue check timer
├── src/
│   ├── db.js               # PostgreSQL connection pool
│   ├── lateNotifier.js     # Overdue-rental alerts pushed to the Luxtronic Portal
│   ├── odooSync.js         # Mirrors rentals to Odoo via the Luxtronic Odoo API
│   ├── routes/             # API routes: units, customers, rentals, analytics
│   └── utils/unitStatus.js # Computes a unit's display status
├── views/                  # HTML pages
├── public/
│   ├── css/                # style.css (app), print.css (rental agreement)
│   ├── js/                 # One script per page, plus common.js shared helpers
│   └── images/
├── docker/                 # Docker Compose config & DB init/migration scripts
├── uploads/rentals/<id>/   # Condition photos (git-ignored)
└── ecosystem.config.cjs    # pm2 process config
```

## Pages

| Path | Page |
|---|---|
| `/` | Dashboard — units currently out, with due dates, and anything overdue |
| `/inventory` | Units list with type filter, search and sort; add/edit/delete units |
| `/unit-detail?id=` | One unit's details and full rental history |
| `/customers` | Search, edit and delete customers, with each customer's rental history |
| `/new-rental` | New rental as a single-page form |
| `/new-rental-guided` | New rental as a step-by-step walkthrough (one question per screen, then a review step) |
| `/rental-detail?id=` | One rental — edit, add/delete checkout photos, mark returned, delete |
| `/rental-history` | Every rental ever recorded, newest first |
| `/analysis` | Fleet and rental stats |
| `/print-agreement?id=` | Pre-filled Rental Agreement, ready to print |

Clicking **New Rental** in the nav asks whether to use the form or the guided walkthrough. Both create exactly the same rental.

## API

All responses are JSON shaped `{ success, message?, ...data }`.

**Units** (`/api/units`)
- `GET /` — all units with computed status; optional `?status=` and `?type=` filters
- `GET /:id` — one unit plus its rental history
- `POST /` — create a unit (`type` and `label` required)
- `PUT /:id` — update a unit (only the fields sent are changed)
- `DELETE /:id` — delete a unit; blocked (`409`) if it has any rental history

**Customers** (`/api/customers`)
- `GET /?q=` — search by name or phone (max 50 results)
- `GET /:id` — one customer plus their rental history
- `POST /`, `PUT /:id` — create / update a customer (`full_name` required on create)
- `DELETE /:id` — delete a customer; blocked (`409`) if they have any rental history

**Rentals** (`/api/rentals`)
- `GET /` — all rentals; optional `?status=active|overdue|returned`
- `GET /:id` — one rental plus its condition photos
- `GET /:id/print-data` — everything the rental agreement page needs
- `POST /` — check out a unit, either to an existing `customer_id` or a `new_customer` created in the same transaction. Blocked (`409`) if the unit is already out, in repair, or retired
- `PUT /:id` — edit dates, fee, final fee, bond, bond currency, accessories or notes
- `PUT /:id/return` — mark returned
- `DELETE /:id` — delete a rental and its condition photos
- `POST /:id/photos` — upload one photo (multipart field `photo`, plus `stage` = `checkout` or `return`)
- `DELETE /:id/photos/:photoId` — delete one photo

**Analytics** (`/api/analytics`)
- `GET /rentals?range=all|this_month|last_month` — stats for the Analysis page

**Config**
- `GET /api/config` — the business details printed on the agreement

## Features

* Inventory of desktop and laptop units, with free-form per-unit specs and an Odoo barcode
* Computed unit status (Available / Rented Out / Overdue / In Repair / Retired) — never stored, so it can't drift. Double-booking a unit is blocked
* Reusable customer profiles, searchable by name or phone
* Checkout and return flows with condition photos, plus a confirmation before marking a rental returned
* Rental fee per day, week or month, with an optional final fee for discounts
* Security bond in AUD or RMB, kept separate everywhere — including the Analysis totals
* One-click print of a pre-filled Rental Agreement, with page numbers, for the customer to sign on paper. The contract text lives in `views/print-agreement.html`, so changing a clause is a plain HTML edit
* Analysis page: date-range filter, fleet utilization, estimated revenue, bonds held per currency, average rental duration and days late, on-time vs late returns, monthly volume and revenue trends, top units and customers, and units that have never been rented
* Light/dark theme toggle, matching Luxtronic's other in-house tools

### Overdue alerts to the Luxtronic Portal

Every 30 minutes (and once at startup), `src/lateNotifier.js` finds rentals that have just gone overdue and posts a one-time notification to the Luxtronic Portal. When the rental is later returned or deleted, that notification is removed from the portal again. A down portal never affects this app.

### Odoo sync

`src/odooSync.js` mirrors each rental to Odoo through the Luxtronic Odoo API:

| In Rental-Neo | In Odoo |
|---|---|
| Rental created | Rental order created, confirmed and marked picked-up |
| Rental edited | That order's dates, price and bond updated |
| Rental marked returned | Order line marked returned (stock restored) |
| Rental deleted | Order cancelled (kept in Odoo for audit) |

* The **customer** is identified by phone number only; the unit by its **Odoo barcode**. No Odoo IDs are stored here.
* The **price** sent is the final fee if set, otherwise rate × periods (a period is 1, 7 or 30 days).
* The **bond** is sent as a separate line using the `RENTAL-BOND` product — only when it's in AUD. RMB bonds are skipped and logged.
* A rental is skipped (and logged) if its unit has no Odoo barcode or its customer has no phone number.
* Sync is fire-and-forget: a failure is logged but never blocks the action in this app. Check the pm2 logs for lines starting `Odoo`.

## Deployment

The app runs on the shop's LAN server under pm2 as `luxtronic-rental` (see `ecosystem.config.cjs`), on port `8003`. Update it the same way as Luxtronic's other in-house tools:

```bash
git pull && pm2 restart luxtronic-rental
```

The Odoo sync expects the Luxtronic Odoo API to be running on the same server (pm2 name `luxtronic-odoo-api`, port `4001`). If you add a schema migration, apply it to the production database as well — see [Upgrading an existing database](#upgrading-an-existing-database).
