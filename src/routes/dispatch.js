import { Router } from 'express';
import { db } from '../db.js';

const router = Router();

/**
 * @openapi
 * /api/dispatch/rider/{riderId}:
 *   get:
 *     tags: [Dispatch]
 *     summary: Get a rider's current dispatch assignment
 *     parameters:
 *       - in: path
 *         name: riderId
 *         required: true
 *         schema:
 *           type: integer
 *         example: 1
 *     responses:
 *       200:
 *         description: Rider profile with current order details
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Rider'
 *                 - type: object
 *                   properties:
 *                     current_order:
 *                       nullable: true
 *                       allOf:
 *                         - $ref: '#/components/schemas/Order'
 *       404:
 *         description: Rider not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/rider/:riderId', async (req, res) => {
  const { riderId } = req.params;
  const result = await db.execute({
    sql: 'SELECT * FROM riders WHERE id = ?',
    args: [riderId],
  });

  if (!result.rows.length) return res.status(404).json({ error: 'Rider not found' });

  const rider = result.rows[0];
  let currentOrder = null;

  if (rider.current_order_id) {
    const order = await db.execute({
      sql: `SELECT o.*, c.name as customer_name, c.phone as customer_phone, c.address
            FROM orders o JOIN customers c ON o.customer_id = c.id
            WHERE o.id = ?`,
      args: [rider.current_order_id],
    });
    currentOrder = order.rows[0] || null;
  }

  res.json({ ...rider, current_order: currentOrder });
});

/**
 * @openapi
 * /api/dispatch/assign:
 *   post:
 *     tags: [Dispatch]
 *     summary: Assign an available rider to an order
 *     description: Picks the first available active rider and assigns them to the given order. Used when the original rider is delayed or stuck.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [order_number]
 *             properties:
 *               order_number:
 *                 type: string
 *                 example: ORD-2024-002
 *     responses:
 *       200:
 *         description: Rider assigned
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 assigned_rider:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     name:
 *                       type: string
 *                     phone:
 *                       type: string
 *                 order_number:
 *                   type: string
 *       503:
 *         description: No riders available
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Order not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/assign', async (req, res) => {
  const { order_number } = req.body;
  if (!order_number) return res.status(400).json({ error: 'order_number is required' });

  const available = await db.execute({
    sql: `SELECT * FROM riders WHERE status = 'available' AND account_status = 'active' LIMIT 1`,
    args: [],
  });

  if (!available.rows.length) {
    return res.status(503).json({ error: 'No riders available at the moment' });
  }

  const rider = available.rows[0];

  const order = await db.execute({
    sql: 'SELECT * FROM orders WHERE order_number = ?',
    args: [order_number],
  });

  if (!order.rows.length) return res.status(404).json({ error: 'Order not found' });

  await db.execute({
    sql: `UPDATE orders SET rider_id = ?, updated_at = datetime('now') WHERE order_number = ?`,
    args: [rider.id, order_number],
  });

  await db.execute({
    sql: `UPDATE riders SET status = 'on_delivery', current_order_id = ? WHERE id = ?`,
    args: [order.rows[0].id, rider.id],
  });

  res.json({
    success: true,
    assigned_rider: { id: rider.id, name: rider.name, phone: rider.phone },
    order_number,
  });
});

/**
 * @openapi
 * /api/dispatch/unreachable:
 *   post:
 *     tags: [Dispatch]
 *     summary: Report customer unreachable at drop-off
 *     description: Called by a rider when the customer is not answering. Creates a ticket and starts a 10-minute wait timer.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [order_number, rider_id]
 *             properties:
 *               order_number:
 *                 type: string
 *                 example: ORD-2024-001
 *               rider_id:
 *                 type: integer
 *                 example: 1
 *     responses:
 *       200:
 *         description: Wait timer started
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 wait_minutes:
 *                   type: integer
 *                   example: 10
 */
router.post('/unreachable', async (req, res) => {
  const { order_number, rider_id } = req.body;

  await db.execute({
    sql: `INSERT INTO tickets (ticket_number, order_id, caller_type, caller_id, category, description, status, priority)
          SELECT 'TKT-' || CAST((SELECT COUNT(*) + 1 FROM tickets) AS TEXT),
                 o.id, 'rider', ?, 'customer_unreachable',
                 'Rider unable to reach customer at drop-off. Wait timer started.', 'open', 'normal'
          FROM orders o WHERE o.order_number = ?`,
    args: [rider_id, order_number],
  });

  res.json({
    success: true,
    message: 'Wait timer started. Attempting to contact customer.',
    wait_minutes: 10,
  });
});

/**
 * @openapi
 * /api/dispatch/rider/{riderId}/status:
 *   patch:
 *     tags: [Dispatch]
 *     summary: Update a rider's availability status
 *     parameters:
 *       - in: path
 *         name: riderId
 *         required: true
 *         schema:
 *           type: integer
 *         example: 1
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [available, on_delivery, offline]
 *     responses:
 *       200:
 *         description: Status updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       400:
 *         description: Invalid status value
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.patch('/rider/:riderId/status', async (req, res) => {
  const { riderId } = req.params;
  const { status } = req.body;

  const allowed = ['available', 'on_delivery', 'offline'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });
  }

  await db.execute({
    sql: 'UPDATE riders SET status = ? WHERE id = ?',
    args: [status, riderId],
  });

  res.json({ success: true });
});

/**
 * @openapi
 * /api/dispatch/rider/{riderId}/earnings:
 *   get:
 *     tags: [Dispatch]
 *     summary: Get rider earnings summary
 *     description: Returns total earnings and delivered order count. Used when a rider calls about a payment question.
 *     parameters:
 *       - in: path
 *         name: riderId
 *         required: true
 *         schema:
 *           type: integer
 *         example: 1
 *     responses:
 *       200:
 *         description: Earnings breakdown
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 rider_name:
 *                   type: string
 *                 total_earnings:
 *                   type: number
 *                   example: 1250.50
 *                 delivered_orders:
 *                   type: integer
 *                   example: 42
 *                 account_status:
 *                   type: string
 *       404:
 *         description: Rider not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/rider/:riderId/earnings', async (req, res) => {
  const { riderId } = req.params;
  const result = await db.execute({
    sql: 'SELECT name, earnings_total, account_status FROM riders WHERE id = ?',
    args: [riderId],
  });

  if (!result.rows.length) return res.status(404).json({ error: 'Rider not found' });

  const rider = result.rows[0];
  const delivered = await db.execute({
    sql: `SELECT COUNT(*) as count FROM orders WHERE rider_id = ? AND status = 'delivered'`,
    args: [riderId],
  });

  res.json({
    rider_name: rider.name,
    total_earnings: rider.earnings_total,
    delivered_orders: delivered.rows[0].count,
    account_status: rider.account_status,
  });
});

export default router;
