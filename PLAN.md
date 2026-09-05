# Luxtronic Rental Tracker — Implementation Plan

## Context

Luxtronic's shop currently tracks PC/laptop rentals in a manual spreadsheet, and rental contracts are hand-filled from a Word template (`RENTAL AGREEMENT v2（with page）.docx`). This project builds a small LAN web app — same pattern as the shop's other in-house tools (Digital Service Form, Parts Management, etc.) — so staff can manage the rental inventory, record who has what unit out and until when, and print a pre-filled rental agreement instead of typing one by hand each time.

Decisions locked in during requirements review:
- Inventory covers **both desktops and laptops** from day one.
- Contracts are **printed and wet-signed** (no digital signature pad, no scan-back into the system).
- **No login** — LAN-only trust, matching a single-operator shop.
- Financials are **record-only** (fee/bond stored and printed on the contract; no payment ledger/reports).
- Units get **full status tracking** (Available/Rented/Overdue/In Repair/Retired) and double-booking is blocked.
- **Condition photos** are captured at checkout and return.
- **Customers are reusable profiles**, searchable by name/phone.
- **One unit per rental** (no bundling multiple units on one contract).
- Late fee is **flagged only**, not auto-calculated.
- Dashboard shows **units currently out (with due dates) + overdue flagged**.
- Seed data: **one sample desktop + one sample laptop** only (clearly-labeled demo units, not a copy of the shop's real current inventory).
- Contract template must be **easy to edit later** — this rules out a docx-fill/PDF-conversion pipeline in favor of an HTML print page (see below).

## Architecture (mirrors `Luxtronic-Digital-ServiceForm`, the closest sibling project)

Reviewed sibling repos (`Luxtronic-Digital-ServiceForm`, `Luxtronic-PartsManagement`) to match existing conventions so this fits the same deploy pipeline (`lan-portal-deploy` skill, pm2, git pull + restart):

- **Backend**: Node.js (ESM, `"type": "module"`) + Express, raw `pg` queries via a single pool in `src/db.js` (no ORM) — same as `Luxtronic-Digital-ServiceForm/src/db.js`.
- **Routes**: one `express.Router()` file per resource under `src/routes/`, mounted in `app.js`, JSON responses shaped `{ success, message/error, ...data }` — same as `src/routes/service.js`.
- **Frontend**: plain HTML/CSS/JS, static pages under `views/`, assets under `public/{css,js}`, no build step.
- **Print pattern**: reuse the exact approach from `public/js/printForm.js` + `views/print-form.html` — an HTML `<template>` holding the full contract markup, fetched/filled client-side from record data via string replace, then printed with the browser's native print dialog. This is what makes the contract "easy to modify" — editing the T&Cs is just editing an HTML file, no template-engine or PDF-conversion pipeline.
- **Photo uploads**: `multer` writing into `/uploads/rentals/<rental_id>/...`, served statically via `app.use('/uploads', ...)` — same as ServiceForm.
- **Config**: `.env` holds DB creds + business info (`ADDRESS`, `WEBSITE`, `PHONE`, plus `ABN`), exposed via `GET /api/config` — same as ServiceForm's `/api/config`.
- **Local DB**: `docker/docker-compose.yml` + `docker/init-scripts/*.sql` (schema + seed), Postgres 17 — same as ServiceForm, but on port `5434` (ServiceForm already uses `5433` locally, avoid clashing if both run at once).
- **Deploy**: `ecosystem.config.cjs` for pm2 (`name: 'luxtronic-rental'`), matching ServiceForm's config — actual server deploy happens later via the `lan-portal-deploy` skill once this is pushed to its own repo; out of scope for this build.

## Data Model (`docker/init-scripts/001_schema.sql`)

- **units**: `id, type ('desktop'|'laptop'), label (e.g. "Unit 12" / case nickname), specs JSONB, serial_number, accessories TEXT, estimate_value NUMERIC, manual_status ('none'|'in_repair'|'retired') DEFAULT 'none', created_at`
  - `specs` is JSONB (not fixed columns) because desktops (CPU/MB/RAM/SSD/GPU/PSU/Case) and laptops (brand/model/CPU/RAM/storage/screen) have different attribute sets — keeps the schema stable as spec fields evolve, and the inventory form just renders whatever keys are relevant per type.
  - Display status is **computed**, not stored: `retired`/`in_repair` if `manual_status` set; else `overdue`/`rented` if an open rental exists (comparing `due_date` to now); else `available`.
- **customers**: `id, full_name, phone, address, email NULL, created_at` — searchable by name/phone (mirrors ServiceForm's customer search).
- **rentals**: `id, unit_id FK, customer_id FK, start_date, due_date, returned_at NULL, rental_fee NUMERIC, fee_frequency ('day'|'week'|'month'), security_bond NUMERIC, accessories_included TEXT, notes, created_at`
  - A unit can't be checked out while it has a rental with `returned_at IS NULL` (enforced in the create-rental route) or while `manual_status` is `in_repair`/`retired`.
  - "Overdue" = `returned_at IS NULL AND due_date < now()`; return flow just flags this, no fee auto-calculated.
- **rental_photos**: `id, rental_id FK, stage ('checkout'|'return'), file_path, uploaded_at`.

## Routes

**API** (`src/routes/`):
- `units.js` — `GET /` (list + status filter), `GET /:id`, `POST /`, `PUT /:id` (edit specs / set manual_status), 
- `customers.js` — `GET /?q=` (search name/phone), `GET /:id` (profile + rental history), `POST /`
- `rentals.js` — `GET /` (list, filter active/overdue), `GET /:id`, `POST /` (checkout: validates unit is free, creates rental + customer-if-new), `PUT /:id/return` (sets `returned_at`, accepts return photos), `GET /:id/print-data` (assembles everything the contract template needs)
- `photos.js` — `POST /rentals/:id/photos` (multer upload, `stage` field), mounted under rentals

**Pages** (`views/`):
- `index.html` — dashboard: units out + due dates, overdue section highlighted
- `inventory.html` — list/add/edit units (type, specs, serial, accessories, estimate value, manual status)
- `customers.html` — search/list customers, view a customer's rental history
- `new-rental.html` — pick an available unit, pick-or-create customer, enter period/fee/bond/accessories, capture checkout photos → creates rental → links to print page
- `rental-detail.html` — view one rental, mark returned (capture return photos, overdue banner if applicable)
- `print-agreement.html` — the Rental Agreement print page (see below)

## Contract print page

`views/print-agreement.html` holds a `<template>` transcribing the Word template's actual sections (Lessor/Lessee blocks, Equipment Description with Laptop/Desktop checkbox + Make/Model + Serial + Accessories checkboxes, Rental Period, Rental Payment, Security Bond, Schedule A repair-cost table, Use/Maintenance/Liability/Termination/Privacy/Consumer-Guarantees/Dispute clauses, signature blocks) as static HTML/CSS designed to print cleanly on standard paper with the Luxtronic letterhead. `public/js/printAgreement.js` (mirroring `printForm.js`) fetches `/api/rentals/:id/print-data`, clones the template, and fills in: date, customer name/address/phone, equipment type checkbox, unit label/serial, accessory checkboxes, rental period dates, fee + frequency, bond amount. Business-side fields (Luxtronic name/ABN/address/phone) come from `/api/config`. Staff print via the browser's own print dialog (`window.print()` behind a Print button); the customer signs the paper copy — nothing is scanned back in. Because the T&Cs live directly in this HTML file, updating wording later is a plain text edit.

## Seed data

Two demo rows in `docker/init-scripts/002_seed.sql`: one desktop unit (label "Demo Desktop 01", representative CPU/MB/RAM/GPU/etc. in `specs`) and one laptop unit (label "Demo Laptop 01", representative brand/model/CPU/RAM/storage). Clearly placeholder data, not the shop's real inventory — staff replace/add real units through the Inventory page.

## Build steps

1. Scaffold `package.json`, `.env.example`, `app.js`, `src/db.js`, `ecosystem.config.cjs`, `docker/docker-compose.yml`.
2. Write schema + seed SQL under `docker/init-scripts/`.
3. Build API routes (units, customers, rentals, photos) with the validation rules above.
4. Build `views/index.html` (dashboard), `inventory.html`, `customers.html`, `new-rental.html`, `rental-detail.html` + matching `public/js/*.js` and `public/css/*.css`.
5. Build `print-agreement.html` + `printAgreement.js` transcribing the Word template's content.
6. `docker compose up -d`, `npm install`, `npm run dev`, then drive the app end-to-end in the Browser tool: seed data shows on dashboard/inventory → create a rental against the demo desktop (confirm the unit now shows Rented and can't be double-booked) → open print-agreement and verify every field/checkbox fills correctly and the print preview looks right → mark it returned → backdate a due_date in the DB to confirm the Overdue flag/dashboard banner works.

## Not building now (flagged, not silently skipped)

- Git init/remote/deploy — left for you to say go-ahead on, since it touches GitHub/the LAN server.
- Multi-user auth, payment ledger, SMS/email reminders, multi-unit-per-contract — explicitly deferred per your answers above; easy to layer on later since the data model doesn't box them out (e.g. auth can sit in front of the existing no-login routes later without a schema change).

## Status

Implemented and verified end-to-end (2026-09-05): inventory, checkout/return, double-booking prevention, overdue detection, customer search/history, and the print-agreement page were all driven through a live browser session against the seeded data. Repo is git-initialized with an initial commit. Not yet done: GitHub remote/push and the actual LAN deploy (still awaiting go-ahead, per "Not building now" above).

**Added after initial build (2026-09-05):** a per-unit detail page (`views/unit-detail.html`, linked from Inventory) showing that unit's full rental history, and a site-wide `views/rental-history.html` listing every rental ever recorded across all units, newest first. Backed by an extended `GET /api/units/:id` (now also returns that unit's rentals) and the existing `GET /api/rentals` (already sorted newest-first).
