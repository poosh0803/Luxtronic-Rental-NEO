document.addEventListener('DOMContentLoaded', async () => {
  const activeBody = document.getElementById('activeBody');
  const activeEmpty = document.getElementById('activeEmpty');
  const overdueSection = document.getElementById('overdueSection');
  const overdueBody = document.getElementById('overdueBody');

  try {
    const { rentals } = await fetchJSON('/api/rentals?status=active');

    const overdue = rentals.filter((r) => r.is_overdue);
    const onTime = rentals.filter((r) => !r.is_overdue);

    if (overdue.length > 0) {
      overdueSection.style.display = 'block';
      overdueBody.innerHTML = overdue
        .map((r) => {
          const daysLate = Math.floor((Date.now() - new Date(r.due_date).getTime()) / 86400000);
          return `<tr class="clickable" onclick="location.href='/rental-detail?id=${r.id}'">
            <td>${escapeHtml(r.unit_label)}</td>
            <td>${r.unit_type === 'laptop' ? 'Laptop' : 'Desktop'}</td>
            <td>${escapeHtml(r.customer_name)}</td>
            <td>${formatDate(r.due_date)}</td>
            <td>${daysLate}</td>
            <td><a class="btn btn-sm" href="/rental-detail?id=${r.id}">View</a></td>
          </tr>`;
        })
        .join('');
    }

    if (onTime.length === 0) {
      activeEmpty.style.display = 'block';
    } else {
      activeBody.innerHTML = onTime
        .map(
          (r) => `<tr class="clickable" onclick="location.href='/rental-detail?id=${r.id}'">
            <td>${escapeHtml(r.unit_label)}</td>
            <td>${r.unit_type === 'laptop' ? 'Laptop' : 'Desktop'}</td>
            <td>${escapeHtml(r.customer_name)}</td>
            <td>${formatDate(r.start_date)}</td>
            <td>${formatDate(r.due_date)}</td>
            <td><a class="btn btn-sm" href="/rental-detail?id=${r.id}">View</a></td>
          </tr>`
        )
        .join('');
    }
  } catch (err) {
    activeBody.innerHTML = `<tr><td colspan="6"><div class="alert alert-danger">${escapeHtml(err.message)}</div></td></tr>`;
  }
});
