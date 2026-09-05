// Shared helpers used across pages.

async function fetchJSON(url, options) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error(data.message || `Request failed (${res.status})`);
  }
  return data;
}

function formatDate(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('en-AU', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

const STATUS_LABELS = {
  available: 'Available',
  rented: 'Rented Out',
  overdue: 'Overdue',
  in_repair: 'In Repair',
  retired: 'Retired',
};

function statusBadge(status) {
  const label = STATUS_LABELS[status] || status;
  return `<span class="badge badge-${status}">${label}</span>`;
}

function highlightNav() {
  const path = window.location.pathname;
  document.querySelectorAll('.topbar nav a[href]').forEach((a) => {
    if (a.getAttribute('href') === path) a.classList.add('active');
  });
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

document.addEventListener('DOMContentLoaded', highlightNav);
