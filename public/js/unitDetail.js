function getUnitId() {
  return new URLSearchParams(window.location.search).get('id');
}

function specsList(specs) {
  if (!specs || typeof specs !== 'object' || Object.keys(specs).length === 0) return '';
  return `<div class="specs-list">${Object.entries(specs)
    .map(([k, v]) => `<div><strong>${escapeHtml(k)}:</strong> ${escapeHtml(v)}</div>`)
    .join('')}</div>`;
}

document.addEventListener('DOMContentLoaded', async () => {
  const id = getUnitId();
  try {
    const { unit, rentals } = await fetchJSON(`/api/units/${id}`);

    document.getElementById('pageTitle').textContent = unit.label;
    document.getElementById('pageSubtitle').textContent = `${unit.type === 'laptop' ? 'Laptop' : 'Desktop'} — ${escapeHtml(unit.serial_number) || 'no serial recorded'}`;

    document.getElementById('unitInfo').innerHTML = `
      <div style="margin-bottom:10px;">${statusBadge(unit.status)}</div>
      <div>Estimate Value: ${unit.estimate_value ? '$' + Number(unit.estimate_value).toFixed(2) : '-'}</div>
      <div>Accessories: ${escapeHtml(unit.accessories) || '-'}</div>
      ${specsList(unit.specs)}
    `;

    const historyBody = document.getElementById('historyBody');
    const historyEmpty = document.getElementById('historyEmpty');
    historyEmpty.style.display = rentals.length === 0 ? 'block' : 'none';
    historyBody.innerHTML = rentals
      .map(
        (r) => `<tr class="clickable" onclick="location.href='/rental-detail?id=${r.id}'">
          <td>${escapeHtml(r.customer_name)}</td>
          <td>${formatDate(r.start_date)}</td>
          <td>${formatDate(r.due_date)}</td>
          <td>${r.returned_at ? formatDate(r.returned_at) : '-'}</td>
          <td>${r.rental_fee ? '$' + Number(r.rental_fee).toFixed(2) + '/' + r.fee_frequency : '-'}</td>
          <td>${r.security_bond ? '$' + Number(r.security_bond).toFixed(2) : '-'}</td>
        </tr>`
      )
      .join('');
  } catch (err) {
    document.getElementById('loadError').innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message)}</div>`;
  }
});
