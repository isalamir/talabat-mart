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
 *         example: '5001'
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
 *                       example: Ahmad Khalid
 *                     customer_phone:
 *                       type: string
 *                       example: '+962790520759'
 *                     rider_name:
 *                       type: string
 *                       nullable: true
 *                       example: Samer Bataineh
 *                     rider_phone:
 *                       type: string
 *                       nullable: true
 *                       example: '+962796814523'
 *                     eta_message:
 *                       type: string
 *                       example: Your order is on the way and will arrive in approximately 15 minutes.
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
 *         example: 6001
 *     responses:
 *       200:
 *         description: List of orders newest first
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
 * /api/orders/customer/{customer_id}/order-status:
 *   get:
 *     tags: [Customer Intents]
 *     summary: Get latest order status
 *     description: |
 *       Returns the customer's most recent active order (out_for_delivery → preparing → pending),
 *       falling back to the most recent order of any status if none are active.
 *       Call this right after `POST /api/identity/` — no order number needed from the customer.
 *     parameters:
 *       - in: path
 *         name: customer_id
 *         required: true
 *         schema:
 *           type: integer
 *         example: 6001
 *     responses:
 *       200:
 *         description: Order details with a voice-ready ETA message
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Order'
 *                 - type: object
 *                   properties:
 *                     rider_name:
 *                       type: string
 *                       nullable: true
 *                     rider_phone:
 *                       type: string
 *                       nullable: true
 *                     eta_message:
 *                       type: string
 *                       example: Your order is on the way and will arrive in approximately 15 minutes.
 *       404:
 *         description: No orders found for this customer
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/customer/:customer_id/order-status', async (req, res) => {
  const { customer_id } = req.params;

  const result = await db.execute({
    sql: `SELECT o.*, r.name as rider_name, r.phone as rider_phone
          FROM orders o
          LEFT JOIN riders r ON o.rider_id = r.id
          WHERE o.customer_id = ?
          ORDER BY
            CASE o.status
              WHEN 'out_for_delivery' THEN 0
              WHEN 'preparing'        THEN 1
              WHEN 'pending'          THEN 2
              ELSE 3
            END,
            o.created_at DESC
          LIMIT 1`,
    args: [customer_id],
  });

  if (!result.rows.length) return res.status(404).json({ error: 'No orders found for this customer' });

  const order = result.rows[0];
  const etaMessage = order.status === 'out_for_delivery'
    ? `Your order is on the way and will arrive in approximately ${order.eta_minutes} minutes.`
    : order.status === 'delivered'
    ? 'Your order has been delivered. Thank you!'
    : order.status === 'preparing'
    ? `Your order is being prepared. Estimated time: ${order.eta_minutes} minutes.`
    : order.status === 'pending'
    ? 'Your order is confirmed and will be prepared shortly.'
    : `Your order status is: ${order.status}.`;

  res.json({ ...order, eta_message: etaMessage });
});

/**
 * @openapi
 * /api/orders/customer/{customer_id}/cancel:
 *   post:
 *     tags: [Customer Intents]
 *     summary: Cancel active order
 *     description: |
 *       Cancels the customer's most recent cancellable order (status pending or preparing,
 *       packing not yet started). No order number needed — the agent only needs the customer_id
 *       from the identity step.
 *     parameters:
 *       - in: path
 *         name: customer_id
 *         required: true
 *         schema:
 *           type: integer
 *         example: 6004
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
 *                 message:
 *                   type: string
 *                   example: Order 5004 has been cancelled successfully.
 *                 order_number:
 *                   type: string
 *                   example: '5004'
 *       404:
 *         description: No cancellable order found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       409:
 *         description: Most recent order cannot be cancelled (packing already started or delivered)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/customer/:customer_id/cancel', async (req, res) => {
  const { customer_id } = req.params;

  const result = await db.execute({
    sql: `SELECT * FROM orders WHERE customer_id = ?
          ORDER BY created_at DESC LIMIT 1`,
    args: [customer_id],
  });

  if (!result.rows.length) return res.status(404).json({ error: 'No orders found for this customer' });

  const order = result.rows[0];

  if (!['pending', 'preparing'].includes(order.status) || order.packing_stage !== 'not_started') {
    return res.status(409).json({
      error: 'Order cannot be cancelled',
      reason: order.packing_stage !== 'not_started'
        ? 'Packing has already started'
        : `Order is ${order.status}`,
      order_number: order.order_number,
    });
  }

  await db.execute({
    sql: `UPDATE orders SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?`,
    args: [order.id],
  });

  res.json({
    success: true,
    message: `Order ${order.order_number} has been cancelled successfully.`,
    order_number: order.order_number,
  });
});

/**
 * @openapi
 * /api/orders/customer/{customer_id}/refund:
 *   post:
 *     tags: [Customer Intents]
 *     summary: Request a refund
 *     description: |
 *       Initiates a refund on the customer's most recent refundable order — no order number
 *       needed. An order is refundable if it is cancelled or delivered and not already refunded.
 *       Cash orders must be delivered before a refund can be issued.
 *     parameters:
 *       - in: path
 *         name: customer_id
 *         required: true
 *         schema:
 *           type: integer
 *         example: 6001
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reason]
 *             properties:
 *               reason:
 *                 type: string
 *                 example: Item was damaged on arrival
 *     responses:
 *       200:
 *         description: Refund initiated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 refund_amount:
 *                   type: number
 *                   example: 12.50
 *                 payment_method:
 *                   type: string
 *                   example: card
 *                 order_number:
 *                   type: string
 *                   example: '5001'
 *                 message:
 *                   type: string
 *                   example: Refund of 12.50 JD has been initiated for order 5001.
 *       400:
 *         description: Missing reason or ineligible order (e.g. cash order not yet delivered)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: No refundable order found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       409:
 *         description: Order already refunded
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/customer/:customer_id/refund', async (req, res) => {
  const { customer_id } = req.params;
  const { reason } = req.body;

  if (!reason) return res.status(400).json({ error: 'reason is required' });

  // Find most recent order eligible for refund
  const result = await db.execute({
    sql: `SELECT * FROM orders
          WHERE customer_id = ?
            AND status IN ('delivered','cancelled')
          ORDER BY created_at DESC LIMIT 1`,
    args: [customer_id],
  });

  if (!result.rows.length) {
    return res.status(404).json({ error: 'No refundable order found for this customer' });
  }

  const order = result.rows[0];

  if (order.payment_status === 'refunded') {
    return res.status(409).json({ error: 'This order has already been refunded', order_number: order.order_number });
  }

  if (order.payment_method === 'cash' && order.status !== 'delivered') {
    return res.status(400).json({ error: 'Cash orders can only be refunded after delivery' });
  }

  await db.execute({
    sql: `INSERT INTO refunds (order_id, customer_id, amount, reason, status) VALUES (?, ?, ?, ?, 'completed')`,
    args: [order.id, customer_id, order.total_amount, reason],
  });

  await db.execute({
    sql: `UPDATE orders SET payment_status = 'refunded', updated_at = datetime('now') WHERE id = ?`,
    args: [order.id],
  });

  res.json({
    success: true,
    refund_amount: order.total_amount,
    payment_method: order.payment_method,
    order_number: order.order_number,
    message: `Refund of ${order.total_amount} JD has been initiated for order ${order.order_number}.`,
  });
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
 *         example: '5002'
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
