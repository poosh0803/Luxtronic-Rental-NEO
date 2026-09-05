import express from 'express';
import pool from '../db.js';
import { UNIT_SELECT_WITH_OPEN_RENTAL, attachStatus } from '../utils/unitStatus.js';

const router = express.Router();

// List all units, each with its computed status
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`${UNIT_SELECT_WITH_OPEN_RENTAL} ORDER BY u.id ASC`);
    let units = rows.map(attachStatus);

    const { status, type } = req.query;
    if (status) units = units.filter((u) => u.status === status);
    if (type) units = units.filter((u) => u.type === type);

    res.json({ success: true, units });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch units', error: error.message });
  }
});

// Get one unit
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(`${UNIT_SELECT_WITH_OPEN_RENTAL} WHERE u.id = $1`, [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Unit not found' });
    }
    res.json({ success: true, unit: attachStatus(rows[0]) });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch unit', error: error.message });
  }
});

// Create a unit
router.post('/', async (req, res) => {
  try {
    const { type, label, specs, serial_number, accessories, estimate_value } = req.body;
    if (!type || !label) {
      return res.status(400).json({ success: false, message: 'type and label are required' });
    }
    const { rows } = await pool.query(
      `INSERT INTO units (type, label, specs, serial_number, accessories, estimate_value)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [type, label, specs || {}, serial_number || null, accessories || null, estimate_value || null]
    );
    res.status(201).json({ success: true, message: 'Unit created', id: rows[0].id });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ success: false, message: 'Failed to create unit', error: error.message });
  }
});

// Update a unit (specs, serial, accessories, estimate value, manual status)
router.put('/:id', async (req, res) => {
  try {
    const { type, label, specs, serial_number, accessories, estimate_value, manual_status } = req.body;
    const { rowCount } = await pool.query(
      `UPDATE units SET
        type = COALESCE($1, type),
        label = COALESCE($2, label),
        specs = COALESCE($3, specs),
        serial_number = COALESCE($4, serial_number),
        accessories = COALESCE($5, accessories),
        estimate_value = COALESCE($6, estimate_value),
        manual_status = COALESCE($7, manual_status)
      WHERE id = $8`,
      [type, label, specs, serial_number, accessories, estimate_value, manual_status, req.params.id]
    );
    if (rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Unit not found' });
    }
    res.json({ success: true, message: 'Unit updated' });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ success: false, message: 'Failed to update unit', error: error.message });
  }
});

export default router;
