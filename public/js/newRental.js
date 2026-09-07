let selectedCustomerId = null;
let selectedUnitId = null;
let availableUnitsCache = [];
let searchTimer = null;
let unitSearchTimer = null;

async function loadAvailableUnits() {
  const note = document.getElementById('unitNote');
  try {
    const { units } = await fetchJSON('/api/units?status=available');
    availableUnitsCache = units;
    if (units.length === 0) {
      note.style.display = 'block';
      document.getElementById('unitSearch').disabled = true;
    }
  } catch (err) {
    note.style.display = 'block';
    note.className = 'alert alert-danger';
    note.textContent = err.message;
  }
}

function searchUnits(q) {
  const results = document.getElementById('unitResults');
  if (!q) {
    results.innerHTML = '';
    return;
  }
  const query = q.toLowerCase();
  const matches = availableUnitsCache.filter(
    (u) => u.label.toLowerCase().includes(query) || (u.serial_number || '').toLowerCase().includes(query)
  );
  results.innerHTML =
    matches
      .map(
        (u) => `<div class="btn btn-sm" style="display:block; margin-bottom:6px; text-align:left;" onclick="selectUnit(${u.id}, '${escapeHtml(u.label).replace(/'/g, "\\'")}', '${u.type}')">
          ${escapeHtml(u.label)} (${u.type === 'laptop' ? 'Laptop' : 'Desktop'})${u.serial_number ? ' — ' + escapeHtml(u.serial_number) : ''}
        </div>`
      )
      .join('') || '<div class="empty">No matches</div>';
}

window.selectUnit = function (id, label, type) {
  selectedUnitId = id;
  const box = document.getElementById('selectedUnit');
  box.style.display = 'block';
  box.textContent = `Selected: ${label} (${type === 'laptop' ? 'Laptop' : 'Desktop'})`;
  document.getElementById('unitResults').innerHTML = '';
  document.getElementById('unitSearch').value = '';
};

async function searchCustomers(q) {
  const results = document.getElementById('customerResults');
  if (!q) {
    results.innerHTML = '';
    return;
  }
  try {
    const { customers } = await fetchJSON(`/api/customers?q=${encodeURIComponent(q)}`);
    results.innerHTML = customers
      .map(
        (c) => `<div class="btn btn-sm" style="display:block; margin-bottom:6px; text-align:left;" onclick="selectCustomer(${c.id}, '${escapeHtml(c.full_name).replace(/'/g, "\\'")}', '${escapeHtml(c.phone || '')}')">
          ${escapeHtml(c.full_name)} ${c.phone ? '— ' + escapeHtml(c.phone) : ''}
        </div>`
      )
      .join('') || '<div class="empty">No matches</div>';
  } catch (err) {
    results.innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message)}</div>`;
  }
}

window.selectCustomer = function (id, name, phone) {
  selectedCustomerId = id;
  const box = document.getElementById('selectedCustomer');
  box.style.display = 'block';
  box.textContent = `Selected: ${name}${phone ? ' — ' + phone : ''}`;
  document.getElementById('customerResults').innerHTML = '';
  document.getElementById('customerSearch').value = '';
};

document.addEventListener('DOMContentLoaded', () => {
  loadAvailableUnits();

  const today = new Date().toISOString().slice(0, 10);
  document.getElementById('startDate').value = today;

  const existingToggle = document.getElementById('existingCustomerToggle');
  const existingBlock = document.getElementById('existingCustomerBlock');
  const newBlock = document.getElementById('newCustomerBlock');
  existingToggle.addEventListener('change', () => {
    existingBlock.style.display = existingToggle.checked ? 'block' : 'none';
    newBlock.style.display = existingToggle.checked ? 'none' : 'block';
    selectedCustomerId = null;
  });

  document.getElementById('customerSearch').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    const value = e.target.value;
    searchTimer = setTimeout(() => searchCustomers(value), 250);
  });

  document.getElementById('unitSearch').addEventListener('input', (e) => {
    clearTimeout(unitSearchTimer);
    const value = e.target.value;
    unitSearchTimer = setTimeout(() => searchUnits(value), 150);
  });

  document.getElementById('rentalForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('formError');
    errorEl.innerHTML = '';

    if (!selectedUnitId) {
      errorEl.innerHTML = `<div class="alert alert-danger">Please search and select an available unit.</div>`;
      return;
    }

    const payload = {
      unit_id: selectedUnitId,
      start_date: document.getElementById('startDate').value,
      due_date: document.getElementById('dueDate').value,
      rental_fee: document.getElementById('rentalFee').value || null,
      fee_frequency: document.getElementById('feeFrequency').value,
      final_fee: document.getElementById('finalFee').value || null,
      security_bond: document.getElementById('securityBond').value || null,
      accessories_included: document.getElementById('accessoriesIncluded').value,
      notes: document.getElementById('notes').value,
    };

    if (existingToggle.checked) {
      if (!selectedCustomerId) {
        errorEl.innerHTML = `<div class="alert alert-danger">Please search and select an existing customer.</div>`;
        return;
      }
      payload.customer_id = selectedCustomerId;
    } else {
      const full_name = document.getElementById('custName').value.trim();
      if (!full_name) {
        errorEl.innerHTML = `<div class="alert alert-danger">Customer name is required.</div>`;
        return;
      }
      payload.new_customer = {
        full_name,
        phone: document.getElementById('custPhone').value,
        address: document.getElementById('custAddress').value,
        email: document.getElementById('custEmail').value,
      };
    }

    try {
      const result = await fetchJSON('/api/rentals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const files = document.getElementById('checkoutPhotos').files;
      for (const file of files) {
        const fd = new FormData();
        fd.append('photo', file);
        fd.append('stage', 'checkout');
        await fetch(`/api/rentals/${result.id}/photos`, { method: 'POST', body: fd });
      }

      location.href = `/rental-detail?id=${result.id}`;
    } catch (err) {
      errorEl.innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message)}</div>`;
    }
  });
});
