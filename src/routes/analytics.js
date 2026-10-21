import express from 'express';
import pool from '../db.js';
import { UNIT_SELECT_WITH_OPEN_RENTAL, attachStatus } from '../utils/unitStatus.js';
import { estimateRevenue } from '../utils/revenue.js';

const router = express.Router();

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
        -- Bonds are never summed across currencies - AUD and RMB are kept
        -- as separate totals throughout.
        COALESCE(SUM(security_bond) FILTER (WHERE returned_at IS NULL AND security_bond_currency = 'AUD'), 0) AS bonds_held_aud,
        COALESCE(SUM(security_bond) FILTER (WHERE returned_at IS NULL AND security_bond_currency = 'RMB'), 0) AS bonds_held_rmb
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
        bondsHeldAud: Number(live.bonds_held_aud),
        bondsHeldRmb: Number(live.bonds_held_rmb),
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

const localDateKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Data for the Status page graphs: fleet status, when open rentals fall due
// over the next 14 days, and Odoo sync activity over the last 14 days.
router.get('/status', async (req, res) => {
  try {
    const { rows: unitRows } = await pool.query(`${UNIT_SELECT_WITH_OPEN_RENTAL} ORDER BY u.id ASC`);
    const fleet = { available: 0, rented: 0, overdue: 0, in_repair: 0, retired: 0 };
    for (const u of unitRows.map(attachStatus)) fleet[u.status] = (fleet[u.status] || 0) + 1;

    const { rows: openRentals } = await pool.query(`SELECT due_date FROM rentals WHERE returned_at IS NULL`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
      days.push({ date: localDateKey(d), count: 0 });
    }
    const byDate = new Map(days.map((d) => [d.date, d]));
    let overdue = 0;
    let later = 0;
    for (const r of openRentals) {
      const due = new Date(r.due_date);
      const key = localDateKey(due);
      if (due < today) overdue += 1;
      else if (byDate.has(key)) byDate.get(key).count += 1;
      else later += 1;
    }

    const { rows: syncRows } = await pool.query(`
      SELECT to_char(d, 'YYYY-MM-DD') AS date,
             COUNT(l.id) FILTER (WHERE l.ok) AS ok,
             COUNT(l.id) FILTER (WHERE NOT l.ok) AS failed
      FROM generate_series(CURRENT_DATE - 13, CURRENT_DATE, interval '1 day') d
      LEFT JOIN odoo_sync_log l ON l.created_at::date = d::date
      GROUP BY d
      ORDER BY d
    `);

    res.json({
      success: true,
      fleet,
      due: { days, overdue, later, open: openRentals.length },
      sync: syncRows.map((r) => ({ date: r.date, ok: Number(r.ok), failed: Number(r.failed) })),
    });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ success: false, message: 'Failed to load status', error: error.message });
  }
});

// Data for the Status page "Growth" graphs. Revenue uses the same estimate
// as the Analysis page and is counted on the rental's start date, so the two
// pages agree. Points are daily, or weekly once the history is long.
router.get('/growth', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT r.start_date, r.due_date, r.returned_at, r.rental_fee, r.fee_frequency, r.final_fee, u.type AS unit_type
      FROM rentals r JOIN units u ON u.id = r.unit_id
      ORDER BY r.start_date ASC
    `);
    const { rows: unitCount } = await pool.query(`SELECT COUNT(*) AS n FROM units`);
    const totalUnits = Number(unitCount[0].n);

    const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const today = midnight(new Date());
    const rentals = rows.map((r) => ({
      start: midnight(new Date(r.start_date)),
      returned: r.returned_at ? midnight(new Date(r.returned_at)) : null,
      revenue: estimateRevenue(r),
      type: r.unit_type,
    }));

    if (rentals.length === 0) {
      return res.json({ success: true, totals: { revenue: 0, rentals: 0, avgPerRental: 0, bestWeek: null }, points: [], weekly: [] });
    }

    const first = rentals[0].start < today ? rentals[0].start : today;
    const spanDays = Math.round((today - first) / MS_PER_DAY);
    const step = spanDays > 90 ? 7 : 1;

    const points = [];
    const addPoint = (d) => {
      let revenue = 0;
      let count = 0;
      let out = 0;
      for (const r of rentals) {
        if (r.start > d) continue;
        revenue += r.revenue;
        count += 1;
        if (!r.returned || r.returned > d) out += 1;
      }
      points.push({
        date: localDateKey(d),
        revenue: Math.round(revenue * 100) / 100,
        rentals: count,
        unitsOut: out,
        utilization: totalUnits ? Math.min(1, out / totalUnits) : 0,
      });
    };
    for (let d = new Date(first); d <= today; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + step)) addPoint(d);
    if (points[points.length - 1].date !== localDateKey(today)) addPoint(today);

    // Last 12 seven-day windows ending today, revenue split by unit type.
    const weekly = [];
    for (let i = 11; i >= 0; i--) {
      const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i * 7);
      const begin = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 6);
      const week = { date: localDateKey(begin), desktop: 0, laptop: 0, rentals: 0 };
      for (const r of rentals) {
        if (r.start >= begin && r.start <= end) {
          week[r.type] = (week[r.type] || 0) + r.revenue;
          week.rentals += 1;
        }
      }
      week.desktop = Math.round(week.desktop);
      week.laptop = Math.round(week.laptop);
      weekly.push(week);
    }

    const revenue = rentals.reduce((sum, r) => sum + r.revenue, 0);
    const best = weekly.reduce((b, w) => (w.desktop + w.laptop > (b ? b.desktop + b.laptop : 0) ? w : b), null);

    res.json({
      success: true,
      totals: {
        revenue: Math.round(revenue * 100) / 100,
        rentals: rentals.length,
        avgPerRental: Math.round((revenue / rentals.length) * 100) / 100,
        bestWeek: best && best.desktop + best.laptop > 0 ? { date: best.date, revenue: best.desktop + best.laptop } : null,
      },
      stepDays: step,
      points,
      weekly,
    });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ success: false, message: 'Failed to load growth stats', error: error.message });
  }
});

export default router;
