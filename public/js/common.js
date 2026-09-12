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

const CURRENCY_SYMBOLS = { AUD: '$', RMB: '¥' };

// e.g. formatMoney(100, 'AUD') => "$100.00 AUD" - includes the currency code
// alongside the symbol since $ alone is ambiguous once bonds can be in more
// than one currency.
function formatMoney(amount, currency) {
  const symbol = CURRENCY_SYMBOLS[currency] || '';
  return `${symbol}${Number(amount).toFixed(2)} ${currency || 'AUD'}`;
}

function highlightNav() {
  const path = window.location.pathname;
  document.querySelectorAll('.nav-bar a.nav-item[href]').forEach((a) => {
    if (a.getAttribute('href') === path) a.classList.add('active');
  });
}

function initDarkMode() {
  const toggle = document.getElementById('darkModeToggle');
  const icon = document.getElementById('themeIcon');
  const applyTheme = (dark) => {
    document.body.classList.toggle('dark-mode', dark);
    if (icon) {
      icon.classList.toggle('fa-moon', !dark);
      icon.classList.toggle('fa-sun', dark);
    }
  };
  applyTheme(localStorage.getItem('theme') === 'dark');
  if (toggle) {
    toggle.addEventListener('click', () => {
      const dark = !document.body.classList.contains('dark-mode');
      localStorage.setItem('theme', dark ? 'dark' : 'light');
      applyTheme(dark);
    });
  }
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

document.addEventListener('DOMContentLoaded', () => {
  highlightNav();
  initDarkMode();
});
