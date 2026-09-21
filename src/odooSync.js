// Mirrors rentals to the Luxtronic Odoo API (see Luxtronic-Odoo-API/README.md)
// so they show up as rental sale orders in Odoo Online. Fire-and-forget by
// design: a down/misconfigured Odoo API must never affect this app's own
// operation (same principle as lateNotifier.js's portal notifications).
const ODOO_API_URL = process.env.ODOO_API_URL || 'http://localhost:4001';
const BOND_ODOO_BARCODE = 'RENTAL-BOND';
const PERIOD_DAYS = { day: 1, week: 7, month: 30 };
const MS_PER_DAY = 86400000;

// Same estimate as analytics.js's estimateRevenue(), but for a rental that's
// only just been booked (no returned_at yet) - the agreed final fee if
// staff set one, otherwise rate x periods over the planned start/due dates.
function estimatePrice(rental) {
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

async function postToOdoo(path, body, action) {
  try {
    const res = await fetch(`${ODOO_API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      console.error(`Odoo ${action} failed (ignored):`, errBody.error || res.status);
      return;
    }
    console.log(`Odoo ${action} done:`, await res.json());
  } catch (error) {
    console.error(`Odoo ${action} failed (ignored):`, error.message);
  }
}

function canSync(unitBarcode, customerPhone) {
  if (!unitBarcode) {
    console.log('Odoo sync skipped: unit has no Odoo barcode set.');
    return false;
  }
  if (!customerPhone) {
    console.log('Odoo sync skipped: customer has no phone number.');
    return false;
  }
  return true;
}

export async function postRentalToOdoo({ rental, unitBarcode, customerPhone }) {
  if (!canSync(unitBarcode, customerPhone)) return;
  await postToOdoo(
    '/rentals',
    { customer: { phone: customerPhone }, sku: unitBarcode, quantity: 1, ...buildOdooFields(rental) },
    'order creation'
  );
}

// Marks the rental's Odoo line as returned (restores stock there).
export async function returnRentalInOdoo({ unitBarcode, customerPhone }) {
  if (!canSync(unitBarcode, customerPhone)) return;
  await postToOdoo('/rentals/return', { phone: customerPhone, sku: unitBarcode }, 'order return');
}

// Cancels the rental's Odoo order (it stays in Odoo for audit, not deleted) -
// used when a rental is deleted here.
export async function cancelRentalInOdoo({ unitBarcode, customerPhone }) {
  if (!canSync(unitBarcode, customerPhone)) return;
  await postToOdoo('/rentals/cancel', { phone: customerPhone, sku: unitBarcode }, 'order cancel');
}

// Pushes an edited rental's dates/price/bond onto its existing Odoo order
// (the Odoo API finds that order by phone + barcode, so nothing Odoo-side is
// stored here).
export async function updateRentalInOdoo({ rental, unitBarcode, customerPhone }) {
  if (!canSync(unitBarcode, customerPhone)) return;
  await postToOdoo('/rentals/update', { phone: customerPhone, sku: unitBarcode, ...buildOdooFields(rental) }, 'order update');
}
