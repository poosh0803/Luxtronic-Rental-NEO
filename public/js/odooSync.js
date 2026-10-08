function formatWhen(value) {
  const d = new Date(value);
  return `${d.toLocaleDateString('en-AU')} ${d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}`;
}

function statCard(label, value, colorClass, sub) {
  return `<div class="stat-card">
    <div class="stat-label">${escapeHtml(label)}</div>
    <div class="stat-number ${colorClass}">${value}</div>
    ${sub ? `<div class="stat-sub">${escapeHtml(sub)}</div>` : ''}
  </div>`;
}

async function loadStatus() {
  const btn = document.getElementById('checkAllBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-rotate fa-spin"></i> Checking...';
  document.getElementById('loadError').innerHTML = '';
  try {
    const { counts, stats, rentals, log } = await fetchJSON('/api/odoo/status');

    const attention = counts.mismatch + counts.missing + counts.unavailable;
    document.getElementById('statsGrid').innerHTML = [
      statCard('Synced', counts.synced, 'green', `of ${rentals.length} open rental${rentals.length === 1 ? '' : 's'}`),
      statCard('Needs attention', attention, attention ? 'red' : 'green', attention ? 'Out of sync, missing or unreachable' : 'Nothing to fix'),
      statCard('Not tracked', counts.skipped, 'grey', 'No Odoo barcode or phone number'),
      statCard('Sent OK (7 days)', stats.ok7d, 'blue', stats.lastOkAt ? `Last: ${formatWhen(stats.lastOkAt)}` : 'Nothing sent yet'),
      statCard('Failed (7 days)', stats.failed7d, stats.failed7d ? 'red' : 'green', stats.lastFailedAt ? `Last: ${formatWhen(stats.lastFailedAt)}` : 'No failures'),
    ].join('');

    document.getElementById('rentalsBody').innerHTML = rentals.length
      ? rentals
          .map((r) => {
            const retryable = ['missing', 'mismatch'].includes(r.check.state);
            return `<tr>
              <td><a href="/rental-detail?id=${r.id}">${escapeHtml(r.unit_label)}</a></td>
              <td>${escapeHtml(r.customer_name)}</td>
              <td>${formatDate(r.due_date)}</td>
              <td>${syncBadge(r.check.state)}</td>
              <td style="font-size:13px;">${syncDetails(r.check)}</td>
              <td>${retryable ? `<button class="btn btn-sm" data-retry="${r.id}">Fix now</button>` : ''}</td>
            </tr>`;
          })
          .join('')
      : '<tr><td colspan="6"><div class="empty">No open rentals.</div></td></tr>';

    document.getElementById('logEmpty').style.display = log.length ? 'none' : 'block';
    document.getElementById('logBody').innerHTML = log
      .map(
        (l) => `<tr>
          <td>${formatWhen(l.created_at)}</td>
          <td>${l.unit_label ? `<a href="/rental-detail?id=${l.rental_id}">${escapeHtml(l.unit_label)}</a>` : l.rental_id ? `#${l.rental_id} (deleted)` : '-'}</td>
          <td>${escapeHtml(l.action)}</td>
          <td>${l.ok ? '<span class="badge badge-available">OK</span>' : '<span class="badge badge-overdue">Failed</span>'} <span style="font-size:13px; color:var(--muted);">${escapeHtml(l.message || '')}</span></td>
        </tr>`
      )
      .join('');
  } catch (err) {
    document.getElementById('loadError').innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message)}</div>`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-rotate"></i> Check now';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadStatus();
  document.getElementById('checkAllBtn').addEventListener('click', loadStatus);

  document.getElementById('rentalsBody').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-retry]');
    if (!btn) return;
    const unit = btn.closest('tr').querySelector('a').textContent;
    if (!confirm(`Update Odoo to match Rental-Neo for "${unit}"?`)) return;
    btn.disabled = true;
    btn.textContent = 'Fixing...';
    const errorEl = document.getElementById('actionError');
    errorEl.innerHTML = '';
    try {
      const result = await fetchJSON(`/api/odoo/rentals/${btn.dataset.retry}/retry`, { method: 'POST' });
      if (!result.ok) errorEl.innerHTML = `<div class="alert alert-danger">${escapeHtml(unit)}: ${escapeHtml(result.error || 'Sync failed')}</div>`;
    } catch (err) {
      errorEl.innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message)}</div>`;
    }
    loadStatus();
  });
});
