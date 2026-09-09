import express from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import pool from '../db.js';

const router = express.Router();

const UPLOAD_ROOT = path.resolve('uploads', 'rentals');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(UPLOAD_ROOT, String(req.params.id));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const stage = req.body.stage === 'return' ? 'return' : 'checkout';
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${stage}-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});
const upload = multer({ storage });

// List rentals (optionally filter: status=active|overdue|returned)
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT r.*, u.label AS unit_label, u.type AS unit_type, c.full_name AS customer_name, c.phone AS customer_phone
      FROM rentals r
      JOIN units u ON u.id = r.unit_id
      JOIN customers c ON c.id = r.customer_id
      ORDER BY r.start_date DESC
    `);

    const { status } = req.query;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let rentals = rows.map((r) => ({
      ...r,
      is_overdue: !r.returned_at && new Date(r.due_date) < today,
    }));

    if (status === 'active') rentals = rentals.filter((r) => !r.returned_at);
    if (status === 'overdue') rentals = rentals.filter((r) => r.is_overdue);
    if (status === 'returned') rentals = rentals.filter((r) => r.returned_at);

    res.json({ success: true, rentals });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch rentals', error: error.message });
  }
});

// Get one rental
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.*, u.label AS unit_label, u.type AS unit_type, u.serial_number, u.specs,
              c.full_name AS customer_name, c.phone AS customer_phone, c.address AS customer_address
       FROM rentals r
       JOIN units u ON u.id = r.unit_id
       JOIN customers c ON c.id = r.customer_id
       WHERE r.id = $1`,
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Rental not found' });
    }
    const { rows: photos } = await pool.query(
      `SELECT id, stage, file_path, uploaded_at FROM rental_photos WHERE rental_id = $1 ORDER BY uploaded_at ASC`,
      [req.params.id]
    );
    res.json({ success: true, rental: rows[0], photos });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch rental', error: error.message });
  }
});

// Everything the print-agreement page needs, in one call
router.get('/:id/print-data', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.*, u.label AS unit_label, u.type AS unit_type, u.serial_number, u.specs,
              c.full_name AS customer_name, c.phone AS customer_phone, c.address AS customer_address
       FROM rentals r
       JOIN units u ON u.id = r.unit_id
       JOIN customers c ON c.id = r.customer_id
       WHERE r.id = $1`,
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Rental not found' });
    }
    res.json({ success: true, rental: rows[0] });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch print data', error: error.message });
  }
});

// Checkout: create a rental against a unit, blocking if it's already out / in repair / retired
router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      unit_id,
      customer_id,
      new_customer, // { full_name, phone, address, email } - used when customer_id is not provided
      start_date,
      due_date,
      rental_fee,
      fee_frequency,
      final_fee,
      security_bond,
      accessories_included,
      notes,
    } = req.body;

    if (!unit_id || !start_date || !due_date) {
      return res.status(400).json({ success: false, message: 'unit_id, start_date and due_date are required' });
    }
    if (!customer_id && !new_customer?.full_name) {
      return res.status(400).json({ success: false, message: 'customer_id or new_customer.full_name is required' });
    }

    await client.query('BEGIN');

    const unitResult = await client.query(
      `SELECT manual_status, EXISTS (
         SELECT 1 FROM rentals WHERE unit_id = $1 AND returned_at IS NULL
       ) AS has_open_rental
       FROM units WHERE id = $1`,
      [unit_id]
    );
    if (unitResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Unit not found' });
    }
    const unit = unitResult.rows[0];
    if (unit.manual_status !== 'none') {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: `Unit is marked ${unit.manual_status} and cannot be rented out` });
    }
    if (unit.has_open_rental) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'Unit is already rented out' });
    }

    let finalCustomerId = customer_id;
    if (!finalCustomerId) {
      const { full_name, phone, address, email } = new_customer;
      const customerResult = await client.query(
        `INSERT INTO customers (full_name, phone, address, email) VALUES ($1, $2, $3, $4) RETURNING id`,
        [full_name, phone || null, address || null, email || null]
      );
      finalCustomerId = customerResult.rows[0].id;
    }

    const rentalResult = await client.query(
      `INSERT INTO rentals (unit_id, customer_id, start_date, due_date, rental_fee, fee_frequency, final_fee, security_bond, accessories_included, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [unit_id, finalCustomerId, start_date, due_date, rental_fee || null, fee_frequency || null, final_fee || null, security_bond || null, accessories_included || null, notes || null]
    );

    await client.query('COMMIT');
    res.status(201).json({ success: true, message: 'Rental created', id: rentalResult.rows[0].id, customer_id: finalCustomerId });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Database error:', error);
    res.status(500).json({ success: false, message: 'Failed to create rental', error: error.message });
  } finally {
    client.release();
  }
});

// Update a rental's terms (dates, fee, bond, accessories, notes) - not the
// unit or customer, since reassigning those is really a different rental.
router.put('/:id', async (req, res) => {
  try {
    const { start_date, due_date, rental_fee, fee_frequency, final_fee, security_bond, accessories_included, notes } = req.body;
    const { rows } = await pool.query(
      `UPDATE rentals SET
        start_date = COALESCE($1, start_date),
        due_date = COALESCE($2, due_date),
        rental_fee = COALESCE($3, rental_fee),
        fee_frequency = COALESCE($4, fee_frequency),
        final_fee = COALESCE($5, final_fee),
        security_bond = COALESCE($6, security_bond),
        accessories_included = COALESCE($7, accessories_included),
        notes = COALESCE($8, notes),
        -- Changing the due date means a rental that was already flagged
        -- overdue-and-notified should be eligible to notify again if the
        -- new date also passes unreturned.
        late_notified_at = CASE WHEN $2::date IS NOT NULL THEN NULL ELSE late_notified_at END
      WHERE id = $9 RETURNING *`,
      [start_date, due_date, rental_fee, fee_frequency, final_fee, security_bond, accessories_included, notes, req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Rental not found' });
    }
    res.json({ success: true, message: 'Rental updated', rental: rows[0] });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ success: false, message: 'Failed to update rental', error: error.message });
  }
});

// Mark a rental returned
router.put('/:id/return', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE rentals SET returned_at = now() WHERE id = $1 AND returned_at IS NULL RETURNING *, due_date < CURRENT_DATE AS was_overdue`,
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Rental not found or already returned' });
    }
    res.json({ success: true, message: 'Rental marked returned', rental: rows[0] });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ success: false, message: 'Failed to return rental', error: error.message });
  }
});

// Delete a rental entirely (e.g. entered in error). Cascades to its
// condition photos in the DB; best-effort cleans up the uploaded files too.
router.delete('/:id', async (req, res) => {
  try {
    const { rows: photos } = await pool.query(`SELECT file_path FROM rental_photos WHERE rental_id = $1`, [req.params.id]);
    const { rowCount } = await pool.query(`DELETE FROM rentals WHERE id = $1`, [req.params.id]);
    if (rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Rental not found' });
    }
    photos.forEach((p) => {
      fs.unlink(path.join(process.cwd(), p.file_path.replace(/^\//, '')), () => {});
    });
    res.json({ success: true, message: 'Rental deleted' });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete rental', error: error.message });
  }
});

// Upload a condition photo for a rental (stage: checkout|return)
router.post('/:id/photos', upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'photo file is required' });
    }
    const stage = req.body.stage === 'return' ? 'return' : 'checkout';
    const relativePath = `/uploads/rentals/${req.params.id}/${req.file.filename}`;
    const { rows } = await pool.query(
      `INSERT INTO rental_photos (rental_id, stage, file_path) VALUES ($1, $2, $3) RETURNING *`,
      [req.params.id, stage, relativePath]
    );
    res.status(201).json({ success: true, photo: rows[0] });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ success: false, message: 'Failed to upload photo', error: error.message });
  }
});

// Delete a single condition photo
router.delete('/:id/photos/:photoId', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `DELETE FROM rental_photos WHERE id = $1 AND rental_id = $2 RETURNING file_path`,
      [req.params.photoId, req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Photo not found' });
    }
    fs.unlink(path.join(process.cwd(), rows[0].file_path.replace(/^\//, '')), () => {});
    res.json({ success: true, message: 'Photo deleted' });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete photo', error: error.message });
  }
});

export default router;
