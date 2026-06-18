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
 * /api/orders/{orderNumber}/customer:
 *   get:
 *     tags: [Customer Intents]
 *     summary: Resolve customer profile from order number
 *     description: |
 *       Primary lookup for the voice agent when a customer calls without knowing their ID.
 *       Returns the full customer profile (name, phone, address) plus credit balance and
 *       a summary of their recent orders — all resolved from a single order number.
 *     parameters:
 *       - in: path
 *         name: orderNumber
 *         required: true
 *         schema:
 *           type: string
 *         example: '5001'
 *     responses:
 *       200:
 *         description: Customer profile resolved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 customer_id:
 *                   type: integer
 *                   example: 6001
 *                 name:
 *                   type: string
 *                   example: Ahmad Khalid
 *                 phone:
 *                   type: string
 *                   example: '+962790520759'
 *                 address:
 *                   type: string
 *                   example: 'Amman, Khalda, Building 12, Apt 4'
 *                 email:
 *                   type: string
 *                   nullable: true
 *                 wallet_credits:
 *                   type: number
 *                   example: 4.5
 *                 recent_orders:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Order'
 *                 resolved_from_order:
 *                   type: string
 *                   example: '5001'
 *       404:
 *         description: Order not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:orderNumber/customer', async (req, res) => {
  const { orderNumber } = req.params;
  const orderResult = await db.execute({
    sql: `SELECT o.customer_id, c.name, c.phone, c.email, c.address
          FROM orders o JOIN customers c ON o.customer_id = c.id
          WHERE o.order_number = ?`,
    args: [orderNumber],
  });
  if (!orderResult.rows.length) return res.status(404).json({ error: 'Order not found' });

  const { customer_id, name, phone, email, address } = orderResult.rows[0];

  const [credits, orders] = await Promise.all([
    db.execute({
      sql: 'SELECT COALESCE(SUM(amount),0) as total FROM credits WHERE customer_id = ?',
      args: [customer_id],
    }),
    db.execute({
      sql: 'SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC LIMIT 5',
      args: [customer_id],
    }),
  ]);

  res.json({
    customer_id,
    name,
    phone,
    email,
    address,
    wallet_credits: credits.rows[0].total,
    recent_orders: orders.rows,
    resolved_from_order: orderNumber,
  });
});

/**
 * @openapi
 * /api/orders/{orderNumber}/cancel:
 *   post:
 *     tags: [Customer Intents]
 *     summary: Cancel an order by order number
 *     description: |
 *       Cancels this specific order. The order must be in pending or preparing status
 *       and packing must not have started. No customer ID needed — order number is enough.
 *     parameters:
 *       - in: path
 *         name: orderNumber
 *         required: true
 *         schema:
 *           type: string
 *         example: '5004'
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
 *       404:
 *         description: Order not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       409:
 *         description: Order cannot be cancelled
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/:orderNumber/cancel', async (req, res) => {
  const { orderNumber } = req.params;

  const result = await db.execute({
    sql: 'SELECT * FROM orders WHERE order_number = ?',
    args: [orderNumber],
  });
  if (!result.rows.length) return res.status(404).json({ error: 'Order not found' });

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
    sql: `UPDATE orders SET status = 'cancelled', updated_at = datetime('now') WHERE order_number = ?`,
    args: [orderNumber],
  });

  res.json({
    success: true,
    message: `Order ${order.order_number} has been cancelled successfully.`,
    order_number: order.order_number,
  });
});

/**
 * @openapi
 * /api/orders/{orderNumber}/refund:
 *   post:
 *     tags: [Customer Intents]
 *     summary: Request a refund by order number
 *     description: |
 *       Initiates a refund for this specific order. The order must be delivered or cancelled
 *       and not already refunded. Cash orders must be delivered before a refund can be issued.
 *       No customer ID needed — order number is enough.
 *     parameters:
 *       - in: path
 *         name: orderNumber
 *         required: true
 *         schema:
 *           type: string
 *         example: '5003'
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
 *                   example: 12.10
 *                 payment_method:
 *                   type: string
 *                 order_number:
 *                   type: string
 *                 message:
 *                   type: string
 *       400:
 *         description: Order not eligible for refund
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
 *       409:
 *         description: Order already refunded
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/:orderNumber/refund', async (req, res) => {
  const { orderNumber } = req.params;
  const { reason } = req.body;

  if (!reason) return res.status(400).json({ error: 'reason is required' });

  const result = await db.execute({
    sql: 'SELECT * FROM orders WHERE order_number = ?',
    args: [orderNumber],
  });
  if (!result.rows.length) return res.status(404).json({ error: 'Order not found' });

  const order = result.rows[0];

  if (!['delivered', 'cancelled'].includes(order.status)) {
    return res.status(400).json({
      error: 'Order is not eligible for a refund',
      reason: `Order status is ${order.status}`,
      order_number: order.order_number,
    });
  }

  if (order.payment_status === 'refunded') {
    return res.status(409).json({ error: 'This order has already been refunded', order_number: order.order_number });
  }

  if (order.payment_method === 'cash' && order.status !== 'delivered') {
    return res.status(400).json({ error: 'Cash orders can only be refunded after delivery' });
  }

  await db.execute({
    sql: `INSERT INTO refunds (order_id, customer_id, amount, reason, status) VALUES (?, ?, ?, ?, 'completed')`,
    args: [order.id, order.customer_id, order.total_amount, reason],
  });

  await db.execute({
    sql: `UPDATE orders SET payment_status = 'refunded', updated_at = datetime('now') WHERE order_number = ?`,
    args: [orderNumber],
  });

  res.json({
    success: true,
    refund_amount: order.total_amount,
    payment_method: order.payment_method,
    order_number: order.order_number,
    message: `Refund of ${order.total_amount} JD has been initiated for order ${order.order_number}. It will be returned to your ${order.payment_method === 'card' ? 'card' : 'account'}.`,
  });
});

/**
 * @openapi
 * /api/orders/{orderNumber}/payment:
 *   get:
 *     tags: [Customer Intents]
 *     summary: Get payment details for an order
 *     description: Returns charge amount, payment method, and current payment status. Voice agent reads this to answer billing questions.
 *     parameters:
 *       - in: path
 *         name: orderNumber
 *         required: true
 *         schema:
 *           type: string
 *         example: '5001'
 *     responses:
 *       200:
 *         description: Payment details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 order_number:
 *                   type: string
 *                 total_amount:
 *                   type: number
 *                 payment_method:
 *                   type: string
 *                   enum: [card, cash]
 *                 payment_status:
 *                   type: string
 *                   enum: [paid, pending, refunded]
 *                 customer_name:
 *                   type: string
 *                 created_at:
 *                   type: string
 *                 message:
 *                   type: string
 *                   example: Order 5001 was paid by card — 12.50 JD, status paid.
 *       404:
 *         description: Order not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:orderNumber/payment', async (req, res) => {
  const { orderNumber } = req.params;
  const result = await db.execute({
    sql: `SELECT o.order_number, o.total_amount, o.payment_method, o.payment_status,
          o.created_at, c.name as customer_name
          FROM orders o JOIN customers c ON o.customer_id = c.id
          WHERE o.order_number = ?`,
    args: [orderNumber],
  });
  if (!result.rows.length) return res.status(404).json({ error: 'Order not found' });

  const row = result.rows[0];
  const message = row.payment_method === 'cash' && row.payment_status === 'pending'
    ? `Order ${row.order_number} is ${row.total_amount} JD, to be paid in cash on delivery.`
    : `Order ${row.order_number} was paid by ${row.payment_method} — ${row.total_amount} JD, status ${row.payment_status}.`;

  res.json({ ...row, message });
});

/**
 * @openapi
 * /api/orders/{orderNumber}/credits:
 *   get:
 *     tags: [Customer Intents]
 *     summary: Get customer credit balance from order number
 *     description: Resolves the customer from the order number and returns their full credit history and total balance.
 *     parameters:
 *       - in: path
 *         name: orderNumber
 *         required: true
 *         schema:
 *           type: string
 *         example: '5001'
 *     responses:
 *       200:
 *         description: Credit balance and history
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 customer_name:
 *                   type: string
 *                 customer_id:
 *                   type: integer
 *                 total:
 *                   type: number
 *                   example: 4.5
 *                 credits:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       amount:
 *                         type: number
 *                       reason:
 *                         type: string
 *                       created_at:
 *                         type: string
 *                 message:
 *                   type: string
 *                   example: Ahmad, you have 4.50 JD in store credit.
 *       404:
 *         description: Order not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:orderNumber/credits', async (req, res) => {
  const { orderNumber } = req.params;
  const orderResult = await db.execute({
    sql: `SELECT o.customer_id, c.name FROM orders o JOIN customers c ON o.customer_id = c.id WHERE o.order_number = ?`,
    args: [orderNumber],
  });
  if (!orderResult.rows.length) return res.status(404).json({ error: 'Order not found' });

  const { customer_id, name } = orderResult.rows[0];

  const [credits, total] = await Promise.all([
    db.execute({
      sql: 'SELECT id, amount, reason, order_id, created_at FROM credits WHERE customer_id = ? ORDER BY created_at DESC',
      args: [customer_id],
    }),
    db.execute({
      sql: 'SELECT COALESCE(SUM(amount),0) as total FROM credits WHERE customer_id = ?',
      args: [customer_id],
    }),
  ]);

  const totalAmount = total.rows[0].total;
  const message = totalAmount > 0
    ? `${name}, you have ${totalAmount.toFixed(2)} JD in store credit.`
    : `${name}, you currently have no store credit.`;

  res.json({ customer_name: name, customer_id, total: totalAmount, credits: credits.rows, message });
});

/**
 * @openapi
 * /api/orders/{orderNumber}/credit:
 *   post:
 *     tags: [Customer Intents]
 *     summary: Issue store credit via order number
 *     description: |
 *       Issues store credit to the customer linked to this order.
 *       Used when reporting a missing or wrong item — no customer ID needed.
 *     parameters:
 *       - in: path
 *         name: orderNumber
 *         required: true
 *         schema:
 *           type: string
 *         example: '5001'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount, reason]
 *             properties:
 *               amount:
 *                 type: number
 *                 example: 2.50
 *               reason:
 *                 type: string
 *                 example: Compensation for missing white cheese
 *     responses:
 *       200:
 *         description: Credit issued
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 credited_amount:
 *                   type: number
 *                 total_credits:
 *                   type: number
 *                 customer_name:
 *                   type: string
 *                 message:
 *                   type: string
 *       400:
 *         description: Missing required fields
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
router.post('/:orderNumber/credit', async (req, res) => {
  const { orderNumber } = req.params;
  const { amount, reason } = req.body;

  if (!amount || !reason) return res.status(400).json({ error: 'amount and reason are required' });

  const orderResult = await db.execute({
    sql: `SELECT o.id, o.customer_id, c.name FROM orders o JOIN customers c ON o.customer_id = c.id WHERE o.order_number = ?`,
    args: [orderNumber],
  });
  if (!orderResult.rows.length) return res.status(404).json({ error: 'Order not found' });

  const { id: order_id, customer_id, name } = orderResult.rows[0];

  await db.execute({
    sql: 'INSERT INTO credits (customer_id, amount, reason, order_id) VALUES (?, ?, ?, ?)',
    args: [customer_id, amount, reason, order_id],
  });

  const total = await db.execute({
    sql: 'SELECT COALESCE(SUM(amount),0) as total FROM credits WHERE customer_id = ?',
    args: [customer_id],
  });

  res.json({
    success: true,
    credited_amount: amount,
    total_credits: total.rows[0].total,
    customer_name: name,
    message: `${amount} JD store credit has been added to ${name}'s account for order ${orderNumber}.`,
  });
});

/**
 * @openapi
 * /api/orders/{orderNumber}/ticket:
 *   post:
 *     tags: [Customer Intents]
 *     summary: Create a support ticket for an order
 *     description: |
 *       Opens a support ticket linked to this order. No customer ID needed.
 *       Common categories: missing_item, wrong_item, quality_concern, refund_request, late_delivery, other.
 *     parameters:
 *       - in: path
 *         name: orderNumber
 *         required: true
 *         schema:
 *           type: string
 *         example: '5001'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [category, description]
 *             properties:
 *               category:
 *                 type: string
 *                 enum: [missing_item, wrong_item, quality_concern, refund_request, late_delivery, other]
 *                 example: missing_item
 *               description:
 *                 type: string
 *                 example: White cheese was missing from the bag
 *               priority:
 *                 type: string
 *                 enum: [normal, high]
 *                 default: normal
 *     responses:
 *       201:
 *         description: Ticket created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 ticket_number:
 *                   type: string
 *                   example: T2001
 *                 message:
 *                   type: string
 *                   example: Ticket T2001 has been opened for order 5001. Our team will follow up shortly.
 *       400:
 *         description: Missing required fields
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
router.post('/:orderNumber/ticket', async (req, res) => {
  const { orderNumber } = req.params;
  const { category, description, priority = 'normal' } = req.body;

  if (!category || !description) return res.status(400).json({ error: 'category and description are required' });

  const orderResult = await db.execute({
    sql: 'SELECT id, customer_id FROM orders WHERE order_number = ?',
    args: [orderNumber],
  });
  if (!orderResult.rows.length) return res.status(404).json({ error: 'Order not found' });

  const { id: order_id, customer_id } = orderResult.rows[0];

  const countResult = await db.execute({
    sql: `SELECT COUNT(*) as cnt FROM tickets`,
    args: [],
  });
  const ticketNumber = `T${2000 + countResult.rows[0].cnt + 1}`;

  await db.execute({
    sql: `INSERT INTO tickets (ticket_number, order_id, caller_type, caller_id, category, description, priority)
          VALUES (?, ?, 'customer', ?, ?, ?, ?)`,
    args: [ticketNumber, order_id, customer_id, category, description, priority],
  });

  res.status(201).json({
    success: true,
    ticket_number: ticketNumber,
    message: `Ticket ${ticketNumber} has been opened for order ${orderNumber}. Our team will follow up shortly.`,
  });
});

/**
 * @openapi
 * /api/orders/{orderNumber}/tickets:
 *   get:
 *     tags: [Customer Intents]
 *     summary: List all tickets for an order
 *     description: Returns all support tickets linked to this order number, newest first.
 *     parameters:
 *       - in: path
 *         name: orderNumber
 *         required: true
 *         schema:
 *           type: string
 *         example: '5001'
 *     responses:
 *       200:
 *         description: List of tickets
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 order_number:
 *                   type: string
 *                 tickets:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       ticket_number:
 *                         type: string
 *                       category:
 *                         type: string
 *                       status:
 *                         type: string
 *                       priority:
 *                         type: string
 *                       description:
 *                         type: string
 *                       created_at:
 *                         type: string
 *       404:
 *         description: Order not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:orderNumber/tickets', async (req, res) => {
  const { orderNumber } = req.params;
  const orderResult = await db.execute({
    sql: 'SELECT id FROM orders WHERE order_number = ?',
    args: [orderNumber],
  });
  if (!orderResult.rows.length) return res.status(404).json({ error: 'Order not found' });

  const tickets = await db.execute({
    sql: `SELECT ticket_number, category, status, priority, description, created_at
          FROM tickets WHERE order_id = ? ORDER BY created_at DESC`,
    args: [orderResult.rows[0].id],
  });

  res.json({ order_number: orderNumber, tickets: tickets.rows });
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
