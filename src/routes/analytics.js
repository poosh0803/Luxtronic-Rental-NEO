import express from 'express';
import pool from '../db.js';
import { UNIT_SELECT_WITH_OPEN_RENTAL, attachStatus } from '../utils/unitStatus.js';

const router = express.Router();

const PERIOD_DAYS = { day: 1, week: 7, month: 30 };
const MS_PER_DAY = 86400000;

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

function dateOnlyDiffDays(a, b) {
  const aOnly = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const bOnly = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((aOnly - bOnly) / MS_PER_DAY);
}

// Rough revenue estimate for one rental: the recorded final fee if staff set
// one (e.g. after a discount), otherwise rate x number of periods covered by
// the rental so far (or in full, if it's been returned). This is an
// estimate for the Analysis page only - the app doesn't keep a real payment
// ledger (see LUXTRONIC-PRIVACY-DATA-GUIDELINES.md / project decisions).
function estimateRevenue(r) {
  if (r.final_fee) return Number(r.final_fee);
  if (!r.rental_fee || !r.fee_frequency) return 0;
  const periodDays = PERIOD_DAYS[r.fee_frequency] || 1;
  const start = new Date(r.start_date);
  const end = r.returned_at ? new Date(r.returned_at) : new Date(r.due_date);
  const durationDays = Math.max(1, Math.round((end - start) / MS_PER_DAY));
  const periods = Math.max(1, Math.ceil(durationDays / periodDays));
  return Number(r.rental_fee) * periods;
}

// "this_month"/"last_month" bounds as local-midnight Date pairs [start, end)
// - built the same way r.start_date arrives (local midnight), so comparing
// them directly doesn't hit the local-vs-UTC pitfall noted elsewhere in this
// codebase (see rentalDetail.js's toDateInputValue).
function getRangeBounds(range) {
  const now = new Date();
  if (range === 'this_month') {
    return [new Date(now.getFullYear(), now.getMonth(), 1), new Date(now.getFullYear(), now.getMonth() + 1, 1)];
  }
  if (range === 'last_month') {
    return [new Date(now.getFullYear(), now.getMonth() - 1, 1), new Date(now.getFullYear(), now.getMonth(), 1)];
  }
  return null;
}

router.get('/rentals', async (req, res) => {
  try {
    // "Right now" facts - deliberately NOT affected by the range filter below,
    // since e.g. "currently overdue" should always match what the Dashboard
    // shows, not shift depending on which historical period is selected.
    const { rows: liveRows } = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE returned_at IS NULL) AS active_count,
        COUNT(*) FILTER (WHERE returned_at IS NULL AND due_date < CURRENT_DATE) AS overdue_count,
        COALESCE(SUM(security_bond) FILTER (WHERE returned_at IS NULL), 0) AS bonds_held
      FROM rentals
    `);
    const live = liveRows[0];

    const { rows: allRentals } = await pool.query(`
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

    // Range filter (?range=all|this_month|last_month) applies to everything
    // below except the "right now" numbers above and the 6-month trend
    // charts further down, which are inherently multi-month views.
    const range = ['this_month', 'last_month'].includes(req.query.range) ? req.query.range : 'all';
    const bounds = getRangeBounds(range);
    const rentals = bounds
      ? allRentals.filter((r) => {
          const d = new Date(r.start_date);
          return d >= bounds[0] && d < bounds[1];
        })
      : allRentals;

    const statusCounts = { available: 0, rented: 0, overdue: 0, in_repair: 0, retired: 0 };
    for (const u of units) statusCounts[u.status] = (statusCounts[u.status] || 0) + 1;

    const byType = { desktop: 0, laptop: 0 };
    let totalRevenue = 0;
    let returnedLateCount = 0;
    let returnedOnTimeCount = 0;
    let durationDaysSum = 0;
    let durationDaysCount = 0;
    let lateDaysSum = 0;
    let lateDaysCount = 0;
    const unitStats = new Map();
    const customerStats = new Map();
    const rentedUnitIds = new Set();

    for (const r of allRentals) rentedUnitIds.add(r.unit_id);

    for (const r of rentals) {
      byType[r.unit_type] = (byType[r.unit_type] || 0) + 1;

      const revenue = estimateRevenue(r);
      totalRevenue += revenue;

      const u = unitStats.get(r.unit_id) || { label: r.unit_label, type: r.unit_type, count: 0, revenue: 0 };
      u.count += 1;
      u.revenue += revenue;
      unitStats.set(r.unit_id, u);

      const c = customerStats.get(r.customer_id) || { name: r.customer_name, count: 0, lateCount: 0 };
      c.count += 1;

      if (r.returned_at) {
        const start = new Date(r.start_date);
        const returned = new Date(r.returned_at);
        durationDaysSum += Math.max(0, dateOnlyDiffDays(returned, start));
        durationDaysCount += 1;

        if (isLateReturn(r.returned_at, r.due_date)) {
          returnedLateCount += 1;
          c.lateCount += 1;
          lateDaysSum += dateOnlyDiffDays(returned, new Date(r.due_date));
          lateDaysCount += 1;
        } else {
          returnedOnTimeCount += 1;
        }
      }
      customerStats.set(r.customer_id, c);
    }

    const topUnits = [...unitStats.values()].sort((a, b) => b.count - a.count).slice(0, 5);
    const topCustomers = [...customerStats.values()].sort((a, b) => b.count - a.count).slice(0, 5);

    // Units with zero rentals in the entire (unfiltered) history
    const idleUnits = units
      .filter((u) => !rentedUnitIds.has(u.id))
      .map((u) => ({ label: u.label, type: u.type, status: u.status }));

    // Last 6 calendar months, oldest first, zero-filled - always from the
    // full history regardless of the range filter, since a 1-month window
    // in a 6-month trend chart would just show five empty bars.
    const monthCounts = new Map();
    const monthRevenue = new Map();
    for (const r of allRentals) {
      const startDate = new Date(r.start_date);
      const key = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`;
      monthCounts.set(key, (monthCounts.get(key) || 0) + 1);
      monthRevenue.set(key, (monthRevenue.get(key) || 0) + estimateRevenue(r));
    }
    const monthly = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthly.push({
        month: d.toLocaleDateString('en-AU', { month: 'short', year: '2-digit' }),
        count: monthCounts.get(key) || 0,
        revenue: monthRevenue.get(key) || 0,
      });
    }

    res.json({
      success: true,
      range,
      overview: {
        totalRentals: rentals.length,
        activeCount: Number(live.active_count),
        overdueCount: Number(live.overdue_count),
        returnedLateCount,
        returnedOnTimeCount,
        bondsHeld: Number(live.bonds_held),
        totalRevenue,
        totalUnits: units.length,
        fleetUtilization: units.length ? (statusCounts.rented + statusCounts.overdue) / units.length : 0,
        avgDurationDays: durationDaysCount ? durationDaysSum / durationDaysCount : null,
        avgDaysLate: lateDaysCount ? lateDaysSum / lateDaysCount : null,
      },
      byType,
      statusCounts,
      topUnits,
      topCustomers,
      idleUnits,
      monthly,
    });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ success: false, message: 'Failed to compute analytics', error: error.message });
  }
});

export default router;
