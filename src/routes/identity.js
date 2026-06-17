import { Router } from 'express';
import { db } from '../db.js';
import { normalizePhone } from '../utils/phone.js';

const router = Router();

/**
 * @openapi
 * /api/identity/:
 *   post:
 *     tags: [Identification]
 *     summary: Identify a caller
 *     description: |
 *       Identifies the caller by phone number, order number, or store ID.
 *       Phone is tried first (resolves to customer, store staff, or rider).
 *       `order_number` is a fallback when the phone is not registered.
 *       `store_id` returns all staff and inventory for that store.
 *       At least one identifier must be provided.
 *       Accepts any Jordanian phone format: `0790…`, `+962790…`, `00962790…`.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               phone:
 *                 type: string
 *                 example: '0790520759'
 *                 description: Caller phone — any Jordan format
 *               order_number:
 *                 type: string
 *                 example: '5001'
 *                 description: Order number fallback when phone is not registered
 *               store_id:
 *                 type: string
 *                 example: '1001'
 *                 description: 4-digit store ID (alternative to phone for staff)
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
 *                   enum: [customer, store_staff, rider, store]
 *                   example: customer
 *                 data:
 *                   type: object
 *                   description: Full profile with contextual data (orders/inventory/dispatch)
 *             examples:
 *               customer:
 *                 summary: Customer identified by phone
 *                 value:
 *                   type: customer
 *                   data:
 *                     id: 6001
 *                     name: Ahmad Khalid
 *                     phone: '+962790520759'
 *                     wallet_credits: 4.5
 *                     recent_orders: []
 *               rider:
 *                 summary: Rider identified by phone
 *                 value:
 *                   type: rider
 *                   data:
 *                     id: 7001
 *                     name: Samer Bataineh
 *                     status: on_delivery
 *                     current_order: null
 *               order:
 *                 summary: Customer identified by order number
 *                 value:
 *                   type: customer
 *                   data:
 *                     order_number: '5001'
 *                     name: Ahmad Khalid
 *               store:
 *                 summary: Store lookup by store_id
 *                 value:
 *                   type: store
 *                   data:
 *                     store_id: '1001'
 *                     staff: []
 *                     inventory: []
 *       400:
 *         description: No identifier provided
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
router.post('/', async (req, res) => {
  const { phone, store_id, order_number } = req.body;

  // Fallback: identify by order number
  if (order_number && !phone && !store_id) {
    const order = await db.execute({
      sql: 'SELECT o.*, c.name, c.phone, c.address FROM orders o JOIN customers c ON o.customer_id = c.id WHERE o.order_number = ?',
      args: [order_number],
    });
    if (!order.rows.length) return res.status(404).json({ error: 'Order not found' });
    return res.json({ type: 'customer', data: order.rows[0] });
  }

  // Store-level lookup
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

  if (!phone) return res.status(400).json({ error: 'phone, store_id, or order_number is required' });

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

export default router;
