import express from 'express';
import pool from '../db.js';
import { checkRentalInOdoo, retryRentalSync } from '../odooSync.js';

const router = express.Router();

const RENTAL_SELECT = `
  SELECT r.*, u.label AS unit_label, u.odoo_barcode AS unit_barcode, c.full_name AS customer_name, c.phone AS customer_phone
  FROM rentals r
  JOIN units u ON u.id = r.unit_id
  JOIN customers c ON c.id = r.customer_id
`;

// Run async work over a list a few at a time, so checking every open rental
// is quick without hammering the Odoo API.
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]);
      }
    })
  );
  return results;
}

const syncArgs = (r) => ({ rental: r, unitBarcode: r.unit_barcode, customerPhone: r.customer_phone, rentalId: r.id });

// Overview: every open rental checked against Odoo, plus sync-log stats and
// the most recent log entries. Read-only (the check never writes to Odoo).
router.get('/status', async (req, res) => {
  try {
    const { rows: rentals } = await pool.query(`${RENTAL_SELECT} WHERE r.returned_at IS NULL ORDER BY r.due_date ASC, r.id ASC`);
    const checks = await mapLimit(rentals, 2, (r) => checkRentalInOdoo(syncArgs(r)));

    const items = rentals.map((r, i) => ({
      id: r.id,
      unit_label: r.unit_label,
      customer_name: r.customer_name,
      due_date: r.due_date,
      check: checks[i],
    }));
    const counts = { synced: 0, mismatch: 0, missing: 0, skipped: 0, unavailable: 0 };
    for (const item of items) counts[item.check.state] += 1;

    const { rows: statRows } = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE ok AND created_at > now() - interval '7 days') AS ok_7d,
        COUNT(*) FILTER (WHERE NOT ok AND created_at > now() - interval '7 days') AS failed_7d,
        MAX(created_at) FILTER (WHERE ok) AS last_ok_at,
        MAX(created_at) FILTER (WHERE NOT ok) AS last_failed_at
      FROM odoo_sync_log
    `);
    const { rows: log } = await pool.query(`
      SELECT l.id, l.rental_id, l.action, l.ok, l.message, l.created_at, u.label AS unit_label
      FROM odoo_sync_log l
      LEFT JOIN rentals r ON r.id = l.rental_id
      LEFT JOIN units u ON u.id = r.unit_id
      ORDER BY l.created_at DESC, l.id DESC
      LIMIT 30
    `);

    res.json({
      success: true,
      counts,
      stats: {
        ok7d: Number(statRows[0].ok_7d),
        failed7d: Number(statRows[0].failed_7d),
        lastOkAt: statRows[0].last_ok_at,
        lastFailedAt: statRows[0].last_failed_at,
      },
      rentals: items,
      log,
    });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ success: false, message: 'Failed to check Odoo sync', error: error.message });
  }
});

async function loadRental(id) {
  const { rows } = await pool.query(`${RENTAL_SELECT} WHERE r.id = $1`, [id]);
  return rows[0];
}

// Check one rental against its Odoo order (read-only).
router.get('/rentals/:id', async (req, res) => {
  try {
    const rental = await loadRental(req.params.id);
    if (!rental) return res.status(404).json({ success: false, message: 'Rental not found' });
    res.json({ success: true, check: await checkRentalInOdoo(syncArgs(rental)) });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ success: false, message: 'Failed to check rental', error: error.message });
  }
});

// Push this rental's current state to Odoo (create the order if missing,
// correct it if it differs) and report the result.
router.post('/rentals/:id/retry', async (req, res) => {
  try {
    const rental = await loadRental(req.params.id);
    if (!rental) return res.status(404).json({ success: false, message: 'Rental not found' });
    if (rental.returned_at) return res.status(409).json({ success: false, message: 'Returned rentals are not re-synced' });
    res.json({ success: true, ...(await retryRentalSync(syncArgs(rental))) });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ success: false, message: 'Failed to re-sync rental', error: error.message });
  }
});

export default router;
