// Guided, one-question-at-a-time alternative to the plain New Rental form
// (see newRental.js) - same backend calls, just walked through as a wizard.
// Everything lives client-side in `formData` until the final submit, which
// hits the exact same POST /api/rentals + photo-upload sequence the plain
// form uses - so a rental created here is indistinguishable from one
// created there.

const TOTAL_STEPS = 10;

let currentStep = 1;
let selectedCustomerId = null;
let selectedUnitId = null;
let selectedUnitLabel = '';
let availableUnitsCache = [];
let searchTimer = null;
let unitSearchTimer = null;
let photoFiles = [];

const formData = {
  existing_customer: false,
  customer_search_label: '',
  cust_name: '',
  cust_phone: '',
  cust_address: '',
  cust_email: '',
  start_date: '',
  due_date: '',
  rental_fee: '',
  fee_frequency: 'day',
  final_fee: '',
  security_bond: '',
  security_bond_currency: 'AUD',
  accessories: [],
  accessories_other: '',
  notes: '',
};

const ACCESSORY_LABELS = { Charger: 'Charger', Bag: 'Bag', Powerbank: 'Powerbank', other: 'Other' };

function accessoriesIncludedText() {
  const parts = formData.accessories.filter((a) => a !== 'other').slice();
  if (formData.accessories.includes('other') && formData.accessories_other) parts.push(formData.accessories_other);
  return parts.join(', ');
}

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
  selectedUnitLabel = `${label} (${type === 'laptop' ? 'Laptop' : 'Desktop'})`;
  const box = document.getElementById('selectedUnit');
  box.style.display = 'block';
  box.textContent = `Selected: ${selectedUnitLabel}`;
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
  formData.customer_search_label = `${name}${phone ? ' — ' + phone : ''}`;
  const box = document.getElementById('selectedCustomer');
  box.style.display = 'block';
  box.textContent = `Selected: ${formData.customer_search_label}`;
  document.getElementById('customerResults').innerHTML = '';
  document.getElementById('customerSearch').value = '';
};

function readStepInputs(step) {
  switch (step) {
    case 1:
      formData.cust_name = document.getElementById('custName').value.trim();
      formData.cust_phone = document.getElementById('custPhone').value.trim();
      formData.cust_address = document.getElementById('custAddress').value.trim();
      formData.cust_email = document.getElementById('custEmail').value.trim();
      break;
    case 3:
      formData.start_date = document.getElementById('startDate').value;
      formData.due_date = document.getElementById('dueDate').value;
      break;
    case 4:
      formData.rental_fee = document.getElementById('rentalFee').value;
      break;
    case 5:
      formData.final_fee = document.getElementById('finalFee').value;
      break;
    case 6:
      formData.security_bond = document.getElementById('securityBond').value;
      break;
    case 7:
      formData.accessories_other = document.getElementById('accessoriesOther').value.trim();
      break;
    case 8:
      formData.notes = document.getElementById('notes').value.trim();
      break;
  }
}

function validateStep(step) {
  if (step === 1) {
    if (formData.existing_customer && !selectedCustomerId) return 'Please search and select an existing customer.';
    if (!formData.existing_customer && !formData.cust_name) return 'Please enter the customer name.';
  }
  if (step === 2 && !selectedUnitId) return 'Please search and select an available unit.';
  if (step === 3 && (!formData.start_date || !formData.due_date)) return 'Please choose both a start date and a due date.';
  return null;
}

function showStep(step) {
  document.querySelectorAll('.wizard-step').forEach((el) => {
    el.classList.toggle('active', parseInt(el.dataset.step, 10) === step);
  });
  document.getElementById('progressLabel').textContent = `Step ${step} of ${TOTAL_STEPS}`;
  document.getElementById('progressFill').style.width = `${Math.round((step / TOTAL_STEPS) * 100)}%`;
  document.getElementById('backBtn').style.display = step === 1 ? 'none' : 'inline-block';
  document.getElementById('nextBtn').style.display = step === TOTAL_STEPS ? 'none' : 'inline-block';
  document.getElementById('submitBtn').style.display = step === TOTAL_STEPS ? 'inline-block' : 'none';
  document.getElementById('wizardError').innerHTML = '';
  if (step === 10) renderReview();
}

async function goNext() {
  readStepInputs(currentStep);
  const error = validateStep(currentStep);
  if (error) {
    document.getElementById('wizardError').innerHTML = `<div class="alert alert-danger">${escapeHtml(error)}</div>`;
    return;
  }
  currentStep = Math.min(currentStep + 1, TOTAL_STEPS);
  showStep(currentStep);
}

function goBack() {
  readStepInputs(currentStep);
  currentStep = Math.max(currentStep - 1, 1);
  showStep(currentStep);
}

function goToStep(step) {
  currentStep = step;
  showStep(step);
}

function renderReview() {
  const rows = [];
  const section = (title, editStep, rowsHtml) => `
    <div class="review-section">
      <div class="review-section-header">
        <h2>${escapeHtml(title)}</h2>
        <a href="#" class="btn btn-sm" data-edit-step="${editStep}">Edit</a>
      </div>
      ${rowsHtml}
    </div>`;
  const row = (label, value) => `<div class="review-row"><span class="review-label">${escapeHtml(label)}</span><span class="review-value">${escapeHtml(value || '-')}</span></div>`;

  rows.push(
    section(
      'Customer',
      1,
      formData.existing_customer
        ? row('Customer', formData.customer_search_label)
        : row('Name', formData.cust_name) + row('Phone', formData.cust_phone) + row('Address', formData.cust_address) + row('Email', formData.cust_email)
    )
  );
  rows.push(section('Unit', 2, row('Unit', selectedUnitLabel)));
  rows.push(section('Rental Period', 3, row('Start Date', formData.start_date) + row('Due Date', formData.due_date)));
  rows.push(
    section('Rental Fee', 4, row('Rate', formData.rental_fee ? '$' + Number(formData.rental_fee).toFixed(2) + ' per ' + formData.fee_frequency : '-'))
  );
  rows.push(section('Final Fee', 5, row('Final Fee', formData.final_fee ? '$' + Number(formData.final_fee).toFixed(2) : 'Using the rate above')));
  rows.push(
    section('Security Bond', 6, row('Bond', formData.security_bond ? formatMoney(formData.security_bond, formData.security_bond_currency) : '-'))
  );
  rows.push(section('Accessories', 7, row('Included', accessoriesIncludedText() || 'None')));
  rows.push(section('Notes', 8, row('Notes', formData.notes)));
  rows.push(
    section(
      'Photos',
      9,
      photoFiles.length ? `<div class="photo-grid">${photoFiles.map((f) => `<img src="${f.previewUrl}">`).join('')}</div>` : row('Photos', 'None attached')
    )
  );

  document.getElementById('reviewContent').innerHTML = rows.join('');
}

function selectSingleChoice(groupId, key, value) {
  formData[key] = value;
  document.getElementById(groupId).querySelectorAll('.choice-btn').forEach((btn) => {
    btn.classList.toggle('selected', btn.dataset.value === value);
  });
}

function toggleMultiChoice(groupId, key, value) {
  const arr = formData[key];
  const idx = arr.indexOf(value);
  if (idx === -1) arr.push(value);
  else arr.splice(idx, 1);
  document.getElementById(groupId).querySelectorAll('.choice-btn').forEach((btn) => {
    btn.classList.toggle('selected', arr.includes(btn.dataset.value));
  });
}

function renderPhotoGrid() {
  document.getElementById('photoGrid').innerHTML = photoFiles
    .map(
      (f, i) => `<div class="photo-item">
        <img src="${f.previewUrl}">
        <button type="button" class="photo-delete-btn" title="Remove" onclick="removeGuidedPhoto(${i})">&times;</button>
      </div>`
    )
    .join('');
}

window.removeGuidedPhoto = function (index) {
  URL.revokeObjectURL(photoFiles[index].previewUrl);
  photoFiles.splice(index, 1);
  renderPhotoGrid();
};

document.addEventListener('DOMContentLoaded', () => {
  loadAvailableUnits();

  const today = new Date().toISOString().slice(0, 10);
  document.getElementById('startDate').value = today;
  formData.start_date = today;

  const existingToggle = document.getElementById('existingCustomerToggle');
  const existingBlock = document.getElementById('existingCustomerBlock');
  const newBlock = document.getElementById('newCustomerBlock');
  existingToggle.addEventListener('change', () => {
    formData.existing_customer = existingToggle.checked;
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

  document.getElementById('feeFrequencyChoices').addEventListener('click', (e) => {
    const btn = e.target.closest('.choice-btn');
    if (btn) selectSingleChoice('feeFrequencyChoices', 'fee_frequency', btn.dataset.value);
  });
  document.getElementById('securityBondCurrencyChoices').addEventListener('click', (e) => {
    const btn = e.target.closest('.choice-btn');
    if (btn) selectSingleChoice('securityBondCurrencyChoices', 'security_bond_currency', btn.dataset.value);
  });
  document.getElementById('accessoryChoices').addEventListener('click', (e) => {
    const btn = e.target.closest('.choice-btn');
    if (btn) toggleMultiChoice('accessoryChoices', 'accessories', btn.dataset.value);
  });

  document.getElementById('checkoutPhotoInput').addEventListener('change', (e) => {
    const files = Array.from(e.target.files || []);
    photoFiles = photoFiles.concat(files.map((file) => ({ file, previewUrl: URL.createObjectURL(file) })));
    renderPhotoGrid();
    e.target.value = '';
  });

  document.getElementById('nextBtn').addEventListener('click', goNext);
  document.getElementById('backBtn').addEventListener('click', goBack);

  document.getElementById('reviewContent').addEventListener('click', (e) => {
    const editBtn = e.target.closest('[data-edit-step]');
    if (!editBtn) return;
    e.preventDefault();
    goToStep(parseInt(editBtn.dataset.editStep, 10));
  });

  document.getElementById('submitBtn').addEventListener('click', async () => {
    const errorEl = document.getElementById('wizardError');
    errorEl.innerHTML = '';

    const payload = {
      unit_id: selectedUnitId,
      start_date: formData.start_date,
      due_date: formData.due_date,
      rental_fee: formData.rental_fee || null,
      fee_frequency: formData.fee_frequency,
      final_fee: formData.final_fee || null,
      security_bond: formData.security_bond || null,
      security_bond_currency: formData.security_bond_currency,
      accessories_included: accessoriesIncludedText(),
      notes: formData.notes,
    };

    if (formData.existing_customer) {
      payload.customer_id = selectedCustomerId;
    } else {
      payload.new_customer = {
        full_name: formData.cust_name,
        phone: formData.cust_phone,
        address: formData.cust_address,
        email: formData.cust_email,
      };
    }

    try {
      const result = await fetchJSON('/api/rentals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      for (const { file } of photoFiles) {
        const fd = new FormData();
        fd.append('photo', file);
        fd.append('stage', 'checkout');
        await fetch(`/api/rentals/${result.id}/photos`, { method: 'POST', body: fd });
      }

      window.location.href = `/rental-detail?id=${result.id}`;
    } catch (err) {
      errorEl.innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message)}</div>`;
    }
  });

  showStep(currentStep);
});
