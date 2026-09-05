function rentalStatusBadge(r) {
  if (r.returned_at) return '<span class="badge badge-retired">Returned</span>';
  if (r.is_overdue) return '<span class="badge badge-overdue">Overdue</span>';
  return '<span class="badge badge-rented">Active</span>';
}

document.addEventListener('DOMContentLoaded', async () => {
  const body = document.getElementById('historyBody');
  const empty = document.getElementById('historyEmpty');
  try {
    const { rentals } = await fetchJSON('/api/rentals');
    empty.style.display = rentals.length === 0 ? 'block' : 'none';
    body.innerHTML = rentals
      .map(
        (r) => `<tr class="clickable" onclick="location.href='/rental-detail?id=${r.id}'">
          <td>${escapeHtml(r.unit_label)}</td>
          <td>${r.unit_type === 'laptop' ? 'Laptop' : 'Desktop'}</td>
          <td>${escapeHtml(r.customer_name)}</td>
          <td>${formatDate(r.start_date)}</td>
          <td>${formatDate(r.due_date)}</td>
          <td>${r.returned_at ? formatDate(r.returned_at) : '-'}</td>
          <td>${rentalStatusBadge(r)}</td>
        </tr>`
      )
      .join('');
  } catch (err) {
    body.innerHTML = `<tr><td colspan="7"><div class="alert alert-danger">${escapeHtml(err.message)}</div></td></tr>`;
  }
});
