import { Router } from 'express';
import { db } from '../db.js';
import { seedData } from '../seed.js';
import { normalizePhone } from '../utils/phone.js';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const TABLES = ['customers', 'store_staff', 'riders', 'orders', 'inventory', 'tickets', 'refunds', 'credits'];

function validateTable(req, res) {
  if (!TABLES.includes(req.params.table)) {
    res.status(400).json({ error: `Unknown table. Valid tables: ${TABLES.join(', ')}` });
    return false;
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Database overview
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @openapi
 * /api/admin/stats:
 *   get:
 *     tags: [Admin]
 *     summary: Row counts for every table
 *     responses:
 *       200:
 *         description: Object with table names as keys and row counts as values
 */
router.get('/stats', async (req, res) => {
  const counts = await Promise.all(
    TABLES.map(t => db.execute({ sql: `SELECT COUNT(*) as n FROM ${t}`, args: [] })
      .then(r => [t, r.rows[0].n]))
  );
  res.json(Object.fromEntries(counts));
});

// ─────────────────────────────────────────────────────────────────────────────
// Seed / reset
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @openapi
 * /api/admin/seed:
 *   post:
 *     tags: [Admin]
 *     summary: Wipe and re-seed the entire database
 *     responses:
 *       200:
 *         description: Seed complete
 */
router.post('/seed', async (req, res) => {
  await seedData();
  res.json({ success: true, message: 'Database re-seeded successfully' });
});

// ─────────────────────────────────────────────────────────────────────────────
// Generic list  —  GET /api/admin/:table
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @openapi
 * /api/admin/{table}:
 *   get:
 *     tags: [Admin]
 *     summary: List all rows in a table
 *     parameters:
 *       - in: path
 *         name: table
 *         required: true
 *         schema:
 *           type: string
 *           enum: [customers, store_staff, riders, orders, inventory, tickets, refunds, credits]
 *     responses:
 *       200:
 *         description: Array of rows
 *       400:
 *         description: Unknown table
 */
router.get('/:table', async (req, res) => {
  if (!validateTable(req, res)) return;
  const rows = await db.execute({ sql: `SELECT * FROM ${req.params.table} ORDER BY id`, args: [] });
  res.json({ table: req.params.table, count: rows.rows.length, rows: rows.rows });
});

// ─────────────────────────────────────────────────────────────────────────────
// Generic get one  —  GET /api/admin/:table/:id
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @openapi
 * /api/admin/{table}/{id}:
 *   get:
 *     tags: [Admin]
 *     summary: Get a single row by ID
 *     parameters:
 *       - in: path
 *         name: table
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Row data
 *       404:
 *         description: Row not found
 */
router.get('/:table/:id', async (req, res) => {
  if (!validateTable(req, res)) return;
  const row = await db.execute({
    sql: `SELECT * FROM ${req.params.table} WHERE id = ?`,
    args: [req.params.id],
  });
  if (!row.rows.length) return res.status(404).json({ error: 'Row not found' });
  res.json(row.rows[0]);
});

// ─────────────────────────────────────────────────────────────────────────────
// Generic create  —  POST /api/admin/:table
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @openapi
 * /api/admin/{table}:
 *   post:
 *     tags: [Admin]
 *     summary: Insert a new row into a table
 *     parameters:
 *       - in: path
 *         name: table
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Column name/value pairs to insert
 *     responses:
 *       201:
 *         description: Row created
 *       400:
 *         description: No fields provided or unknown table
 */
router.post('/:table', async (req, res) => {
  if (!validateTable(req, res)) return;
  const body = req.body;
  if (!body || !Object.keys(body).length) {
    return res.status(400).json({ error: 'Request body must contain at least one field' });
  }

  // Normalise phone if present
  if (body.phone) body.phone = normalizePhone(body.phone);

  const cols = Object.keys(body);
  const placeholders = cols.map(() => '?').join(', ');
  const values = Object.values(body);

  const result = await db.execute({
    sql: `INSERT INTO ${req.params.table} (${cols.join(', ')}) VALUES (${placeholders})`,
    args: values,
  });

  const newRow = await db.execute({
    sql: `SELECT * FROM ${req.params.table} WHERE id = ?`,
    args: [result.lastInsertRowid],
  });

  res.status(201).json({ success: true, id: Number(result.lastInsertRowid), row: newRow.rows[0] });
});

// ─────────────────────────────────────────────────────────────────────────────
// Generic update  —  PATCH /api/admin/:table/:id
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @openapi
 * /api/admin/{table}/{id}:
 *   patch:
 *     tags: [Admin]
 *     summary: Update any fields on a row
 *     parameters:
 *       - in: path
 *         name: table
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Row updated
 *       400:
 *         description: No fields provided
 *       404:
 *         description: Row not found
 */
router.patch('/:table/:id', async (req, res) => {
  if (!validateTable(req, res)) return;
  const body = req.body;
  if (!body || !Object.keys(body).length) {
    return res.status(400).json({ error: 'Request body must contain at least one field to update' });
  }

  // Check row exists
  const existing = await db.execute({
    sql: `SELECT id FROM ${req.params.table} WHERE id = ?`,
    args: [req.params.id],
  });
  if (!existing.rows.length) return res.status(404).json({ error: 'Row not found' });

  if (body.phone) body.phone = normalizePhone(body.phone);

  const cols = Object.keys(body);
  const setClause = cols.map(c => `${c} = ?`).join(', ');
  const values = [...Object.values(body), req.params.id];

  await db.execute({
    sql: `UPDATE ${req.params.table} SET ${setClause} WHERE id = ?`,
    args: values,
  });

  const updated = await db.execute({
    sql: `SELECT * FROM ${req.params.table} WHERE id = ?`,
    args: [req.params.id],
  });
  res.json({ success: true, row: updated.rows[0] });
});

// ─────────────────────────────────────────────────────────────────────────────
// Generic delete  —  DELETE /api/admin/:table/:id
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @openapi
 * /api/admin/{table}/{id}:
 *   delete:
 *     tags: [Admin]
 *     summary: Delete a row by ID
 *     parameters:
 *       - in: path
 *         name: table
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Row deleted
 *       404:
 *         description: Row not found
 */
router.delete('/:table/:id', async (req, res) => {
  if (!validateTable(req, res)) return;

  const existing = await db.execute({
    sql: `SELECT id FROM ${req.params.table} WHERE id = ?`,
    args: [req.params.id],
  });
  if (!existing.rows.length) return res.status(404).json({ error: 'Row not found' });

  // Break rider→order link before deleting a rider or order to avoid FK errors
  if (req.params.table === 'riders') {
    await db.execute({ sql: `UPDATE riders SET current_order_id = NULL WHERE id = ?`, args: [req.params.id] });
  }
  if (req.params.table === 'orders') {
    await db.execute({ sql: `UPDATE riders SET current_order_id = NULL WHERE current_order_id = ?`, args: [req.params.id] });
  }

  await db.execute({
    sql: `DELETE FROM ${req.params.table} WHERE id = ?`,
    args: [req.params.id],
  });
  res.json({ success: true, deleted_id: Number(req.params.id) });
});

export default router;
