function money(n) {
  return '$' + Number(n || 0).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function days(n) {
  if (n === null || n === undefined) return '—';
  return `${n.toFixed(1)} day${Math.abs(n - 1) < 0.05 ? '' : 's'}`;
}

function statCard(label, value, colorClass, sub) {
  return `<div class="stat-card">
    <div class="stat-label">${escapeHtml(label)}</div>
    <div class="stat-number ${colorClass}">${value}</div>
    ${sub ? `<div class="stat-sub">${escapeHtml(sub)}</div>` : ''}
  </div>`;
}

function barRow(label, value, max, color, valueText) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return `<div class="bar-row">
    <div class="bar-label">${escapeHtml(label)}</div>
    <div class="bar-track"><div class="bar-fill" style="width:${pct}%; background:${color};"></div></div>
    <div class="bar-value">${valueText !== undefined ? valueText : value}</div>
  </div>`;
}

const STATUS_COLORS = {
  available: '#388e3c',
  rented: '#1976d2',
  overdue: '#d32f2f',
  in_repair: '#ffa000',
  retired: '#607d8b',
};

const RANGE_LABELS = {
  all: 'Stats across every rental ever recorded.',
  this_month: "Stats for rentals started this month.",
  last_month: "Stats for rentals started last month.",
};

let currentRange = 'all';

async function loadAnalysis() {
  try {
    const data = await fetchJSON(`/api/analytics/rentals?range=${currentRange}`);
    const { overview, byType, statusCounts, topUnits, topCustomers, idleUnits, monthly } = data;

    document.getElementById('rangeSubtitle').textContent = RANGE_LABELS[currentRange];

    document.getElementById('statsGrid').innerHTML = [
      statCard('Total Rentals', overview.totalRentals, 'orange'),
      statCard('Currently Rented Out', overview.activeCount, 'blue', 'Not scoped to the range above'),
      statCard('Currently Overdue', overview.overdueCount, overview.overdueCount > 0 ? 'red' : 'green', 'Not scoped to the range above'),
      statCard('Fleet Utilization', Math.round(overview.fleetUtilization * 100) + '%', 'orange', `${overview.totalUnits} unit${overview.totalUnits === 1 ? '' : 's'} total`),
      statCard('Est. Total Revenue', money(overview.totalRevenue), 'green', 'From recorded fees, not a payment ledger'),
      statCard('Bonds Currently Held', money(overview.bondsHeld), 'blue', 'Not scoped to the range above'),
      statCard('Avg. Rental Duration', days(overview.avgDurationDays), 'orange', 'Completed rentals only'),
      statCard('Avg. Days Late', days(overview.avgDaysLate), overview.avgDaysLate ? 'red' : 'green', 'Among late returns only'),
    ].join('');

    const statusOrder = ['available', 'rented', 'overdue', 'in_repair', 'retired'];
    const statusLabels = { available: 'Available', rented: 'Rented Out', overdue: 'Overdue', in_repair: 'In Repair', retired: 'Retired' };
    const maxStatus = Math.max(1, ...statusOrder.map((s) => statusCounts[s] || 0));
    document.getElementById('statusBars').innerHTML = statusOrder
      .map((s) => barRow(statusLabels[s], statusCounts[s] || 0, maxStatus, STATUS_COLORS[s]))
      .join('');

    const maxType = Math.max(1, byType.desktop || 0, byType.laptop || 0);
    document.getElementById('typeBars').innerHTML =
      barRow('Desktop', byType.desktop || 0, maxType, '#dda84b') + barRow('Laptop', byType.laptop || 0, maxType, '#1976d2');

    const returnedTotal = overview.returnedOnTimeCount + overview.returnedLateCount;
    if (returnedTotal === 0) {
      document.getElementById('returnEmpty').style.display = 'block';
      document.getElementById('returnBars').innerHTML = '';
    } else {
      document.getElementById('returnEmpty').style.display = 'none';
      const maxReturn = Math.max(1, overview.returnedOnTimeCount, overview.returnedLateCount);
      document.getElementById('returnBars').innerHTML =
        barRow('On Time', overview.returnedOnTimeCount, maxReturn, '#388e3c') +
        barRow('Late', overview.returnedLateCount, maxReturn, '#d32f2f');
    }

    const maxMonth = Math.max(1, ...monthly.map((m) => m.count));
    document.getElementById('monthlyBars').innerHTML = monthly.map((m) => barRow(m.month, m.count, maxMonth, '#dda84b')).join('');

    const maxMonthRevenue = Math.max(1, ...monthly.map((m) => m.revenue));
    document.getElementById('monthlyRevenueBars').innerHTML = monthly
      .map((m) => barRow(m.month, m.revenue, maxMonthRevenue, '#388e3c', money(m.revenue)))
      .join('');

    const idleBody = document.getElementById('idleUnitsBody');
    if (idleUnits.length === 0) {
      document.getElementById('idleUnitsEmpty').style.display = 'block';
    } else {
      document.getElementById('idleUnitsEmpty').style.display = 'none';
      idleBody.innerHTML = idleUnits
        .map(
          (u) => `<tr>
            <td>${escapeHtml(u.label)}</td>
            <td>${u.type === 'laptop' ? 'Laptop' : 'Desktop'}</td>
            <td>${statusBadge(u.status)}</td>
          </tr>`
        )
        .join('');
    }

    const topUnitsBody = document.getElementById('topUnitsBody');
    if (topUnits.length === 0) {
      document.getElementById('topUnitsEmpty').style.display = 'block';
      topUnitsBody.innerHTML = '';
    } else {
      document.getElementById('topUnitsEmpty').style.display = 'none';
      topUnitsBody.innerHTML = topUnits
        .map(
          (u) => `<tr>
            <td>${escapeHtml(u.label)}</td>
            <td>${u.type === 'laptop' ? 'Laptop' : 'Desktop'}</td>
            <td>${u.count}</td>
            <td>${money(u.revenue)}</td>
          </tr>`
        )
        .join('');
    }

    const topCustomersBody = document.getElementById('topCustomersBody');
    if (topCustomers.length === 0) {
      document.getElementById('topCustomersEmpty').style.display = 'block';
      topCustomersBody.innerHTML = '';
    } else {
      document.getElementById('topCustomersEmpty').style.display = 'none';
      topCustomersBody.innerHTML = topCustomers
        .map(
          (c) => `<tr>
            <td>${escapeHtml(c.name)}</td>
            <td>${c.count}</td>
            <td>${c.lateCount}</td>
          </tr>`
        )
        .join('');
    }
  } catch (err) {
    document.getElementById('loadError').innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message)}</div>`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadAnalysis();

  document.getElementById('rangeFilters').addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    document.querySelectorAll('#rangeFilters .tab-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentRange = btn.dataset.range;
    loadAnalysis();
  });
});
