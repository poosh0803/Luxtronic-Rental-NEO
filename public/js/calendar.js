const DAY_MS = 86400000;
const WEEKDAYS_MON = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MAX_CHIPS = 2;

let rentals = [];
let month = firstOfMonth(new Date());
let view = 'calendar';
let selectedDay = null;
let activityOnly = false;

function dayOf(value) {
  // DATE columns arrive as local-midnight Dates serialized to ISO; local
  // getters give back the calendar day (same approach as formatDate()).
  const d = new Date(value);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function firstOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const sameDay = (a, b) => a.getTime() === b.getTime();
const today = () => dayOf(new Date());
const fmt = (d) => d.toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' });

// A rental occupies its machine from the start date until it is returned, or
// until its due date - and for one that is past due and still out, until today.
function normalize(r) {
  const start = dayOf(r.start_date);
  const due = dayOf(r.due_date);
  const t = today();
  const returned = r.returned_at ? dayOf(r.returned_at) : null;
  const overdue = !returned && due < t;
  let end = returned || (overdue ? t : due);
  if (end < start) end = start;
  return {
    id: r.id,
    unitId: r.unit_id,
    label: (r.unit_label || '').trim(),
    serial: (r.unit_serial || '').trim(),
    type: r.unit_type,
    customer: r.customer_name,
    start,
    due,
    end,
    returned: Boolean(returned),
    overdue,
    // The day the machine comes (or came) back: the real return day, else the due date.
    returnDay: returned || due,
    returnKind: returned ? 'returned' : overdue ? 'overdue' : 'due',
  };
}

const colorClass = (r) => (r.overdue ? 'overdue' : r.type === 'laptop' ? 'laptop' : 'desktop');

function outOn(day) {
  return rentals.filter((r) => r.start <= day && day <= r.end).sort((a, b) => a.label.localeCompare(b.label));
}

// "Activity only" mode: just the days something happens - a rental starting,
// and a rental coming back (actual return day, or due-back day while still out).
const EVENT_LABEL = { start: 'Starts', returned: 'Returned', due: 'Due back', overdue: 'Overdue, due back' };
const EVENT_GLYPH = { start: '\u25B6', returned: '\u25C0', due: '\u25C0', overdue: '\u25C0' };

function eventsOn(day) {
  const out = [];
  for (const r of rentals) {
    if (sameDay(r.start, day)) out.push({ r, kind: 'start' });
    if (sameDay(r.returnDay, day)) out.push({ r, kind: r.returnKind });
  }
  return out.sort((a, b) => a.r.label.localeCompare(b.r.label) || a.kind.localeCompare(b.kind));
}

function monthDays() {
  const days = [];
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  for (let i = 1; i <= last; i++) days.push(new Date(month.getFullYear(), month.getMonth(), i));
  return days;
}

// Several units share a model name, so tell them apart by the end of the serial.
const serialTail = (r) => (r.serial ? r.serial.slice(-4) : '');
const fullName = (r) => (r.serial ? `${r.label} (${r.serial})` : r.label);

function tip(r) {
  return `${fullName(r)} - ${r.customer}\n${fmt(r.start)} to ${fmt(r.due)}${r.returned ? ' (returned)' : r.overdue ? ' (overdue)' : ''}`;
}

function renderSummary() {
  const days = monthDays();
  if (activityOnly) {
    let starts = 0;
    let returns = 0;
    for (const d of days) {
      for (const e of eventsOn(d)) {
        if (e.kind === 'start') starts += 1;
        else returns += 1;
      }
    }
    document.getElementById('summary').textContent =
      starts + returns
        ? `${starts} start${starts === 1 ? '' : 's'}, ${returns} return${returns === 1 ? '' : 's'} / due back this month`
        : 'No starts or returns this month';
    return;
  }
  const inMonth = rentals.filter((r) => r.start <= days[days.length - 1] && r.end >= days[0]);
  const units = new Set(inMonth.map((r) => r.unitId));
  let peak = 0;
  let peakDay = null;
  for (const d of days) {
    const n = outOn(d).length;
    if (n > peak) {
      peak = n;
      peakDay = d;
    }
  }
  document.getElementById('summary').textContent = inMonth.length
    ? `${units.size} machine${units.size === 1 ? '' : 's'} out this month - busiest day ${peak} out (${peakDay.getDate()} ${peakDay.toLocaleDateString('en-AU', { month: 'short' })})`
    : 'Nothing rented this month';
}

// Small count pills per kind of machine out that day (desktop / laptop / overdue).
function pills(list) {
  const counts = { desktop: 0, laptop: 0, overdue: 0 };
  for (const r of list) counts[colorClass(r)] += 1;
  return `<span class="cal-pills">${Object.entries(counts)
    .filter(([, n]) => n)
    .map(([kind, n]) => `<span class="cal-pill ${kind}" title="${n} ${kind}">${n}</span>`)
    .join('')}</span>`;
}

function eventPills(list) {
  const counts = {};
  for (const e of list) counts[e.kind] = (counts[e.kind] || 0) + 1;
  return `<span class="cal-pills">${['start', 'returned', 'due', 'overdue']
    .filter((k) => counts[k])
    .map((k) => `<span class="cal-pill ev-${k}" title="${counts[k]} ${EVENT_LABEL[k].toLowerCase()}">${counts[k]}</span>`)
    .join('')}</span>`;
}

function renderCalendar() {
  const t = today();
  const lead = (month.getDay() + 6) % 7; // Monday first
  const gridStart = addDays(month, -lead);
  const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const weeks = Math.ceil((lead + lastDay.getDate()) / 7);

  let html = `<div class="cal-grid">${WEEKDAYS_MON.map((d) => `<div class="cal-head">${d}</div>`).join('')}`;
  for (let i = 0; i < weeks * 7; i++) {
    const day = addDays(gridStart, i);
    const inside = day.getMonth() === month.getMonth();
    const list = inside ? (activityOnly ? eventsOn(day) : outOn(day)) : [];
    const chips = list
      .slice(0, MAX_CHIPS)
      .map((item) => {
        if (!activityOnly) {
          return `<a class="cal-chip ${colorClass(item)}" href="/rental-detail?id=${item.id}" title="${escapeHtml(tip(item))}" onclick="event.stopPropagation()">${escapeHtml(item.label)}</a>`;
        }
        const { r, kind } = item;
        return `<a class="cal-chip ev-${kind}" href="/rental-detail?id=${r.id}" title="${escapeHtml(EVENT_LABEL[kind] + ': ' + tip(r))}" onclick="event.stopPropagation()">${EVENT_GLYPH[kind]} ${escapeHtml(r.label)}</a>`;
      })
      .join('');
    const more = list.length > MAX_CHIPS ? `<div class="cal-more">+${list.length - MAX_CHIPS} more</div>` : '';
    const cls = ['cal-cell', inside ? '' : 'outside', sameDay(day, t) ? 'today' : '', selectedDay && sameDay(day, selectedDay) ? 'selected' : ''].join(' ');
    html += `<div class="${cls}" ${inside ? `data-day="${day.getTime()}"` : ''}>
      <div class="cal-daynum"><span>${day.getDate()}</span>${activityOnly ? eventPills(list) : pills(list)}</div>
      ${chips}${more}
    </div>`;
  }
  document.getElementById('calendarView').innerHTML = html + '</div>';
}

function renderTimeline() {
  const days = monthDays();
  const n = days.length;
  const t = today();
  const first = days[0];
  const last = days[n - 1];

  const inMonth = rentals.filter((r) =>
    activityOnly ? (r.start >= first && r.start <= last) || (r.returnDay >= first && r.returnDay <= last) : r.start <= last && r.end >= first
  );
  const byUnit = new Map();
  for (const r of inMonth) {
    if (!byUnit.has(r.unitId)) byUnit.set(r.unitId, { label: r.label, full: fullName(r), tail: serialTail(r), rentals: [] });
    byUnit.get(r.unitId).rentals.push(r);
  }
  const units = [...byUnit.values()].sort((a, b) => a.label.localeCompare(b.label));

  if (units.length === 0) {
    document.getElementById('timelineView').innerHTML = `<div class="empty">${activityOnly ? 'No starts or returns this month.' : 'No machines rented out this month.'}</div>`;
    return;
  }

  const cols = `200px repeat(${n}, minmax(24px, 1fr))`;
  const todayIdx = days.findIndex((d) => sameDay(d, t));
  const head =
    `<div class="tl-row tl-header" style="grid-template-columns:${cols}"><div class="tl-label">Machine</div>` +
    days
      .map((d) => `<div class="tl-day ${d.getDay() === 0 || d.getDay() === 6 ? 'weekend' : ''} ${sameDay(d, t) ? 'today' : ''}">${d.getDate()}</div>`)
      .join('') +
    '</div>';

  const rows = units
    .map((u) => {
      const marks = u.rentals
        .flatMap((r) => [
          { r, kind: 'start', day: r.start },
          { r, kind: r.returnKind, day: r.returnDay },
        ])
        .filter((m) => m.day >= first && m.day <= last)
        .map((m) => {
          const col = Math.round((m.day - first) / DAY_MS) + 2;
          return `<a class="tl-mark ev-${m.kind}" style="grid-column:${col}" href="/rental-detail?id=${m.r.id}" title="${escapeHtml(EVENT_LABEL[m.kind] + ' ' + fmt(m.day) + ' - ' + fullName(m.r) + ' - ' + m.r.customer)}">${EVENT_GLYPH[m.kind]}</a>`;
        })
        .join('');
      const bars = activityOnly ? marks : u.rentals
        .map((r) => {
          const s = Math.max(0, Math.round((r.start - first) / DAY_MS));
          const e = Math.min(n - 1, Math.round((r.end - first) / DAY_MS));
          return `<a class="tl-bar ${colorClass(r)}" style="grid-column:${s + 2} / ${e + 3}" href="/rental-detail?id=${r.id}" title="${escapeHtml(tip(r))}">${escapeHtml(r.customer)}</a>`;
        })
        .join('');
      const todayLine = todayIdx >= 0 ? `<div class="tl-todayline" style="grid-column:${todayIdx + 2}"></div>` : '';
      return `<div class="tl-row" style="grid-template-columns:${cols}; --days:${n};"><div class="tl-label" title="${escapeHtml(u.full)}"><span class="tl-name">${escapeHtml(u.label)}</span>${u.tail ? `<span class="tl-serial">${escapeHtml(u.tail)}</span>` : ''}</div>${todayLine}${bars}</div>`;
    })
    .join('');

  document.getElementById('timelineView').innerHTML = `<div class="tl-scroll"><div class="tl" style="min-width:${200 + n * 26}px">${head}${rows}</div></div>`;
}

function renderDayPanel() {
  const panel = document.getElementById('dayPanel');
  if (!selectedDay) {
    panel.style.display = 'none';
    return;
  }
  const dayName = selectedDay.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  if (activityOnly) {
    const events = eventsOn(selectedDay);
    document.getElementById('dayTitle').textContent = `${dayName} - ${events.length} event${events.length === 1 ? '' : 's'}`;
    document.getElementById('dayHead').innerHTML = '<th>Event</th><th>Machine</th><th>Customer</th><th>Period</th><th></th>';
    document.getElementById('dayBody').innerHTML = events.length
      ? events
          .map(
            ({ r, kind }) => `<tr>
              <td><span class="badge ev-${kind}">${EVENT_LABEL[kind]}</span></td>
              <td>${escapeHtml(r.label)}${r.serial ? ` <span style="color:var(--muted); font-size:12px;">${escapeHtml(r.serial)}</span>` : ''}</td>
              <td>${escapeHtml(r.customer)}</td>
              <td>${fmt(r.start)} to ${fmt(r.due)}</td>
              <td><a class="btn btn-sm" href="/rental-detail?id=${r.id}">View</a></td>
            </tr>`
          )
          .join('')
      : '<tr><td colspan="5"><div class="empty">No starts or returns on this day.</div></td></tr>';
    panel.style.display = 'block';
    return;
  }
  document.getElementById('dayHead').innerHTML = '<th>Machine</th><th>Type</th><th>Customer</th><th>Period</th><th></th>';
  const list = outOn(selectedDay);
  document.getElementById('dayTitle').textContent = `${dayName} - ${list.length} machine${list.length === 1 ? '' : 's'} out`;
  document.getElementById('dayBody').innerHTML = list.length
    ? list
        .map(
          (r) => `<tr>
            <td>${escapeHtml(r.label)}${r.serial ? ` <span style="color:var(--muted); font-size:12px;">${escapeHtml(r.serial)}</span>` : ''}</td>
            <td>${r.type === 'laptop' ? 'Laptop' : 'Desktop'}</td>
            <td>${escapeHtml(r.customer)}</td>
            <td>${fmt(r.start)} to ${fmt(r.due)}${r.returned ? ' <span class="badge badge-retired">Returned</span>' : r.overdue ? ' <span class="badge badge-overdue">Overdue</span>' : ''}</td>
            <td><a class="btn btn-sm" href="/rental-detail?id=${r.id}">View</a></td>
          </tr>`
        )
        .join('')
    : '<tr><td colspan="5"><div class="empty">Nothing out on this day.</div></td></tr>';
  panel.style.display = 'block';
}

function render() {
  document.getElementById('monthLabel').textContent = month.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
  document.getElementById('calendarView').style.display = view === 'calendar' ? 'block' : 'none';
  document.getElementById('timelineView').style.display = view === 'timeline' ? 'block' : 'none';
  document.getElementById('legendOut').style.display = activityOnly ? 'none' : 'contents';
  document.getElementById('legendActivity').style.display = activityOnly ? 'contents' : 'none';
  renderSummary();
  if (view === 'calendar') renderCalendar();
  else renderTimeline();
  renderDayPanel();
}

function goToMonth(d) {
  month = firstOfMonth(d);
  const t = today();
  selectedDay = month.getMonth() === t.getMonth() && month.getFullYear() === t.getFullYear() ? t : null;
  render();
}

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('prevBtn').addEventListener('click', () => goToMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1)));
  document.getElementById('nextBtn').addEventListener('click', () => goToMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1)));
  document.getElementById('todayBtn').addEventListener('click', () => goToMonth(new Date()));

  document.getElementById('viewTabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    document.querySelectorAll('#viewTabs .tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
    view = btn.dataset.view;
    render();
  });

  document.getElementById('activityBtn').addEventListener('click', (e) => {
    activityOnly = !activityOnly;
    e.currentTarget.classList.toggle('active', activityOnly);
    e.currentTarget.setAttribute('aria-pressed', String(activityOnly));
    render();
  });

  document.getElementById('calendarView').addEventListener('click', (e) => {
    const cell = e.target.closest('[data-day]');
    if (!cell) return;
    selectedDay = new Date(Number(cell.dataset.day));
    render();
    document.getElementById('dayPanel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  try {
    const { rentals: rows } = await fetchJSON('/api/rentals');
    rentals = rows.map(normalize);
    selectedDay = today();
    render();
  } catch (err) {
    document.getElementById('loadError').innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message)}</div>`;
  }
});
