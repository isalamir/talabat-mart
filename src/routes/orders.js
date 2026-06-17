import { Router } from 'express';
import { db } from '../db.js';

const router = Router();

/**
 * @openapi
 * /api/orders/{orderNumber}/status:
 *   get:
 *     tags: [Customer Intents]
 *     summary: Get order status and ETA
 *     description: Returns real-time order status including rider info and a human-readable ETA message for the voice agent to read aloud.
 *     parameters:
 *       - in: path
 *         name: orderNumber
 *         required: true
 *         schema:
 *           type: string
 *         example: ORD-2024-001
 *     responses:
 *       200:
 *         description: Order details with ETA message
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Order'
 *                 - type: object
 *                   properties:
 *                     customer_name:
 *                       type: string
 *                       example: Ahmed Al-Rashid
 *                     customer_phone:
 *                       type: string
 *                       example: '+971501234567'
 *                     rider_name:
 *                       type: string
 *                       nullable: true
 *                       example: Raj Kumar
 *                     rider_phone:
 *                       type: string
 *                       nullable: true
 *                       example: '+971506666666'
 *                     eta_message:
 *                       type: string
 *                       example: Your order is on the way and will arrive in approximately 12 minutes.
 *       404:
 *         description: Order not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:orderNumber/status', async (req, res) => {
  const { orderNumber } = req.params;
  const result = await db.execute({
    sql: `SELECT o.*, c.name as customer_name, c.phone as customer_phone,
          r.name as rider_name, r.phone as rider_phone
          FROM orders o
          JOIN customers c ON o.customer_id = c.id
          LEFT JOIN riders r ON o.rider_id = r.id
          WHERE o.order_number = ?`,
    args: [orderNumber],
  });

  if (!result.rows.length) return res.status(404).json({ error: 'Order not found' });

  const order = result.rows[0];
  const etaMessage = order.status === 'out_for_delivery'
    ? `Your order is on the way and will arrive in approximately ${order.eta_minutes} minutes.`
    : order.status === 'delivered'
    ? 'Your order has been delivered.'
    : order.status === 'preparing'
    ? `Your order is being prepared. Estimated time: ${order.eta_minutes} minutes.`
    : order.status === 'pending'
    ? 'Your order is confirmed and will be prepared shortly.'
    : `Your order status is: ${order.status}.`;

  res.json({ ...order, eta_message: etaMessage });
});

/**
 * @openapi
 * /api/orders/{orderNumber}/cancel:
 *   patch:
 *     tags: [Customer Intents]
 *     summary: Cancel an order
 *     description: |
 *       Cancels an order only if packing has not yet started (`packing_stage = not_started`).
 *       Returns a 409 error if the order is already being packed or is out for delivery.
 *     parameters:
 *       - in: path
 *         name: orderNumber
 *         required: true
 *         schema:
 *           type: string
 *         example: ORD-2024-004
 *     responses:
 *       200:
 *         description: Order cancelled
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Order cancelled successfully
 *                 order_number:
 *                   type: string
 *                   example: ORD-2024-004
 *       404:
 *         description: Order not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       409:
 *         description: Order cannot be cancelled (packing already started or wrong status)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                 reason:
 *                   type: string
 *                   example: Packing has already started
 */
router.patch('/:orderNumber/cancel', async (req, res) => {
  const { orderNumber } = req.params;

  const result = await db.execute({
    sql: 'SELECT * FROM orders WHERE order_number = ?',
    args: [orderNumber],
  });

  if (!result.rows.length) return res.status(404).json({ error: 'Order not found' });

  const order = result.rows[0];
  const cancellable = ['pending', 'preparing'].includes(order.status) && order.packing_stage === 'not_started';

  if (!cancellable) {
    return res.status(409).json({
      error: 'Order cannot be cancelled',
      reason: order.packing_stage !== 'not_started'
        ? 'Packing has already started'
        : `Order is ${order.status}`,
    });
  }

  await db.execute({
    sql: `UPDATE orders SET status = 'cancelled', updated_at = datetime('now') WHERE order_number = ?`,
    args: [orderNumber],
  });

  res.json({ success: true, message: 'Order cancelled successfully', order_number: orderNumber });
});

/**
 * @openapi
 * /api/orders/customer/{customerId}:
 *   get:
 *     tags: [Customer Intents]
 *     summary: Get all orders for a customer
 *     parameters:
 *       - in: path
 *         name: customerId
 *         required: true
 *         schema:
 *           type: integer
 *         example: 1
 *     responses:
 *       200:
 *         description: List of orders
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Order'
 */
router.get('/customer/:customerId', async (req, res) => {
  const { customerId } = req.params;
  const result = await db.execute({
    sql: 'SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC',
    args: [customerId],
  });
  res.json(result.rows);
});

/**
 * @openapi
 * /api/orders/{orderNumber}/status:
 *   patch:
 *     tags: [Store / Staff Intents, Rider Intents]
 *     summary: Update order status or packing stage
 *     description: Internal endpoint used by store staff to progress an order through its lifecycle.
 *     parameters:
 *       - in: path
 *         name: orderNumber
 *         required: true
 *         schema:
 *           type: string
 *         example: ORD-2024-002
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [pending, preparing, out_for_delivery, delivered, cancelled]
 *               packing_stage:
 *                 type: string
 *                 enum: [not_started, picking, packed]
 *               eta_minutes:
 *                 type: integer
 *                 example: 20
 *     responses:
 *       200:
 *         description: Updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       400:
 *         description: No fields to update
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.patch('/:orderNumber/status', async (req, res) => {
  const { orderNumber } = req.params;
  const { status, packing_stage, eta_minutes } = req.body;

  const fields = [];
  const args = [];

  if (status) { fields.push('status = ?'); args.push(status); }
  if (packing_stage) { fields.push('packing_stage = ?'); args.push(packing_stage); }
  if (eta_minutes !== undefined) { fields.push('eta_minutes = ?'); args.push(eta_minutes); }

  if (!fields.length) return res.status(400).json({ error: 'No fields to update' });

  fields.push("updated_at = datetime('now')");
  args.push(orderNumber);

  await db.execute({
    sql: `UPDATE orders SET ${fields.join(', ')} WHERE order_number = ?`,
    args,
  });

  res.json({ success: true });
});

export default router;
