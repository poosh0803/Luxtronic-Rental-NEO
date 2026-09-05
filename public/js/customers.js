let searchTimer = null;
let currentCustomer = null;

async function loadCustomers(q) {
  const body = document.getElementById('customersBody');
  const empty = document.getElementById('customersEmpty');
  try {
    const url = q ? `/api/customers?q=${encodeURIComponent(q)}` : '/api/customers';
    const { customers } = await fetchJSON(url);
    empty.style.display = customers.length === 0 ? 'block' : 'none';
    body.innerHTML = customers
      .map(
        (c) => `<tr class="clickable" onclick="showCustomer(${c.id})">
          <td>${escapeHtml(c.full_name)}</td>
          <td>${escapeHtml(c.phone) || '-'}</td>
          <td>${escapeHtml(c.address) || '-'}</td>
          <td><button class="btn btn-sm" onclick="event.stopPropagation(); showCustomer(${c.id})">View</button></td>
        </tr>`
      )
      .join('');
  } catch (err) {
    body.innerHTML = `<tr><td colspan="4"><div class="alert alert-danger">${escapeHtml(err.message)}</div></td></tr>`;
  }
}

window.showCustomer = async function (id) {
  const panel = document.getElementById('detailPanel');
  try {
    const { customer, rentals } = await fetchJSON(`/api/customers/${id}`);
    currentCustomer = customer;
    panel.style.display = 'block';
    document.getElementById('customerEditForm').style.display = 'none';
    document.getElementById('customerDeleteError').innerHTML = '';
    document.getElementById('detailName').textContent = customer.full_name;
    document.getElementById('detailContact').textContent = [customer.phone, customer.address].filter(Boolean).join(' · ') || 'No contact details';

    const historyBody = document.getElementById('historyBody');
    const historyEmpty = document.getElementById('historyEmpty');
    historyEmpty.style.display = rentals.length === 0 ? 'block' : 'none';
    historyBody.innerHTML = rentals
      .map(
        (r) => `<tr class="clickable" onclick="location.href='/rental-detail?id=${r.id}'">
          <td>${escapeHtml(r.unit_label)}</td>
          <td>${formatDate(r.start_date)}</td>
          <td>${formatDate(r.due_date)}</td>
          <td>${r.returned_at ? formatDate(r.returned_at) : '-'}</td>
        </tr>`
      )
      .join('');
    panel.scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    panel.style.display = 'block';
    panel.innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message)}</div>`;
  }
};

document.addEventListener('DOMContentLoaded', () => {
  loadCustomers();
  document.getElementById('searchInput').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    const value = e.target.value;
    searchTimer = setTimeout(() => loadCustomers(value), 250);
  });

  document.getElementById('editCustomerBtn').addEventListener('click', () => {
    if (!currentCustomer) return;
    document.getElementById('editFullName').value = currentCustomer.full_name || '';
    document.getElementById('editPhone').value = currentCustomer.phone || '';
    document.getElementById('editAddress').value = currentCustomer.address || '';
    document.getElementById('editEmail').value = currentCustomer.email || '';
    document.getElementById('customerEditError').innerHTML = '';
    document.getElementById('customerEditForm').style.display = 'block';
  });

  document.getElementById('cancelCustomerEditBtn').addEventListener('click', () => {
    document.getElementById('customerEditForm').style.display = 'none';
  });

  document.getElementById('saveCustomerBtn').addEventListener('click', async () => {
    const errorEl = document.getElementById('customerEditError');
    errorEl.innerHTML = '';
    const full_name = document.getElementById('editFullName').value.trim();
    if (!full_name) {
      errorEl.innerHTML = `<div class="alert alert-danger">Full name is required.</div>`;
      return;
    }
    try {
      await fetchJSON(`/api/customers/${currentCustomer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name,
          phone: document.getElementById('editPhone').value,
          address: document.getElementById('editAddress').value,
          email: document.getElementById('editEmail').value,
        }),
      });
      document.getElementById('customerEditForm').style.display = 'none';
      loadCustomers(document.getElementById('searchInput').value);
      showCustomer(currentCustomer.id);
    } catch (err) {
      errorEl.innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message)}</div>`;
    }
  });

  document.getElementById('deleteCustomerBtn').addEventListener('click', async () => {
    if (!currentCustomer) return;
    if (!confirm(`Delete customer "${currentCustomer.full_name}"? This cannot be undone.`)) return;
    const errorEl = document.getElementById('customerDeleteError');
    errorEl.innerHTML = '';
    try {
      await fetchJSON(`/api/customers/${currentCustomer.id}`, { method: 'DELETE' });
      document.getElementById('detailPanel').style.display = 'none';
      currentCustomer = null;
      loadCustomers(document.getElementById('searchInput').value);
    } catch (err) {
      errorEl.innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message)}</div>`;
    }
  });
});
