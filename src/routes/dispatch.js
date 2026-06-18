import { Router } from 'express';
import { db } from '../db.js';

const router = Router();

/**
 * @openapi
 * /api/dispatch/rider/{rider_id}:
 *   get:
 *     tags: [Rider Intents]
 *     summary: Get rider's current assignment
 *     description: Returns the rider's profile and their active order with full customer and delivery details.
 *     parameters:
 *       - in: path
 *         name: rider_id
 *         required: true
 *         schema:
 *           type: integer
 *         example: 7001
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
router.get('/rider/:rider_id', async (req, res) => {
  const { rider_id } = req.params;
  const result = await db.execute({
    sql: 'SELECT * FROM riders WHERE id = ?',
    args: [rider_id],
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
 * /api/dispatch/rider/{rider_id}/status:
 *   patch:
 *     tags: [Rider Intents]
 *     summary: Update availability status
 *     description: Rider sets themselves online, offline, or on delivery. Validated against allowed values.
 *     parameters:
 *       - in: path
 *         name: rider_id
 *         required: true
 *         schema:
 *           type: integer
 *         example: 7003
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
 *       400:
 *         description: Invalid status value
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.patch('/rider/:rider_id/status', async (req, res) => {
  const { rider_id } = req.params;
  const { status } = req.body;

  const allowed = ['available', 'on_delivery', 'offline'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });
  }

  await db.execute({
    sql: 'UPDATE riders SET status = ? WHERE id = ?',
    args: [status, rider_id],
  });

  res.json({ success: true });
});

/**
 * @openapi
 * /api/dispatch/rider/{rider_id}/deliver:
 *   patch:
 *     tags: [Rider Intents]
 *     summary: Mark current order as delivered
 *     description: |
 *       Called when the rider hands over the order to the customer.
 *       Marks the order as delivered, clears the rider's current assignment,
 *       and sets their status back to available — ready for the next order.
 *     parameters:
 *       - in: path
 *         name: rider_id
 *         required: true
 *         schema:
 *           type: integer
 *         example: 7001
 *     responses:
 *       200:
 *         description: Delivery confirmed, rider now available
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                   example: Order 5001 marked as delivered. You are now available.
 *                 order_number:
 *                   type: string
 *       404:
 *         description: Rider not found or no active delivery
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.patch('/rider/:rider_id/deliver', async (req, res) => {
  const { rider_id } = req.params;

  const riderResult = await db.execute({
    sql: 'SELECT * FROM riders WHERE id = ?',
    args: [rider_id],
  });

  if (!riderResult.rows.length) return res.status(404).json({ error: 'Rider not found' });

  const rider = riderResult.rows[0];
  if (!rider.current_order_id) {
    return res.status(404).json({ error: 'No active delivery to confirm' });
  }

  const orderResult = await db.execute({
    sql: 'SELECT * FROM orders WHERE id = ?',
    args: [rider.current_order_id],
  });

  const order = orderResult.rows[0];

  await db.execute({
    sql: `UPDATE orders SET status = 'delivered', updated_at = datetime('now') WHERE id = ?`,
    args: [order.id],
  });

  await db.execute({
    sql: `UPDATE riders SET status = 'available', current_order_id = NULL WHERE id = ?`,
    args: [rider_id],
  });

  res.json({
    success: true,
    message: `Order ${order.order_number} marked as delivered. You are now available.`,
    order_number: order.order_number,
  });
});

/**
 * @openapi
 * /api/dispatch/rider/{rider_id}/unreachable:
 *   post:
 *     tags: [Rider Intents]
 *     summary: Report customer unreachable at drop-off
 *     description: |
 *       Called when the rider arrives at the address but cannot reach the customer.
 *       Creates a support ticket and starts a 10-minute wait timer.
 *       The order number is taken from the rider's current active delivery.
 *     parameters:
 *       - in: path
 *         name: rider_id
 *         required: true
 *         schema:
 *           type: integer
 *         example: 7001
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
 *                 example: '5001'
 *     responses:
 *       200:
 *         description: Ticket created, wait timer started
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
 *                 ticket_number:
 *                   type: string
 *                   example: T1009
 *       404:
 *         description: Order not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/rider/:rider_id/unreachable', async (req, res) => {
  const { rider_id } = req.params;
  const { order_number } = req.body;

  const orderResult = await db.execute({
    sql: 'SELECT * FROM orders WHERE order_number = ?',
    args: [order_number],
  });

  if (!orderResult.rows.length) return res.status(404).json({ error: 'Order not found' });

  const order = orderResult.rows[0];

  const countResult = await db.execute({ sql: 'SELECT COUNT(*) as c FROM tickets', args: [] });
  const ticketNumber = `T${String(countResult.rows[0].c + 1).padStart(4, '0')}`;

  await db.execute({
    sql: `INSERT INTO tickets (ticket_number, order_id, caller_type, caller_id, category, description, status, priority)
          VALUES (?, ?, 'rider', ?, 'customer_unreachable',
                  'Rider unable to reach customer at drop-off. 10-minute wait timer started.', 'open', 'normal')`,
    args: [ticketNumber, order.id, rider_id],
  });

  res.json({
    success: true,
    message: 'Wait timer started. Attempting to contact customer.',
    wait_minutes: 10,
    ticket_number: ticketNumber,
  });
});

/**
 * @openapi
 * /api/dispatch/rider/{rider_id}/earnings:
 *   get:
 *     tags: [Rider Intents]
 *     summary: Get earnings summary
 *     description: Returns total earnings and delivered order count. Used when a rider calls about a payment question.
 *     parameters:
 *       - in: path
 *         name: rider_id
 *         required: true
 *         schema:
 *           type: integer
 *         example: 7001
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
 *                   example: Samer Bataineh
 *                 total_earnings:
 *                   type: number
 *                   example: 287.50
 *                 delivered_orders:
 *                   type: integer
 *                   example: 14
 *                 account_status:
 *                   type: string
 *                   example: active
 *       404:
 *         description: Rider not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/rider/:rider_id/earnings', async (req, res) => {
  const { rider_id } = req.params;
  const result = await db.execute({
    sql: 'SELECT name, earnings_total, account_status FROM riders WHERE id = ?',
    args: [rider_id],
  });

  if (!result.rows.length) return res.status(404).json({ error: 'Rider not found' });

  const rider = result.rows[0];
  const delivered = await db.execute({
    sql: `SELECT COUNT(*) as count FROM orders WHERE rider_id = ? AND status = 'delivered'`,
    args: [rider_id],
  });

  res.json({
    rider_name: rider.name,
    total_earnings: rider.earnings_total,
    delivered_orders: delivered.rows[0].count,
    account_status: rider.account_status,
  });
});

/**
 * @openapi
 * /api/dispatch/assign:
 *   post:
 *     tags: [Store / Staff Intents]
 *     summary: Assign an available rider to an order
 *     description: Picks the first available active rider and assigns them to the given order. Used by staff or the system when no rider is linked to a ready order.
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
 *                 example: '5002'
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
 *       400:
 *         description: Missing order_number
 *       404:
 *         description: Order not found
 *       503:
 *         description: No riders available
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

export default router;
