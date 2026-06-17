import { Router } from 'express';
import { db } from '../db.js';
import { normalizePhone } from '../utils/phone.js';

const router = Router();

/**
 * @openapi
 * /api/identity/identify:
 *   get:
 *     tags: [Identity]
 *     summary: Identify a caller by phone number or store ID
 *     description: |
 *       Pass `phone` to identify an individual caller across customers, store staff, and riders.
 *       Pass `store_id` (4-digit) to look up a store and all its staff — useful when
 *       the caller's phone is not registered but they state their store ID.
 *       Accepts any Jordanian phone format (0790…, +962790…, 00962790…).
 *     parameters:
 *       - in: query
 *         name: phone
 *         required: false
 *         schema:
 *           type: string
 *         example: '0790520759'
 *         description: Caller phone — any Jordan format
 *       - in: query
 *         name: store_id
 *         required: false
 *         schema:
 *           type: string
 *         example: '1001'
 *         description: 4-digit store ID (alternative to phone for staff)
 *     responses:
 *       200:
 *         description: Caller identified
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 type:
 *                   type: string
 *                   enum: [customer, store_staff, rider]
 *                   example: customer
 *                 data:
 *                   type: object
 *                   description: Full profile with contextual data (orders/inventory/dispatch)
 *             examples:
 *               customer:
 *                 summary: Customer identified
 *                 value:
 *                   type: customer
 *                   data:
 *                     id: 1
 *                     name: Ahmed Al-Rashid
 *                     phone: '+971501234567'
 *                     address: 'Dubai Marina, Building 5, Apt 302'
 *                     wallet_credits: 30
 *                     recent_orders: []
 *               rider:
 *                 summary: Rider identified
 *                 value:
 *                   type: rider
 *                   data:
 *                     id: 1
 *                     name: Raj Kumar
 *                     status: on_delivery
 *                     current_order: null
 *       400:
 *         description: Missing phone parameter
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Caller not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                 authenticated:
 *                   type: boolean
 *                   example: false
 */
router.get('/identify', async (req, res) => {
  const { phone, store_id } = req.query;

  // Store-level lookup — returns all staff + inventory for the store
  if (store_id && !phone) {
    const [staff, inventory] = await Promise.all([
      db.execute({ sql: 'SELECT * FROM store_staff WHERE store_id = ?', args: [store_id] }),
      db.execute({ sql: 'SELECT * FROM inventory WHERE store_id = ?', args: [store_id] }),
    ]);
    if (!staff.rows.length) {
      return res.status(404).json({ error: 'Store not found', authenticated: false });
    }
    return res.json({
      type: 'store',
      data: { store_id, staff: staff.rows, inventory: inventory.rows },
    });
  }

  if (!phone) return res.status(400).json({ error: 'phone or store_id is required' });

  const normalized = normalizePhone(phone);

  const [customer, staff, rider] = await Promise.all([
    db.execute({ sql: 'SELECT * FROM customers WHERE phone = ?', args: [normalized] }),
    db.execute({ sql: 'SELECT * FROM store_staff WHERE phone = ?', args: [normalized] }),
    db.execute({ sql: 'SELECT * FROM riders WHERE phone = ?', args: [normalized] }),
  ]);

  if (customer.rows.length) {
    const c = customer.rows[0];
    const orders = await db.execute({
      sql: 'SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC LIMIT 5',
      args: [c.id],
    });
    const credits = await db.execute({
      sql: 'SELECT COALESCE(SUM(amount),0) as total FROM credits WHERE customer_id = ?',
      args: [c.id],
    });
    return res.json({
      type: 'customer',
      data: { ...c, recent_orders: orders.rows, wallet_credits: credits.rows[0].total },
    });
  }

  if (staff.rows.length) {
    const s = staff.rows[0];
    const inventory = await db.execute({
      sql: 'SELECT * FROM inventory WHERE store_id = ?',
      args: [s.store_id],
    });
    return res.json({
      type: 'store_staff',
      data: { ...s, inventory: inventory.rows },
    });
  }

  if (rider.rows.length) {
    const r = rider.rows[0];
    let currentOrder = null;
    if (r.current_order_id) {
      const o = await db.execute({
        sql: 'SELECT * FROM orders WHERE id = ?',
        args: [r.current_order_id],
      });
      currentOrder = o.rows[0] || null;
    }
    return res.json({
      type: 'rider',
      data: { ...r, current_order: currentOrder },
    });
  }

  return res.status(404).json({ error: 'Caller not found', authenticated: false });
});

/**
 * @openapi
 * /api/identity/identify/order:
 *   get:
 *     tags: [Identity]
 *     summary: Identify a customer by order number (fallback)
 *     description: Used when the phone number is not registered — the agent asks the caller for their order number instead.
 *     parameters:
 *       - in: query
 *         name: order_number
 *         required: true
 *         schema:
 *           type: string
 *         example: ORD-2024-001
 *     responses:
 *       200:
 *         description: Customer identified via order
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 type:
 *                   type: string
 *                   example: customer
 *                 data:
 *                   $ref: '#/components/schemas/Order'
 *       400:
 *         description: Missing order_number
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
router.get('/identify/order', async (req, res) => {
  const { order_number } = req.query;
  if (!order_number) return res.status(400).json({ error: 'order_number is required' });

  const order = await db.execute({
    sql: 'SELECT o.*, c.name, c.phone, c.address FROM orders o JOIN customers c ON o.customer_id = c.id WHERE o.order_number = ?',
    args: [order_number],
  });

  if (!order.rows.length) return res.status(404).json({ error: 'Order not found' });
  res.json({ type: 'customer', data: order.rows[0] });
});

export default router;
