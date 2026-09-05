// Computes a unit's display status from its manual override + any open rental.
// Status is never stored directly so it can't drift out of sync with the rentals table.
export function computeUnitStatus(unit) {
  if (unit.manual_status && unit.manual_status !== 'none') {
    return unit.manual_status; // 'in_repair' | 'retired'
  }
  if (unit.open_rental_id) {
    const due = new Date(unit.open_due_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return due < today ? 'overdue' : 'rented';
  }
  return 'available';
}

// Shared SELECT fragment: units left-joined to their open (unreturned) rental + that rental's customer.
export const UNIT_SELECT_WITH_OPEN_RENTAL = `
  SELECT
    u.id, u.type, u.label, u.specs, u.serial_number, u.accessories, u.estimate_value,
    u.manual_status, u.created_at,
    r.id AS open_rental_id, r.due_date AS open_due_date, r.start_date AS open_start_date,
    c.id AS open_customer_id, c.full_name AS open_customer_name
  FROM units u
  LEFT JOIN rentals r ON r.unit_id = u.id AND r.returned_at IS NULL
  LEFT JOIN customers c ON c.id = r.customer_id
`;

export function attachStatus(row) {
  return { ...row, status: computeUnitStatus(row) };
}
