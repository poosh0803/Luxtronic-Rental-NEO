let currentRental = null;

function getRentalId() {
  return new URLSearchParams(window.location.search).get('id');
}

function toDateInputValue(value) {
  if (!value) return '';
  // node-postgres parses DATE columns as a JS Date at *local* midnight, so
  // the serialized ISO string's UTC time component is shifted by the
  // server's timezone offset (e.g. "2026-08-27" becomes
  // "...T14:00:00.000Z" for AEST). Reading the date back with local
  // getters (not UTC ones) undoes that shift - the same way formatDate()
  // in common.js already renders it correctly elsewhere on this page.
  const d = new Date(value);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
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
    currentRental = rental;
    document.getElementById('pageTitle').textContent = `Rental: ${rental.unit_label}`;
    document.getElementById('rentalEditForm').style.display = 'none';

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
      <div><strong>Final Rental Fee:</strong> ${rental.final_fee ? '$' + Number(rental.final_fee).toFixed(2) : '-'}</div>
      <div><strong>Security Bond:</strong> ${rental.security_bond ? '$' + Number(rental.security_bond).toFixed(2) : '-'}</div>
      <div><strong>Accessories:</strong> ${escapeHtml(rental.accessories_included) || '-'}</div>
      <div><strong>Notes:</strong> ${escapeHtml(rental.notes) || '-'}</div>
      <div><strong>Returned:</strong> ${rental.returned_at ? formatDate(rental.returned_at) : 'Not yet returned'}</div>
    `;

    const checkoutPhotos = photos.filter((p) => p.stage === 'checkout');
    const returnPhotos = photos.filter((p) => p.stage === 'return');
    document.getElementById('checkoutPhotos').innerHTML =
      checkoutPhotos
        .map(
          (p) => `<div class="photo-item">
            <img src="${p.file_path}" alt="Checkout photo">
            <button type="button" class="photo-delete-btn" title="Delete photo" onclick="deleteCheckoutPhoto(${p.id})">&times;</button>
          </div>`
        )
        .join('') || '<div class="empty">None</div>';
    document.getElementById('returnPhotos').innerHTML =
      returnPhotos.map((p) => `<img src="${p.file_path}" alt="Return photo">`).join('') || '<div class="empty">None</div>';

    if (rental.returned_at) {
      document.getElementById('returnPanel').style.display = 'none';
    }
  } catch (err) {
    document.getElementById('loadError').innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message)}</div>`;
  }
}

window.deleteCheckoutPhoto = async function (photoId) {
  if (!confirm('Delete this checkout photo?')) return;
  const errorEl = document.getElementById('checkoutPhotoError');
  errorEl.innerHTML = '';
  try {
    await fetchJSON(`/api/rentals/${getRentalId()}/photos/${photoId}`, { method: 'DELETE' });
    load();
  } catch (err) {
    errorEl.innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message)}</div>`;
  }
};

document.addEventListener('DOMContentLoaded', () => {
  load();

  document.getElementById('addCheckoutPhotoBtn').addEventListener('click', async () => {
    const errorEl = document.getElementById('checkoutPhotoError');
    errorEl.innerHTML = '';
    const input = document.getElementById('addCheckoutPhotoInput');
    const files = input.files;
    if (!files || files.length === 0) {
      errorEl.innerHTML = `<div class="alert alert-danger">Choose one or more photos first.</div>`;
      return;
    }
    try {
      for (const file of files) {
        const fd = new FormData();
        fd.append('photo', file);
        fd.append('stage', 'checkout');
        await fetch(`/api/rentals/${getRentalId()}/photos`, { method: 'POST', body: fd });
      }
      input.value = '';
      load();
    } catch (err) {
      errorEl.innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message)}</div>`;
    }
  });

  document.getElementById('markReturnedBtn').addEventListener('click', async () => {
    if (!confirm('Mark this unit as returned?')) return;
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

  document.getElementById('editRentalBtn').addEventListener('click', () => {
    if (!currentRental) return;
    document.getElementById('editStartDate').value = toDateInputValue(currentRental.start_date);
    document.getElementById('editDueDate').value = toDateInputValue(currentRental.due_date);
    document.getElementById('editRentalFee').value = currentRental.rental_fee || '';
    document.getElementById('editFeeFrequency').value = currentRental.fee_frequency || 'day';
    document.getElementById('editFinalFee').value = currentRental.final_fee || '';
    document.getElementById('editSecurityBond').value = currentRental.security_bond || '';
    document.getElementById('editAccessoriesIncluded').value = currentRental.accessories_included || '';
    document.getElementById('editNotes').value = currentRental.notes || '';
    document.getElementById('rentalEditError').innerHTML = '';
    document.getElementById('rentalEditForm').style.display = 'block';
  });

  document.getElementById('cancelRentalEditBtn').addEventListener('click', () => {
    document.getElementById('rentalEditForm').style.display = 'none';
  });

  document.getElementById('saveRentalBtn').addEventListener('click', async () => {
    const errorEl = document.getElementById('rentalEditError');
    errorEl.innerHTML = '';
    try {
      await fetchJSON(`/api/rentals/${getRentalId()}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start_date: document.getElementById('editStartDate').value,
          due_date: document.getElementById('editDueDate').value,
          rental_fee: document.getElementById('editRentalFee').value || null,
          fee_frequency: document.getElementById('editFeeFrequency').value,
          final_fee: document.getElementById('editFinalFee').value || null,
          security_bond: document.getElementById('editSecurityBond').value || null,
          accessories_included: document.getElementById('editAccessoriesIncluded').value,
          notes: document.getElementById('editNotes').value,
        }),
      });
      load();
    } catch (err) {
      errorEl.innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message)}</div>`;
    }
  });

  document.getElementById('deleteRentalBtn').addEventListener('click', async () => {
    if (!currentRental) return;
    if (!confirm(`Delete this rental of "${currentRental.unit_label}" to "${currentRental.customer_name}"? This cannot be undone.`)) return;
    const errorEl = document.getElementById('rentalDeleteError');
    errorEl.innerHTML = '';
    try {
      await fetchJSON(`/api/rentals/${getRentalId()}`, { method: 'DELETE' });
      location.href = '/rental-history';
    } catch (err) {
      errorEl.innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message)}</div>`;
    }
  });
});
