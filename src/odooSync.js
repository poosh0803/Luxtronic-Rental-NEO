// Mirrors rentals to the Luxtronic Odoo API (see Luxtronic-Odoo-API/README.md)
// so they show up as rental sale orders in Odoo Online. Fire-and-forget by
// design: a down/misconfigured Odoo API must never affect this app's own
// operation (same principle as lateNotifier.js's portal notifications).
import pool from './db.js';

const ODOO_API_URL = process.env.ODOO_API_URL || 'http://localhost:4001';
const BOND_ODOO_BARCODE = 'RENTAL-BOND';
const PERIOD_DAYS = { day: 1, week: 7, month: 30 };
const MS_PER_DAY = 86400000;

// Same estimate as analytics.js's estimateRevenue(), but for a rental that's
// only just been booked (no returned_at yet) - the agreed final fee if
// staff set one, otherwise rate x periods over the planned start/due dates.
export function estimatePrice(rental) {
  if (rental.final_fee) return Number(rental.final_fee);
  if (!rental.rental_fee || !rental.fee_frequency) return null;
  const periodDays = PERIOD_DAYS[rental.fee_frequency] || 1;
  const start = new Date(rental.start_date);
  const end = new Date(rental.due_date);
  const durationDays = Math.max(1, Math.round((end - start) / MS_PER_DAY));
  const periods = Math.max(1, Math.ceil(durationDays / periodDays));
  return Number(rental.rental_fee) * periods;
}

// Dates arrive either as plain "YYYY-MM-DD" strings (straight from a request
// body) or as JS Dates (read back from a DATE column, which node-postgres
// parses at *local* midnight) - so Dates must be read with local getters,
// never UTC ones, or they shift by a day.
function toOdooDate(value) {
  if (typeof value === 'string') return `${value.slice(0, 10)} 00:00:00`;
  const d = new Date(value);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd} 00:00:00`;
}

// The fields Odoo cares about, in the shape both /rentals and
// /rentals/update accept.
function buildOdooFields(rental) {
  const fields = {
    startDate: toOdooDate(rental.start_date),
    returnDate: toOdooDate(rental.due_date),
  };

  const price = estimatePrice(rental);
  if (price !== null) fields.price = price;

  if (rental.security_bond) {
    if (rental.security_bond_currency === 'AUD') {
      fields.bond = { sku: BOND_ODOO_BARCODE, amount: Number(rental.security_bond) };
    } else {
      console.log(`Odoo sync: skipping bond line, bond is in ${rental.security_bond_currency}, not AUD.`);
    }
  }
  return fields;
}

// Every attempt (success or failure) is recorded so problems show up in the
// app, not only in the server logs. Logging itself must never throw.
async function logSync(rentalId, action, ok, message) {
  try {
    await pool.query(`INSERT INTO odoo_sync_log (rental_id, action, ok, message) VALUES ($1, $2, $3, $4)`, [
      rentalId ?? null,
      action,
      ok,
      message ? String(message).slice(0, 500) : null,
    ]);
  } catch (error) {
    console.error('Odoo sync log write failed (ignored):', error.message);
  }
}

// Returns { ok: true, data } or { ok: false, error } - callers that fire and
// forget can ignore it; the retry button uses it.
async function postToOdoo(path, body, action, rentalId) {
  try {
    const res = await fetch(`${ODOO_API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const error = errBody.error || `HTTP ${res.status}`;
      console.error(`Odoo ${action} failed (ignored):`, error);
      await logSync(rentalId, action, false, error);
      return { ok: false, error };
    }
    const data = await res.json();
    console.log(`Odoo ${action} done:`, data);
    await logSync(rentalId, action, true, data.orderId ? `order ${data.orderId}` : null);
    return { ok: true, data };
  } catch (error) {
    console.error(`Odoo ${action} failed (ignored):`, error.message);
    await logSync(rentalId, action, false, `Odoo API unreachable: ${error.message}`);
    return { ok: false, error: `Odoo API unreachable: ${error.message}` };
  }
}

function skipReason(unitBarcode, customerPhone) {
  if (!unitBarcode) return 'unit has no Odoo barcode set';
  if (!customerPhone) return 'customer has no phone number';
  return null;
}

function canSync(unitBarcode, customerPhone) {
  const reason = skipReason(unitBarcode, customerPhone);
  if (reason) console.log(`Odoo sync skipped: ${reason}.`);
  return !reason;
}

export async function postRentalToOdoo({ rental, unitBarcode, customerPhone, rentalId }) {
  if (!canSync(unitBarcode, customerPhone)) return { ok: false, error: skipReason(unitBarcode, customerPhone) };
  return postToOdoo(
    '/rentals',
    { customer: { phone: customerPhone }, sku: unitBarcode, quantity: 1, ...buildOdooFields(rental) },
    'create',
    rentalId ?? rental.id
  );
}

// Marks the rental's Odoo line as returned (restores stock there).
export async function returnRentalInOdoo({ unitBarcode, customerPhone, rentalId }) {
  if (!canSync(unitBarcode, customerPhone)) return { ok: false, error: skipReason(unitBarcode, customerPhone) };
  return postToOdoo('/rentals/return', { phone: customerPhone, sku: unitBarcode }, 'return', rentalId);
}

// Cancels the rental's Odoo order (it stays in Odoo for audit, not deleted) -
// used when a rental is deleted here.
export async function cancelRentalInOdoo({ unitBarcode, customerPhone, rentalId }) {
  if (!canSync(unitBarcode, customerPhone)) return { ok: false, error: skipReason(unitBarcode, customerPhone) };
  return postToOdoo('/rentals/cancel', { phone: customerPhone, sku: unitBarcode }, 'cancel', rentalId);
}

// Pushes an edited rental's dates/price/bond onto its existing Odoo order
// (the Odoo API finds that order by phone + barcode, so nothing Odoo-side is
// stored here). `extra` is merged into the request, e.g. { status: 'picked_up' }.
export async function updateRentalInOdoo({ rental, unitBarcode, customerPhone, rentalId, extra = {} }) {
  if (!canSync(unitBarcode, customerPhone)) return { ok: false, error: skipReason(unitBarcode, customerPhone) };
  return postToOdoo(
    '/rentals/update',
    { phone: customerPhone, sku: unitBarcode, ...buildOdooFields(rental), ...extra },
    'update',
    rentalId ?? rental.id
  );
}

const STATUS_LABELS = { pickup: 'Booked (not picked up)', return: 'Picked up', returned: 'Returned' };
const dateOnly = (v) => String(v).slice(0, 10);

// Read-only comparison of an open rental against its Odoo order. Resolves to
// { state, reason?, differences?, odoo? } where state is one of:
//   synced      - Odoo matches this rental
//   mismatch    - the order exists but some values differ (see differences)
//   missing     - no matching active order in Odoo
//   skipped     - not tracked in Odoo (no barcode or phone) or already returned
//   unavailable - the Odoo API could not be reached or returned an error
export async function checkRentalInOdoo({ rental, unitBarcode, customerPhone }) {
  if (rental.returned_at) return { state: 'skipped', reason: 'already returned' };
  const reason = skipReason(unitBarcode, customerPhone);
  if (reason) return { state: 'skipped', reason };

  let odoo;
  try {
    const res = await fetch(`${ODOO_API_URL}/rentals/check?phone=${encodeURIComponent(customerPhone)}&sku=${encodeURIComponent(unitBarcode)}`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { state: 'unavailable', reason: body.error || `HTTP ${res.status}` };
    odoo = body;
  } catch (error) {
    return { state: 'unavailable', reason: `Odoo API unreachable: ${error.message}` };
  }

  if (!odoo.found) return { state: 'missing', reason: odoo.reason };

  const expected = buildOdooFields(rental);
  const differences = [];
  const add = (field, exp, act) => differences.push({ field, expected: exp, actual: act });

  if (dateOnly(odoo.startDate) !== dateOnly(expected.startDate)) add('Start date', dateOnly(expected.startDate), dateOnly(odoo.startDate));
  if (dateOnly(odoo.returnDate) !== dateOnly(expected.returnDate)) add('Return date', dateOnly(expected.returnDate), dateOnly(odoo.returnDate));
  if (expected.price !== undefined && Math.abs(Number(odoo.rentalPrice) - expected.price) > 0.005) {
    add('Rental price', expected.price.toFixed(2), odoo.rentalPrice === null ? '(none)' : Number(odoo.rentalPrice).toFixed(2));
  }
  if (expected.bond) {
    if (odoo.bondPrice === null) add('Bond', expected.bond.amount.toFixed(2), '(none)');
    else if (Math.abs(Number(odoo.bondPrice) - expected.bond.amount) > 0.005) add('Bond', expected.bond.amount.toFixed(2), Number(odoo.bondPrice).toFixed(2));
  }
  if (odoo.rentalStatus !== 'return') add('Status', STATUS_LABELS.return, STATUS_LABELS[odoo.rentalStatus] || odoo.rentalStatus);

  return {
    state: differences.length ? 'mismatch' : 'synced',
    differences,
    odoo: { orderId: odoo.orderId, orderName: odoo.orderName, activeOrderCount: odoo.activeOrderCount },
  };
}

// Brings Odoo in line with an open rental: creates the order if it is
// missing, or rewrites dates/price/bond/status if it differs. Does nothing
// when already synced. Resolves to { action, ok, error?, check } with a
// fresh check afterwards.
export async function retryRentalSync({ rental, unitBarcode, customerPhone, rentalId }) {
  const before = await checkRentalInOdoo({ rental, unitBarcode, customerPhone });
  let action = 'none';
  let result = { ok: true };

  if (before.state === 'missing') {
    action = 'created';
    result = await postRentalToOdoo({ rental, unitBarcode, customerPhone, rentalId });
  } else if (before.state === 'mismatch') {
    action = 'updated';
    result = await updateRentalInOdoo({ rental, unitBarcode, customerPhone, rentalId, extra: { status: 'picked_up' } });
  } else if (before.state !== 'synced') {
    return { action, ok: false, error: before.reason, check: before };
  }

  return { action, ok: result.ok, error: result.error, check: await checkRentalInOdoo({ rental, unitBarcode, customerPhone }) };
}
