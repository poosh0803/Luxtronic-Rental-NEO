import express from 'express';
import pool from '../db.js';
import { UNIT_SELECT_WITH_OPEN_RENTAL, attachStatus } from '../utils/unitStatus.js';

const router = express.Router();

const PERIOD_DAYS = { day: 1, week: 7, month: 30 };

// Rough revenue estimate for one rental: the recorded final fee if staff set
// one (e.g. after a discount), otherwise rate x number of periods covered by
// the rental so far (or in full, if it's been returned). This is an
// estimate for the Analysis page only - the app doesn't keep a real payment
// ledger (see LUXTRONIC-PRIVACY-DATA-GUIDELINES.md / project decisions).
// Calendar-date-only comparison (mirrors the SQL's `returned_at::date >
// due_date`) - a straight `new Date() > new Date()` compare would also flag
// same-day returns after midnight as late, which the SQL check doesn't.
function isLateReturn(returnedAt, dueDate) {
  const r = new Date(returnedAt);
  const d = new Date(dueDate);
  const rDateOnly = new Date(r.getFullYear(), r.getMonth(), r.getDate());
  const dDateOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return rDateOnly > dDateOnly;
}

function estimateRevenue(r) {
  if (r.final_fee) return Number(r.final_fee);
  if (!r.rental_fee || !r.fee_frequency) return 0;
  const periodDays = PERIOD_DAYS[r.fee_frequency] || 1;
  const start = new Date(r.start_date);
  const end = r.returned_at ? new Date(r.returned_at) : new Date(r.due_date);
  const durationDays = Math.max(1, Math.round((end - start) / 86400000));
  const periods = Math.max(1, Math.ceil(durationDays / periodDays));
  return Number(r.rental_fee) * periods;
}

router.get('/rentals', async (req, res) => {
  try {
    // Counts that hinge on "is this date before today" are done in SQL so
    // they're immune to the local-vs-UTC DATE serialization quirk that bit
    // the rental edit form earlier (see rentalDetail.js's toDateInputValue).
    const { rows: overviewRows } = await pool.query(`
      SELECT
        COUNT(*) AS total_rentals,
        COUNT(*) FILTER (WHERE returned_at IS NULL) AS active_count,
        COUNT(*) FILTER (WHERE returned_at IS NULL AND due_date < CURRENT_DATE) AS overdue_count,
        COUNT(*) FILTER (WHERE returned_at IS NOT NULL AND returned_at::date > due_date) AS returned_late_count,
        COUNT(*) FILTER (WHERE returned_at IS NOT NULL AND returned_at::date <= due_date) AS returned_on_time_count,
        COALESCE(SUM(security_bond) FILTER (WHERE returned_at IS NULL), 0) AS bonds_held
      FROM rentals
    `);
    const overview = overviewRows[0];

    const { rows: rentals } = await pool.query(`
      SELECT r.id, r.unit_id, u.label AS unit_label, u.type AS unit_type,
             r.customer_id, c.full_name AS customer_name,
             r.start_date, r.due_date, r.returned_at, r.rental_fee, r.fee_frequency, r.final_fee
      FROM rentals r
      JOIN units u ON u.id = r.unit_id
      JOIN customers c ON c.id = r.customer_id
      ORDER BY r.start_date DESC
    `);

    const { rows: unitRows } = await pool.query(`${UNIT_SELECT_WITH_OPEN_RENTAL} ORDER BY u.id ASC`);
    const units = unitRows.map(attachStatus);

    // Rentals by equipment type
    const byType = { desktop: 0, laptop: 0 };
    for (const r of rentals) byType[r.unit_type] = (byType[r.unit_type] || 0) + 1;

    // Unit status breakdown (current inventory snapshot, not historical)
    const statusCounts = { available: 0, rented: 0, overdue: 0, in_repair: 0, retired: 0 };
    for (const u of units) statusCounts[u.status] = (statusCounts[u.status] || 0) + 1;

    // Total estimated revenue + per-unit / per-customer breakdowns
    let totalRevenue = 0;
    const unitStats = new Map();
    const customerStats = new Map();
    const monthCounts = new Map();

    for (const r of rentals) {
      const revenue = estimateRevenue(r);
      totalRevenue += revenue;

      const u = unitStats.get(r.unit_id) || { label: r.unit_label, type: r.unit_type, count: 0, revenue: 0 };
      u.count += 1;
      u.revenue += revenue;
      unitStats.set(r.unit_id, u);

      const c = customerStats.get(r.customer_id) || { name: r.customer_name, count: 0, lateCount: 0 };
      c.count += 1;
      if (r.returned_at && isLateReturn(r.returned_at, r.due_date)) {
        c.lateCount += 1;
      }
      customerStats.set(r.customer_id, c);

      // r.start_date is a JS Date object here (not yet JSON-serialized), so
      // build "YYYY-MM" from its local date parts rather than String()-ing
      // it, which would produce a full date-time string instead.
      const startDate = new Date(r.start_date);
      const monthKey = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`;
      monthCounts.set(monthKey, (monthCounts.get(monthKey) || 0) + 1);
    }

    const topUnits = [...unitStats.values()].sort((a, b) => b.count - a.count).slice(0, 5);
    const topCustomers = [...customerStats.values()].sort((a, b) => b.count - a.count).slice(0, 5);

    // Last 6 calendar months, oldest first, zero-filled
    const monthly = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthly.push({
        month: d.toLocaleDateString('en-AU', { month: 'short', year: '2-digit' }),
        count: monthCounts.get(key) || 0,
      });
    }

    res.json({
      success: true,
      overview: {
        totalRentals: Number(overview.total_rentals),
        activeCount: Number(overview.active_count),
        overdueCount: Number(overview.overdue_count),
        returnedLateCount: Number(overview.returned_late_count),
        returnedOnTimeCount: Number(overview.returned_on_time_count),
        bondsHeld: Number(overview.bonds_held),
        totalRevenue,
        totalUnits: units.length,
        fleetUtilization: units.length ? (statusCounts.rented + statusCounts.overdue) / units.length : 0,
      },
      byType,
      statusCounts,
      topUnits,
      topCustomers,
      monthly,
    });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ success: false, message: 'Failed to compute analytics', error: error.message });
  }
});

export default router;
