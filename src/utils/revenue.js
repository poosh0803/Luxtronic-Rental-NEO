const PERIOD_DAYS = { day: 1, week: 7, month: 30 };
const MS_PER_DAY = 86400000;

// Rough revenue estimate for one rental: the recorded final fee if staff set
// one (e.g. after a discount), otherwise rate x number of periods covered by
// the rental so far (or in full, if it's been returned). This is an
// estimate only - the app doesn't keep a real payment ledger (see
// LUXTRONIC-PRIVACY-DATA-GUIDELINES.md / project decisions).
export function estimateRevenue(r) {
  if (r.final_fee) return Number(r.final_fee);
  if (!r.rental_fee || !r.fee_frequency) return 0;
  const periodDays = PERIOD_DAYS[r.fee_frequency] || 1;
  const start = new Date(r.start_date);
  const end = r.returned_at ? new Date(r.returned_at) : new Date(r.due_date);
  const durationDays = Math.max(1, Math.round((end - start) / MS_PER_DAY));
  const periods = Math.max(1, Math.ceil(durationDays / periodDays));
  return Number(r.rental_fee) * periods;
}
