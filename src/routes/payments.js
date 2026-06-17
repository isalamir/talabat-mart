import { Router } from 'express';
import { db } from '../db.js';

const router = Router();

/**
 * @openapi
 * /api/payments/order/{orderNumber}:
 *   get:
 *     tags: [Customer Intents]
 *     summary: Get payment details for an order
 *     description: Returns charge amount, payment method, and current payment status. Used to verify billing issues during a call.
 *     parameters:
 *       - in: path
 *         name: orderNumber
 *         required: true
 *         schema:
 *           type: string
 *         example: ORD-2024-001
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
 *                 payment_status:
 *                   type: string
 *                 created_at:
 *                   type: string
 *                 customer_name:
 *                   type: string
 *       404:
 *         description: Order not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/order/:orderNumber', async (req, res) => {
  const { orderNumber } = req.params;
  const result = await db.execute({
    sql: `SELECT o.order_number, o.total_amount, o.payment_method, o.payment_status,
          o.created_at, c.name as customer_name
          FROM orders o JOIN customers c ON o.customer_id = c.id
          WHERE o.order_number = ?`,
    args: [orderNumber],
  });

  if (!result.rows.length) return res.status(404).json({ error: 'Order not found' });
  res.json(result.rows[0]);
});

/**
 * @openapi
 * /api/payments/refund:
 *   post:
 *     tags: [Customer Intents]
 *     summary: Process a refund
 *     description: |
 *       Initiates a refund for an order. Blocked if the order is already refunded or if it's a cash
 *       order that hasn't been delivered yet.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [order_number, reason]
 *             properties:
 *               order_number:
 *                 type: string
 *                 example: ORD-2024-005
 *               reason:
 *                 type: string
 *                 example: Order cancelled before packing
 *     responses:
 *       200:
 *         description: Refund processed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 refund_amount:
 *                   type: number
 *                   example: 27.00
 *                 payment_method:
 *                   type: string
 *                 message:
 *                   type: string
 *                   example: Refund of AED 27.00 initiated successfully
 *       400:
 *         description: Validation error (e.g. cash order not yet delivered)
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
router.post('/refund', async (req, res) => {
  const { order_number, reason } = req.body;
  if (!order_number || !reason) {
    return res.status(400).json({ error: 'order_number and reason are required' });
  }

  const orderResult = await db.execute({
    sql: 'SELECT * FROM orders WHERE order_number = ?',
    args: [order_number],
  });

  if (!orderResult.rows.length) return res.status(404).json({ error: 'Order not found' });

  const order = orderResult.rows[0];

  if (order.payment_status === 'refunded') {
    return res.status(409).json({ error: 'Order already refunded' });
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
    args: [order_number],
  });

  res.json({
    success: true,
    refund_amount: order.total_amount,
    payment_method: order.payment_method,
    message: `Refund of AED ${order.total_amount} initiated successfully`,
  });
});

/**
 * @openapi
 * /api/payments/credit:
 *   post:
 *     tags: [Customer Intents]
 *     summary: Issue store credit to a customer
 *     description: Used when a customer reports a missing or wrong item — agent issues a credit without needing full escalation.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [customer_id, amount, reason]
 *             properties:
 *               customer_id:
 *                 type: integer
 *                 example: 1
 *               amount:
 *                 type: number
 *                 example: 15.00
 *               reason:
 *                 type: string
 *                 example: Missing item compensation - Whey Protein
 *               order_id:
 *                 type: integer
 *                 nullable: true
 *                 example: 1
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
 *                 message:
 *                   type: string
 *       400:
 *         description: Missing required fields
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/credit', async (req, res) => {
  const { customer_id, amount, reason, order_id } = req.body;
  if (!customer_id || !amount || !reason) {
    return res.status(400).json({ error: 'customer_id, amount, and reason are required' });
  }

  await db.execute({
    sql: 'INSERT INTO credits (customer_id, amount, reason, order_id) VALUES (?, ?, ?, ?)',
    args: [customer_id, amount, reason, order_id || null],
  });

  const total = await db.execute({
    sql: 'SELECT COALESCE(SUM(amount),0) as total FROM credits WHERE customer_id = ?',
    args: [customer_id],
  });

  res.json({
    success: true,
    credited_amount: amount,
    total_credits: total.rows[0].total,
    message: `AED ${amount} credit added to customer account`,
  });
});

/**
 * @openapi
 * /api/payments/credits/{customerId}:
 *   get:
 *     tags: [Customer Intents]
 *     summary: Get credit balance and history for a customer
 *     parameters:
 *       - in: path
 *         name: customerId
 *         required: true
 *         schema:
 *           type: integer
 *         example: 1
 *     responses:
 *       200:
 *         description: Credit history and total
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total:
 *                   type: number
 *                   example: 30.00
 *                 credits:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       amount:
 *                         type: number
 *                       reason:
 *                         type: string
 *                       created_at:
 *                         type: string
 */
router.get('/credits/:customerId', async (req, res) => {
  const { customerId } = req.params;
  const result = await db.execute({
    sql: 'SELECT * FROM credits WHERE customer_id = ? ORDER BY created_at DESC',
    args: [customerId],
  });
  const total = await db.execute({
    sql: 'SELECT COALESCE(SUM(amount),0) as total FROM credits WHERE customer_id = ?',
    args: [customerId],
  });
  res.json({ credits: result.rows, total: total.rows[0].total });
});

export default router;
