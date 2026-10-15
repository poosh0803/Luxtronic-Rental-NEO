const FLEET_SEGMENTS = [
  { key: 'available', label: 'Available', color: '#388e3c' },
  { key: 'rented', label: 'Rented out', color: '#1976d2' },
  { key: 'overdue', label: 'Overdue', color: '#d32f2f' },
  { key: 'in_repair', label: 'In repair', color: '#ffa000' },
  { key: 'retired', label: 'Retired', color: '#607d8b' },
];

const SYNC_SEGMENTS = [
  { key: 'synced', label: 'Synced', color: '#388e3c' },
  { key: 'mismatch', label: 'Out of sync', color: '#ffa000' },
  { key: 'missing', label: 'Not in Odoo', color: '#d32f2f' },
  { key: 'unavailable', label: 'Odoo unreachable', color: '#8e24aa' },
  { key: 'skipped', label: 'Not tracked', color: '#607d8b' },
];

function donutChart(segments, counts, centerLabel) {
  const total = segments.reduce((sum, s) => sum + (counts[s.key] || 0), 0);
  const r = 44;
  const circumference = 2 * Math.PI * r;
  let offset = 0;

  const arcs = total
    ? segments
        .filter((s) => counts[s.key] > 0)
        .map((s) => {
          const len = (counts[s.key] / total) * circumference;
          const arc = `<circle cx="60" cy="60" r="${r}" fill="none" stroke="${s.color}" stroke-width="18"
            stroke-dasharray="${len} ${circumference - len}" stroke-dashoffset="${-offset}" transform="rotate(-90 60 60)"><title>${escapeHtml(s.label)}: ${counts[s.key]}</title></circle>`;
          offset += len;
          return arc;
        })
        .join('')
    : `<circle cx="60" cy="60" r="${r}" fill="none" stroke="var(--border)" stroke-width="18"/>`;

  const legend = segments
    .map(
      (s) => `<div style="display:flex; align-items:center; gap:8px; font-size:14px; margin:6px 0;">
        <span style="width:12px; height:12px; border-radius:3px; background:${s.color}; flex-shrink:0;"></span>
        <span style="flex:1;">${escapeHtml(s.label)}</span>
        <strong>${counts[s.key] || 0}</strong>
      </div>`
    )
    .join('');

  return `<div style="display:flex; align-items:center; gap:24px; flex-wrap:wrap;">
    <svg viewBox="0 0 120 120" width="150" height="150" role="img" aria-label="${escapeHtml(centerLabel)} chart">
      ${arcs}
      <text x="60" y="58" text-anchor="middle" font-size="22" font-weight="bold" fill="currentColor">${total}</text>
      <text x="60" y="74" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.7">${escapeHtml(centerLabel)}</text>
    </svg>
    <div style="flex:1; min-width:150px;">${legend}</div>
  </div>`;
}

// series: [{ key, label, color }] stacked bottom to top; items: [{ label, sub?, <key>: n }]
function barChart(items, series) {
  const W = 560;
  const H = 210;
  const pad = { top: 16, right: 8, bottom: 40, left: 28 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const totals = items.map((it) => series.reduce((sum, s) => sum + (it[s.key] || 0), 0));
  const max = Math.max(1, ...totals);
  const step = max <= 5 ? 1 : Math.ceil(max / 5);
  const top = Math.ceil(max / step) * step;
  const band = innerW / items.length;
  const barW = Math.min(28, band * 0.62);
  const y = (v) => pad.top + innerH - (v / top) * innerH;

  let grid = '';
  for (let v = 0; v <= top; v += step) {
    grid += `<line x1="${pad.left}" x2="${W - pad.right}" y1="${y(v)}" y2="${y(v)}" stroke="var(--border)" stroke-width="1"/>
      <text x="${pad.left - 6}" y="${y(v) + 3}" text-anchor="end" font-size="10" fill="currentColor" opacity="0.7">${v}</text>`;
  }

  const bars = items
    .map((it, i) => {
      const x = pad.left + i * band + (band - barW) / 2;
      let acc = 0;
      const rects = series
        .map((s) => {
          const n = it[s.key] || 0;
          if (!n) return '';
          const rect = `<rect x="${x}" y="${y(acc + n)}" width="${barW}" height="${(n / top) * innerH}" fill="${s.color}" rx="2"><title>${escapeHtml(it.label)} ${it.sub ? escapeHtml(it.sub) : ''} - ${escapeHtml(s.label)}: ${n}</title></rect>`;
          acc += n;
          return rect;
        })
        .join('');
      const cx = x + barW / 2;
      const total = totals[i];
      return `${rects}
        ${total ? `<text x="${cx}" y="${y(total) - 4}" text-anchor="middle" font-size="10" font-weight="600" fill="currentColor">${total}</text>` : ''}
        <text x="${cx}" y="${H - 22}" text-anchor="middle" font-size="10" fill="currentColor">${escapeHtml(it.label)}</text>
        ${it.sub ? `<text x="${cx}" y="${H - 9}" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.6">${escapeHtml(it.sub)}</text>` : ''}`;
    })
    .join('');

  const legend =
    series.length > 1 || series[0].legend
      ? `<div style="display:flex; gap:16px; flex-wrap:wrap; font-size:13px; margin-top:4px;">${series
          .map((s) => `<span style="display:flex; align-items:center; gap:6px;"><span style="width:12px; height:12px; border-radius:3px; background:${s.color};"></span>${escapeHtml(s.label)}</span>`)
          .join('')}</div>`
      : '';

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img">${grid}${bars}</svg>${legend}`;
}

// points: [{ label, value }] drawn as a line over a soft area. Only the end
// value and a handful of x labels are printed so it stays readable; hover any
// point for its exact value.
function lineChart(points, color, format = (v) => String(v), yMax) {
  if (points.length < 2) return '<div class="empty">Not enough data yet.</div>';
  const W = 560;
  const H = 210;
  const pad = { top: 18, right: 14, bottom: 28, left: 46 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const max = yMax || Math.max(1, ...points.map((p) => p.value));
  const rawStep = max / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((v) => v >= rawStep);
  const top = Math.ceil(max / step) * step;
  const x = (i) => pad.left + (i / (points.length - 1)) * innerW;
  const y = (v) => pad.top + innerH - (v / top) * innerH;

  let grid = '';
  for (let v = 0; v <= top + 1e-9; v += step) {
    grid += `<line x1="${pad.left}" x2="${W - pad.right}" y1="${y(v)}" y2="${y(v)}" stroke="var(--border)"/>
      <text x="${pad.left - 6}" y="${y(v) + 3}" text-anchor="end" font-size="10" fill="currentColor" opacity="0.7">${escapeHtml(format(v))}</text>`;
  }

  const line = points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ');
  const area = `${pad.left},${y(0)} ${line} ${x(points.length - 1)},${y(0)}`;

  const labelCount = Math.min(6, points.length);
  let xLabels = '';
  for (let k = 0; k < labelCount; k++) {
    const i = Math.round((k / (labelCount - 1)) * (points.length - 1));
    xLabels += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.7">${escapeHtml(points[i].label)}</text>`;
  }

  const dots = points
    .map((p, i) => `<circle cx="${x(i)}" cy="${y(p.value)}" r="${i === points.length - 1 ? 4 : 5}" fill="${color}" fill-opacity="${i === points.length - 1 ? 1 : 0}"><title>${escapeHtml(p.label)}: ${escapeHtml(format(p.value))}</title></circle>`)
    .join('');

  const last = points[points.length - 1];
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img">${grid}
    <polygon points="${area}" fill="${color}" fill-opacity="0.14"/>
    <polyline points="${line}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${dots}
    <text x="${x(points.length - 1)}" y="${y(last.value) - 9}" text-anchor="end" font-size="11" font-weight="700" fill="currentColor">${escapeHtml(format(last.value))}</text>
    ${xLabels}</svg>`;
}

const money = (v) => '$' + Math.round(v).toLocaleString('en-AU');

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// "YYYY-MM-DD" -> { label: weekday, sub: day/month } without any timezone shift.
function dayLabel(key) {
  const [y, m, d] = key.split('-').map(Number);
  return { label: WEEKDAYS[new Date(y, m - 1, d).getDay()], sub: `${d}/${m}` };
}

// "YYYY-MM-DD" -> "5 Oct" without any timezone shift.
function shortDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

async function loadFleetAndActivity() {
  const { fleet, due, sync } = await fetchJSON('/api/analytics/status');

  document.getElementById('fleetChart').innerHTML = donutChart(FLEET_SEGMENTS, fleet, 'units');

  const dueItems = [
    { label: 'Late', sub: 'overdue', overdue: due.overdue },
    ...due.days.map((d, i) => ({ ...dayLabel(d.date), label: i === 0 ? 'Today' : dayLabel(d.date).label, upcoming: d.count })),
  ];
  document.getElementById('dueChart').innerHTML =
    barChart(dueItems, [
      { key: 'overdue', label: 'Overdue', color: '#d32f2f' },
      { key: 'upcoming', label: 'Due', color: '#dda84b' },
    ]) +
    `<div style="font-size:13px; color:var(--muted); margin-top:6px;">${due.later} more due later - ${due.open} open in total.</div>`;

  document.getElementById('syncActivityChart').innerHTML = barChart(
    sync.map((d) => ({ ...dayLabel(d.date), ok: d.ok, failed: d.failed })),
    [
      { key: 'ok', label: 'Sent OK', color: '#388e3c' },
      { key: 'failed', label: 'Failed', color: '#d32f2f' },
    ]
  );
}

async function loadGrowth() {
  const { totals, points, weekly } = await fetchJSON('/api/analytics/growth');

  document.getElementById('growthStats').innerHTML = [
    ['Estimated revenue', money(totals.revenue), 'green', 'All rentals, from recorded fees'],
    ['Rentals', totals.rentals, 'orange', 'Started, all time'],
    ['Average per rental', money(totals.avgPerRental), 'blue', 'Estimated revenue / rentals'],
    ['Best week', totals.bestWeek ? money(totals.bestWeek.revenue) : '-', 'orange', totals.bestWeek ? `Week from ${shortDate(totals.bestWeek.date)}` : 'No revenue yet'],
  ]
    .map(
      ([label, value, color, sub]) => `<div class="stat-card"><div class="stat-label">${escapeHtml(label)}</div>
        <div class="stat-number ${color}">${value}</div><div class="stat-sub">${escapeHtml(sub)}</div></div>`
    )
    .join('');

  const series = (field) => points.map((p) => ({ label: shortDate(p.date), value: p[field] }));
  document.getElementById('revenueChart').innerHTML = lineChart(series('revenue'), '#388e3c', money);
  document.getElementById('rentalsChart').innerHTML = lineChart(series('rentals'), '#dda84b');
  document.getElementById('utilizationChart').innerHTML = lineChart(
    points.map((p) => ({ label: shortDate(p.date), value: Math.round(p.utilization * 100) })),
    '#1976d2',
    (v) => `${v}%`,
    100
  );
  document.getElementById('weeklyChart').innerHTML = barChart(
    weekly.map((w) => ({ label: shortDate(w.date), sub: '', desktop: w.desktop, laptop: w.laptop })),
    [
      { key: 'desktop', label: 'Desktop', color: '#dda84b' },
      { key: 'laptop', label: 'Laptop', color: '#1976d2' },
    ]
  );
}

// The sync check talks to Odoo, so it is slower - fill it in separately so
// the rest of the page appears straight away.
async function loadSyncState() {
  const el = document.getElementById('syncStateChart');
  try {
    const { counts } = await fetchJSON('/api/odoo/status');
    el.innerHTML = donutChart(SYNC_SEGMENTS, counts, 'open rentals');
  } catch (err) {
    el.innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message)}</div>`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadFleetAndActivity().catch((err) => {
    document.getElementById('loadError').innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message)}</div>`;
  });
  loadGrowth().catch((err) => {
    document.getElementById('growthStats').innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message)}</div>`;
  });
  loadSyncState();
});
