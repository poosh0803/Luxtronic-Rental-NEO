function specsToText(specs) {
  if (!specs || typeof specs !== 'object') return '';
  return Object.entries(specs)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
}

function textToSpecs(text) {
  const specs = {};
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const idx = line.indexOf(':');
      if (idx === -1) return;
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      if (key) specs[key] = value;
    });
  return specs;
}

function renderSpecsList(specs) {
  if (!specs || typeof specs !== 'object' || Object.keys(specs).length === 0) return '-';
  return `<div class="specs-list">${Object.entries(specs)
    .map(([k, v]) => `<div><strong>${escapeHtml(k)}:</strong> ${escapeHtml(v)}</div>`)
    .join('')}</div>`;
}

let unitsCache = [];
let currentTypeFilter = 'all';

function renderUnits() {
  const body = document.getElementById('unitsBody');
  const units = currentTypeFilter === 'all' ? unitsCache : unitsCache.filter((u) => u.type === currentTypeFilter);

  if (units.length === 0) {
    body.innerHTML = `<tr><td colspan="8"><div class="empty">${
      unitsCache.length === 0 ? 'No units yet. Add one above.' : 'No units of this type.'
    }</div></td></tr>`;
    return;
  }
  body.innerHTML = units
    .map(
      (u) => `<tr>
        <td><a href="/unit-detail?id=${u.id}">${escapeHtml(u.label)}</a></td>
        <td>${u.type === 'laptop' ? 'Laptop' : 'Desktop'}</td>
        <td>${renderSpecsList(u.specs)}</td>
        <td>${escapeHtml(u.serial_number) || '-'}</td>
        <td>${u.estimate_value ? '$' + Number(u.estimate_value).toFixed(2) : '-'}</td>
        <td>${statusBadge(u.status)}</td>
        <td>${u.open_customer_name ? escapeHtml(u.open_customer_name) + ' (due ' + formatDate(u.open_due_date) + ')' : '-'}</td>
        <td>
          <a class="btn btn-sm btn-fixed" href="/unit-detail?id=${u.id}">History</a>
          <button class="btn btn-sm btn-fixed" onclick="editUnit(${u.id})">Edit</button>
        </td>
      </tr>`
    )
    .join('');
}

async function loadUnits() {
  const errorEl = document.getElementById('unitsError');
  try {
    const { units } = await fetchJSON('/api/units');
    unitsCache = units;
    renderUnits();
  } catch (err) {
    errorEl.innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message)}</div>`;
  }
}

function showUnitForm() {
  document.getElementById('unitFormPanel').style.display = 'block';
  document.getElementById('unitFormPanel').scrollIntoView({ behavior: 'smooth' });
}

function resetUnitForm() {
  document.getElementById('unitForm').reset();
  document.getElementById('unitId').value = '';
  document.getElementById('unitFormTitle').textContent = 'Add Unit';
  document.getElementById('unitFormError').innerHTML = '';
  document.getElementById('deleteUnitBtn').style.display = 'none';
}

window.editUnit = function (id) {
  const unit = unitsCache.find((u) => u.id === id);
  if (!unit) return;
  document.getElementById('unitId').value = unit.id;
  document.getElementById('unitType').value = unit.type;
  document.getElementById('unitLabel').value = unit.label;
  document.getElementById('unitSerial').value = unit.serial_number || '';
  document.getElementById('unitValue').value = unit.estimate_value || '';
  document.getElementById('unitAccessories').value = unit.accessories || '';
  document.getElementById('unitSpecs').value = specsToText(unit.specs);
  document.getElementById('unitManualStatus').value = unit.manual_status || 'none';
  document.getElementById('unitFormTitle').textContent = `Edit ${unit.label}`;
  document.getElementById('deleteUnitBtn').style.display = 'inline-block';
  showUnitForm();
};

document.addEventListener('DOMContentLoaded', () => {
  loadUnits();

  document.getElementById('typeFilters').addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    document.querySelectorAll('#typeFilters .tab-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentTypeFilter = btn.dataset.type;
    renderUnits();
  });

  document.getElementById('addUnitBtn').addEventListener('click', () => {
    resetUnitForm();
    showUnitForm();
  });

  document.getElementById('cancelUnitForm').addEventListener('click', () => {
    document.getElementById('unitFormPanel').style.display = 'none';
    resetUnitForm();
  });

  document.getElementById('unitForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('unitFormError');
    errorEl.innerHTML = '';

    const id = document.getElementById('unitId').value;
    const payload = {
      type: document.getElementById('unitType').value,
      label: document.getElementById('unitLabel').value,
      serial_number: document.getElementById('unitSerial').value,
      estimate_value: document.getElementById('unitValue').value || null,
      accessories: document.getElementById('unitAccessories').value,
      specs: textToSpecs(document.getElementById('unitSpecs').value),
      manual_status: document.getElementById('unitManualStatus').value,
    };

    try {
      if (id) {
        await fetchJSON(`/api/units/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        await fetchJSON('/api/units', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
      document.getElementById('unitFormPanel').style.display = 'none';
      resetUnitForm();
      loadUnits();
    } catch (err) {
      errorEl.innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message)}</div>`;
    }
  });

  document.getElementById('deleteUnitBtn').addEventListener('click', async () => {
    const id = document.getElementById('unitId').value;
    if (!id) return;
    const unit = unitsCache.find((u) => u.id === Number(id));
    const label = unit ? unit.label : 'this unit';
    if (!confirm(`Delete "${label}"? This cannot be undone.`)) return;

    const errorEl = document.getElementById('unitFormError');
    errorEl.innerHTML = '';
    try {
      await fetchJSON(`/api/units/${id}`, { method: 'DELETE' });
      document.getElementById('unitFormPanel').style.display = 'none';
      resetUnitForm();
      loadUnits();
    } catch (err) {
      errorEl.innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message)}</div>`;
    }
  });
});
