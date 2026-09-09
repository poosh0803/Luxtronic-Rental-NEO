// Pushes a one-time "overdue" notification to the Luxtronic Portal for each
// rental that just crossed into overdue, per the portal's Notifications API
// (see Luxtronic-Portal/API.md). Fire-and-forget by design: a failed or slow
// portal must never affect this app's own operation.
import pool from './db.js';

const PORTAL_NOTIFICATIONS_URL = process.env.PORTAL_NOTIFICATIONS_URL || 'http://192.168.68.255/api/notifications';
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'http://192.168.68.255:8003';

async function notifyPortal(payload) {
  try {
    await fetch(PORTAL_NOTIFICATIONS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    // Best-effort per the portal API's failure-handling guidance - a
    // down/unreachable portal must never affect rental operations.
    console.error('Portal notification failed (ignored):', error.message);
  }
}

// Finds rentals that are overdue and haven't been notified about yet,
// notifies the portal for each, and marks them as notified.
export async function checkAndNotifyLateRentals() {
  const { rows } = await pool.query(`
    SELECT r.id, r.due_date, u.label AS unit_label, c.full_name AS customer_name
    FROM rentals r
    JOIN units u ON u.id = r.unit_id
    JOIN customers c ON c.id = r.customer_id
    WHERE r.returned_at IS NULL
      AND r.due_date < CURRENT_DATE
      AND r.late_notified_at IS NULL
  `);

  for (const rental of rows) {
    const daysLate = Math.max(1, Math.floor((Date.now() - new Date(rental.due_date).getTime()) / 86400000));
    await notifyPortal({
      source: 'rental',
      level: 'warning',
      title: 'Rental overdue',
      message: `${rental.unit_label} rented to ${rental.customer_name} is ${daysLate} day${daysLate === 1 ? '' : 's'} overdue`,
      url: `${PUBLIC_BASE_URL}/rental-detail?id=${rental.id}`,
    });
    await pool.query(`UPDATE rentals SET late_notified_at = now() WHERE id = $1`, [rental.id]);
  }

  return rows.length;
}
