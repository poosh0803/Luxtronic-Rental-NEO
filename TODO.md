# TODO

Feature ideas, roughly in priority order.

## Next up

- [x] **Odoo sync status and check** — Odoo Sync page (every open rental checked against its Odoo order, with sync stats and a persistent activity log), a status panel with "Fix now" on each rental, and failures no longer only in the pm2 logs.
- [ ] **Return checklist and bond settlement** — record damage and costs when a rental is returned, calculate the bond refund, and track the bond as held / refunded / forfeited (not tracked at all today).

## Planned

- [ ] **Automatic late fees** — the agreement charges $20 per day late; show the running late fee on the rental page and dashboard instead of only flagging overdue.
- [x] **Rental extension** — "Extend" button on the rental page: new due date plus an optional extra charge; resets the overdue alert, logs the change in the notes and syncs to Odoo.
- [ ] **Repair log per unit** — record repairs with parts and days down; supports the $50/day downtime charge and shows which units cost the most.
- [x] **Due-date reminder** — a portal notification on the day a rental is due (from 9am), before it goes overdue.

## Later

- [ ] **Reservations calendar** — show which units are booked for which dates so a unit can be promised before the current renter returns it.
- [ ] **ID and signed-agreement photos** — attach a customer ID photo and a scan of the signed contract to each rental.
- [ ] **CSV export and audit trail** — export rentals and customers, and log who changed what (the app has no login).
