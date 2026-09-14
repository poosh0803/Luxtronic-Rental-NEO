// Posts a newly created rental to the Luxtronic Odoo API (see
// Luxtronic-Odoo-API/README.md) so it shows up as a rental sale order in
// Odoo Online. Fire-and-forget by design: a down/misconfigured Odoo API
// must never affect this app's own operation (same principle as
// lateNotifier.js's portal notifications).
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

// rental.start_date/due_date arrive here as plain "YYYY-MM-DD" strings
// straight from the request body (the date <input> sends that format
// directly), so no timezone conversion is needed before handing them to Odoo.
function toOdooDate(dateStr) {
  return `${dateStr} 00:00:00`;
}

export async function postRentalToOdoo({ rental, unitBarcode, customerPhone }) {
  if (!unitBarcode) {
    console.log('Odoo sync skipped: unit has no Odoo barcode set.');
    return;
  }
  if (!customerPhone) {
    console.log('Odoo sync skipped: customer has no phone number.');
    return;
  }

  const body = {
    customer: { phone: customerPhone },
    sku: unitBarcode,
    quantity: 1,
    startDate: toOdooDate(rental.start_date),
    returnDate: toOdooDate(rental.due_date),
  };

  const price = estimatePrice(rental);
  if (price !== null) body.price = price;

  if (rental.security_bond) {
    if (rental.security_bond_currency === 'AUD') {
      body.bond = { sku: BOND_ODOO_BARCODE, amount: Number(rental.security_bond) };
    } else {
      console.log(`Odoo sync: skipping bond line, bond is in ${rental.security_bond_currency}, not AUD.`);
    }
  }

  try {
    const res = await fetch(`${ODOO_API_URL}/rentals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      console.error('Odoo order creation failed (ignored):', errBody.error || res.status);
      return;
    }
    const created = await res.json();
    console.log('Odoo order created:', created);
  } catch (error) {
    console.error('Odoo order creation failed (ignored):', error.message);
  }
}
