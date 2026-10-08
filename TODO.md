# TODO

Feature ideas, roughly in priority order.

## Next up

- [ ] **Odoo sync status and retry** — show a "synced / failed" badge on each rental and add a "Retry sync" button. Sync failures are currently only visible in the pm2 logs.
- [ ] **Return checklist and bond settlement** — record damage and costs when a rental is returned, calculate the bond refund, and track the bond as held / refunded / forfeited (not tracked at all today).

## Planned

- [ ] **Automatic late fees** — the agreement charges $20 per day late; show the running late fee on the rental page and dashboard instead of only flagging overdue.
- [x] **Rental extension** — "Extend" button on the rental page: new due date plus an optional extra charge; resets the overdue alert, logs the change in the notes and syncs to Odoo.
- [ ] **Repair log per unit** — record repairs with parts and days down; supports the $50/day downtime charge and shows which units cost the most.
- [ ] **Due-soon reminders** — send a portal alert a couple of days before a rental is due, not only after it's overdue.

## Later

- [ ] **Reservations calendar** — show which units are booked for which dates so a unit can be promised before the current renter returns it.
- [ ] **ID and signed-agreement photos** — attach a customer ID photo and a scan of the signed contract to each rental.
- [ ] **CSV export and audit trail** — export rentals and customers, and log who changed what (the app has no login).
