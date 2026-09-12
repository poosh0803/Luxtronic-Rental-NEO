function fmtDMY(value) {
  if (!value) return '___/___/20___';
  const d = new Date(value);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value || '';
}

function setChecked(id, on) {
  const el = document.getElementById(id);
  if (el && on) el.classList.add('checked');
}

document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const status = document.getElementById('toolbarStatus');

  if (!id) {
    status.textContent = 'No rental specified.';
    return;
  }

  try {
    const [{ rental }, config] = await Promise.all([
      fetchJSON(`/api/rentals/${id}/print-data`),
      fetch('/api/config').then((r) => r.json()),
    ]);

    status.textContent = `Rental #${rental.id} — ${rental.unit_label}`;

    setText('agreementDate', fmtDMY(new Date()));
    setText('lesseeName', rental.customer_name);
    setText('lesseeNameSign', rental.customer_name);
    setText('lesseeAddress', rental.customer_address);
    setText('lesseePhone', rental.customer_phone);

    setText('lessorAbn', config.BUSINESS_ABN);
    setText('lessorAbn2', config.BUSINESS_ABN);
    setText('lessorAddress', config.ADDRESS);
    setText('lessorPhone', config.PHONE);
    setText('lessorEmail', config.EMAIL);
    setText('returnAddress', config.ADDRESS);

    setChecked('checkLaptop', rental.unit_type === 'laptop');
    setChecked('checkDesktop', rental.unit_type === 'desktop');
    setText('equipMakeModel', rental.unit_label);
    setText('equipSerial', rental.serial_number);

    const accessories = (rental.accessories_included || '').toLowerCase();
    setChecked('checkCharger', accessories.includes('charger'));
    setChecked('checkBag', accessories.includes('bag'));
    setChecked('checkPowerbank', accessories.includes('powerbank'));
    const knownWords = ['charger', 'bag', 'powerbank'];
    const otherWords = (rental.accessories_included || '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s && !knownWords.includes(s.toLowerCase()));
    if (otherWords.length > 0) {
      setChecked('checkOther', true);
      setText('accessoryOtherText', otherWords.join(', '));
    }

    setText('periodFrom', fmtDMY(rental.start_date));
    setText('periodTo', fmtDMY(rental.due_date));

    setText(
      'rentalFeeText',
      rental.rental_fee ? `$${Number(rental.rental_fee).toFixed(2)} per ${rental.fee_frequency || 'day'}` : '_________ per [day / week / month]'
    );
    setText('securityBondText', rental.security_bond ? formatMoney(rental.security_bond, rental.security_bond_currency) : '$____________');
    setText('finalFeeLine', rental.final_fee ? `, for an agreed total of $${Number(rental.final_fee).toFixed(2)}` : '');
  } catch (err) {
    status.textContent = `Error: ${err.message}`;
  }
});
