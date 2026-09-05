import express from 'express';
import pool from '../db.js';

const router = express.Router();

// Search/list customers by name or phone
router.get('/', async (req, res) => {
  try {
    const { q } = req.query;
    const { rows } = q
      ? await pool.query(
          `SELECT * FROM customers WHERE full_name ILIKE $1 OR phone ILIKE $1 ORDER BY full_name ASC LIMIT 50`,
          [`%${q}%`]
        )
      : await pool.query(`SELECT * FROM customers ORDER BY full_name ASC LIMIT 50`);
    res.json({ success: true, customers: rows });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch customers', error: error.message });
  }
});

// Get one customer + their rental history
router.get('/:id', async (req, res) => {
  try {
    const { rows: customerRows } = await pool.query(`SELECT * FROM customers WHERE id = $1`, [req.params.id]);
    if (customerRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }
    const { rows: rentalRows } = await pool.query(
      `SELECT r.*, u.label AS unit_label, u.type AS unit_type
       FROM rentals r JOIN units u ON u.id = r.unit_id
       WHERE r.customer_id = $1 ORDER BY r.start_date DESC`,
      [req.params.id]
    );
    res.json({ success: true, customer: customerRows[0], rentals: rentalRows });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch customer', error: error.message });
  }
});

// Create a customer
router.post('/', async (req, res) => {
  try {
    const { full_name, phone, address, email } = req.body;
    if (!full_name) {
      return res.status(400).json({ success: false, message: 'full_name is required' });
    }
    const { rows } = await pool.query(
      `INSERT INTO customers (full_name, phone, address, email) VALUES ($1, $2, $3, $4) RETURNING *`,
      [full_name, phone || null, address || null, email || null]
    );
    res.status(201).json({ success: true, message: 'Customer created', customer: rows[0] });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ success: false, message: 'Failed to create customer', error: error.message });
  }
});

// Update a customer's details
router.put('/:id', async (req, res) => {
  try {
    const { full_name, phone, address, email } = req.body;
    const { rows } = await pool.query(
      `UPDATE customers SET
        full_name = COALESCE($1, full_name),
        phone = COALESCE($2, phone),
        address = COALESCE($3, address),
        email = COALESCE($4, email)
      WHERE id = $5 RETURNING *`,
      [full_name, phone, address, email, req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }
    res.json({ success: true, message: 'Customer updated', customer: rows[0] });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ success: false, message: 'Failed to update customer', error: error.message });
  }
});

// Delete a customer - blocked if they have any rental history, so real
// business records can't be silently orphaned/lost via the customer page.
router.delete('/:id', async (req, res) => {
  try {
    const { rows: existingRentals } = await pool.query(`SELECT 1 FROM rentals WHERE customer_id = $1 LIMIT 1`, [req.params.id]);
    if (existingRentals.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Cannot delete a customer with rental history. Delete their rentals first if you really need to remove them.',
      });
    }
    const { rowCount } = await pool.query(`DELETE FROM customers WHERE id = $1`, [req.params.id]);
    if (rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }
    res.json({ success: true, message: 'Customer deleted' });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete customer', error: error.message });
  }
});

export default router;
