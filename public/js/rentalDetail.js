function getRentalId() {
  return new URLSearchParams(window.location.search).get('id');
}

function specsList(specs) {
  if (!specs || typeof specs !== 'object' || Object.keys(specs).length === 0) return '';
  return `<div class="specs-list">${Object.entries(specs)
    .map(([k, v]) => `<div><strong>${escapeHtml(k)}:</strong> ${escapeHtml(v)}</div>`)
    .join('')}</div>`;
}

async function load() {
  const id = getRentalId();
  document.getElementById('printLink').href = `/print-agreement?id=${id}`;

  try {
    const { rental, photos } = await fetchJSON(`/api/rentals/${id}`);
    document.getElementById('pageTitle').textContent = `Rental: ${rental.unit_label}`;

    const isOverdue = !rental.returned_at && new Date(rental.due_date) < new Date(new Date().toDateString());
    if (isOverdue) {
      const banner = document.getElementById('overdueBanner');
      banner.style.display = 'block';
      banner.textContent = `This rental is overdue — was due back ${formatDate(rental.due_date)}.`;
    }

    document.getElementById('unitInfo').innerHTML = `
      <div><strong>${escapeHtml(rental.unit_label)}</strong> (${rental.unit_type === 'laptop' ? 'Laptop' : 'Desktop'})</div>
      <div>Serial: ${escapeHtml(rental.serial_number) || '-'}</div>
      ${specsList(rental.specs)}
    `;

    document.getElementById('customerInfo').innerHTML = `
      <div><strong>${escapeHtml(rental.customer_name)}</strong></div>
      <div>${escapeHtml(rental.customer_phone) || '-'}</div>
      <div>${escapeHtml(rental.customer_address) || '-'}</div>
    `;

    document.getElementById('termsInfo').innerHTML = `
      <div><strong>Period:</strong> ${formatDate(rental.start_date)} to ${formatDate(rental.due_date)}</div>
      <div><strong>Fee:</strong> ${rental.rental_fee ? '$' + Number(rental.rental_fee).toFixed(2) + ' per ' + rental.fee_frequency : '-'}</div>
      <div><strong>Security Bond:</strong> ${rental.security_bond ? '$' + Number(rental.security_bond).toFixed(2) : '-'}</div>
      <div><strong>Accessories:</strong> ${escapeHtml(rental.accessories_included) || '-'}</div>
      <div><strong>Notes:</strong> ${escapeHtml(rental.notes) || '-'}</div>
      <div><strong>Returned:</strong> ${rental.returned_at ? formatDate(rental.returned_at) : 'Not yet returned'}</div>
    `;

    const checkoutPhotos = photos.filter((p) => p.stage === 'checkout');
    const returnPhotos = photos.filter((p) => p.stage === 'return');
    document.getElementById('checkoutPhotos').innerHTML =
      checkoutPhotos.map((p) => `<img src="${p.file_path}" alt="Checkout photo">`).join('') || '<div class="empty">None</div>';
    document.getElementById('returnPhotos').innerHTML =
      returnPhotos.map((p) => `<img src="${p.file_path}" alt="Return photo">`).join('') || '<div class="empty">None</div>';

    if (rental.returned_at) {
      document.getElementById('returnPanel').style.display = 'none';
    }
  } catch (err) {
    document.getElementById('loadError').innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message)}</div>`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  load();

  document.getElementById('markReturnedBtn').addEventListener('click', async () => {
    const id = getRentalId();
    const errorEl = document.getElementById('returnError');
    errorEl.innerHTML = '';
    try {
      const files = document.getElementById('returnPhotoInput').files;
      for (const file of files) {
        const fd = new FormData();
        fd.append('photo', file);
        fd.append('stage', 'return');
        await fetch(`/api/rentals/${id}/photos`, { method: 'POST', body: fd });
      }
      await fetchJSON(`/api/rentals/${id}/return`, { method: 'PUT' });
      load();
    } catch (err) {
      errorEl.innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message)}</div>`;
    }
  });
});
