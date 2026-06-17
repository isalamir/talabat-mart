import { Router } from 'express';

const router = Router();

/**
 * @openapi
 * /api/notifications/sms:
 *   post:
 *     tags: [Notifications]
 *     summary: Send an SMS to a customer (mocked)
 *     description: Mocked SMS gateway — logs the message to console and returns a success response. Wire this to Twilio or your SMS provider in production.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [to, message]
 *             properties:
 *               to:
 *                 type: string
 *                 example: '+971501234567'
 *               message:
 *                 type: string
 *                 example: Your order ORD-2024-001 is on the way!
 *               order_number:
 *                 type: string
 *                 nullable: true
 *                 example: ORD-2024-001
 *     responses:
 *       200:
 *         description: SMS sent (mocked)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 mock:
 *                   type: boolean
 *                   example: true
 *                 to:
 *                   type: string
 *                 message:
 *                   type: string
 *                 sent_at:
 *                   type: string
 *                   format: date-time
 */
router.post('/sms', async (req, res) => {
  const { to, message, order_number } = req.body;
  if (!to || !message) return res.status(400).json({ error: 'to and message are required' });

  console.log(`[SMS] To: ${to} | Message: ${message}`);

  res.json({
    success: true,
    mock: true,
    to,
    message,
    order_number: order_number || null,
    sent_at: new Date().toISOString(),
  });
});

/**
 * @openapi
 * /api/notifications/swap-offer:
 *   post:
 *     tags: [Notifications]
 *     summary: Notify a customer of an item swap offer
 *     description: |
 *       Sends a mid-call SMS to the customer when a dark store item is out of stock.
 *       If a suggested_item is provided, the message offers a swap. Otherwise, it informs the customer the item was removed with a refund.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [customer_phone, original_item]
 *             properties:
 *               customer_phone:
 *                 type: string
 *                 example: '+971501234567'
 *               original_item:
 *                 type: string
 *                 example: Whole Milk 1L
 *               suggested_item:
 *                 type: string
 *                 nullable: true
 *                 example: Full Cream Milk 1L
 *               order_number:
 *                 type: string
 *                 example: ORD-2024-001
 *     responses:
 *       200:
 *         description: Swap offer SMS sent (mocked)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 mock:
 *                   type: boolean
 *                 to:
 *                   type: string
 *                 message:
 *                   type: string
 *                 sent_at:
 *                   type: string
 *       400:
 *         description: Missing required fields
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/swap-offer', async (req, res) => {
  const { customer_phone, original_item, suggested_item, order_number } = req.body;
  if (!customer_phone || !original_item) {
    return res.status(400).json({ error: 'customer_phone and original_item are required' });
  }

  const message = suggested_item
    ? `Hi! We're out of ${original_item} for order ${order_number}. We can swap it with ${suggested_item}. Reply YES to accept or NO to remove the item.`
    : `Hi! We're out of ${original_item} for order ${order_number}. We've removed it and will refund the amount to your account.`;

  console.log(`[SMS Swap Offer] To: ${customer_phone} | ${message}`);

  res.json({
    success: true,
    mock: true,
    to: customer_phone,
    message,
    sent_at: new Date().toISOString(),
  });
});

export default router;
