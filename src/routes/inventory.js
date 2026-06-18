import { Router } from 'express';
import { db } from '../db.js';

const router = Router();

/**
 * @openapi
 * /api/inventory/store/{storeId}:
 *   get:
 *     tags: [Store / Staff Intents]
 *     summary: Get inventory for a dark store
 *     parameters:
 *       - in: path
 *         name: storeId
 *         required: true
 *         schema:
 *           type: string
 *         example: 1001
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [in_stock, out_of_stock]
 *         description: Filter by stock status
 *     responses:
 *       200:
 *         description: Inventory list
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/InventoryItem'
 */
router.get('/store/:storeId', async (req, res) => {
  const { storeId } = req.params;
  const { status } = req.query;

  let sql = 'SELECT * FROM inventory WHERE store_id = ?';
  const args = [storeId];

  if (status) {
    sql += ' AND status = ?';
    args.push(status);
  }

  const result = await db.execute({ sql, args });
  res.json(result.rows);
});

/**
 * @openapi
 * /api/inventory/check:
 *   get:
 *     tags: [Store / Staff Intents]
 *     summary: Check availability of a specific item
 *     parameters:
 *       - in: query
 *         name: store_id
 *         required: true
 *         schema:
 *           type: string
 *         example: 1001
 *       - in: query
 *         name: sku
 *         required: true
 *         schema:
 *           type: string
 *         example: AMILK1
 *     responses:
 *       200:
 *         description: Item availability
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/InventoryItem'
 *                 - type: object
 *                   properties:
 *                     available:
 *                       type: boolean
 *                       example: false
 *       400:
 *         description: Missing query parameters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Item not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/check', async (req, res) => {
  const { store_id, sku } = req.query;
  if (!store_id || !sku) return res.status(400).json({ error: 'store_id and sku are required' });

  const result = await db.execute({
    sql: 'SELECT * FROM inventory WHERE store_id = ? AND sku = ?',
    args: [store_id, sku],
  });

  if (!result.rows.length) return res.status(404).json({ error: 'Item not found' });
  const item = result.rows[0];
  res.json({ available: item.status === 'in_stock', ...item });
});

/**
 * @openapi
 * /api/inventory/{id}/out-of-stock:
 *   patch:
 *     tags: [Store / Staff Intents]
 *     summary: Mark an item as out of stock
 *     description: Called by store staff when a physical item is unavailable despite the system showing stock. Updates quantity to 0 and status to out_of_stock.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         example: 9002
 *     responses:
 *       200:
 *         description: Item marked out of stock
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 */
router.patch('/:id/out-of-stock', async (req, res) => {
  const { id } = req.params;

  await db.execute({
    sql: `UPDATE inventory SET status = 'out_of_stock', quantity = 0, updated_at = datetime('now') WHERE id = ?`,
    args: [id],
  });

  res.json({ success: true, message: 'Item marked as out of stock' });
});

/**
 * @openapi
 * /api/inventory/{id}/quantity:
 *   patch:
 *     tags: [Store / Staff Intents]
 *     summary: Update item quantity
 *     description: Set the physical count. Automatically sets status to in_stock when quantity > 0, out_of_stock when 0.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         example: 9002
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [quantity]
 *             properties:
 *               quantity:
 *                 type: integer
 *                 example: 10
 *     responses:
 *       200:
 *         description: Quantity updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       400:
 *         description: Missing quantity
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.patch('/:id/quantity', async (req, res) => {
  const { id } = req.params;
  const { quantity } = req.body;

  if (quantity === undefined) return res.status(400).json({ error: 'quantity is required' });

  const status = quantity > 0 ? 'in_stock' : 'out_of_stock';

  await db.execute({
    sql: `UPDATE inventory SET quantity = ?, status = ?, updated_at = datetime('now') WHERE id = ?`,
    args: [quantity, status, id],
  });

  res.json({ success: true });
});

export default router;
