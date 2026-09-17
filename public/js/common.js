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
  // The guided wizard is a second entry point for the same "New Rental" nav
  // item (whose href always points at the plain form - see
  // initNewRentalChooser), so treat it as the same destination for
  // highlighting purposes.
  const effectivePath = path === '/new-rental-guided' ? '/new-rental' : path;
  document.querySelectorAll('.nav-bar a.nav-item[href]').forEach((a) => {
    if (a.getAttribute('href') === effectivePath) a.classList.add('active');
  });
}

// Clicking "New Rental" in the nav asks whether to use the plain form or the
// guided walkthrough, instead of jumping straight to the form. The link's
// href stays "/new-rental" so opening it in a new tab (or with JS disabled)
// still lands somewhere useful.
function initNewRentalChooser() {
  const links = document.querySelectorAll('a.nav-item-accent[href="/new-rental"]');
  if (links.length === 0) return;

  links.forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      showNewRentalChooser();
    });
  });
}

function showNewRentalChooser() {
  let overlay = document.getElementById('newRentalChooserOverlay');
  if (overlay) {
    overlay.style.display = 'flex';
    return;
  }

  overlay = document.createElement('div');
  overlay.id = 'newRentalChooserOverlay';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box">
      <h2>How do you want to check this out?</h2>
      <p class="modal-sub">Both end up creating the same rental - pick whichever's easier right now.</p>
      <div class="modal-choice-grid">
        <button type="button" class="modal-choice" data-href="/new-rental">
          <i class="fas fa-file-lines"></i>
          <strong>Fill Out the Form</strong>
          <span class="modal-choice-desc">One page, everything at once.</span>
        </button>
        <button type="button" class="modal-choice" data-href="/new-rental-guided">
          <i class="fas fa-route"></i>
          <strong>Guided Walkthrough</strong>
          <span class="modal-choice-desc">Answer one quick question at a time.</span>
        </button>
      </div>
      <div class="modal-close"><button type="button" class="btn" id="newRentalChooserCancel">Cancel</button></div>
    </div>`;
  document.body.appendChild(overlay);

  overlay.addEventListener('click', (e) => {
    const choice = e.target.closest('.modal-choice');
    if (choice) {
      window.location.href = choice.dataset.href;
      return;
    }
    if (e.target === overlay || e.target.id === 'newRentalChooserCancel') {
      overlay.style.display = 'none';
    }
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
  initNewRentalChooser();
});
