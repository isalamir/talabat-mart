import { Router } from 'express';
import { db } from '../db.js';
import { normalizePhone } from '../utils/phone.js';

const router = Router();

/**
 * @openapi
 * /api/tickets:
 *   post:
 *     tags: [Tickets]
 *     summary: Create a support ticket
 *     description: |
 *       Creates a ticket from a voice call. All fields are optional — pass whatever context
 *       the agent has. `order_number` is resolved to an order automatically if provided.
 *       `phone` does not need to belong to a registered customer.
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               order_number:
 *                 type: string
 *                 nullable: true
 *                 example: '5101'
 *               phone:
 *                 type: string
 *                 nullable: true
 *                 description: Caller phone in any Jordanian format. Does not need to be a registered customer.
 *                 example: '0795000001'
 *               name:
 *                 type: string
 *                 nullable: true
 *                 example: Ismail Hammo
 *               category:
 *                 type: string
 *                 nullable: true
 *                 description: Free-text category — any string is accepted.
 *                 example: missing_item
 *               description:
 *                 type: string
 *                 nullable: true
 *                 example: White cheese was missing from the bag
 *               priority:
 *                 type: string
 *                 enum: [normal, high]
 *                 default: normal
 *               transcript:
 *                 type: string
 *                 nullable: true
 *                 example: "Agent: أهلاً، كيف أقدر أساعدك؟\nCustomer: الجبنة مش موجودة"
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
 *                 order_number:
 *                   type: string
 *                   nullable: true
 *                 customer_id:
 *                   type: integer
 *                   nullable: true
 *                   description: Resolved from order_number if the order exists in the database
 */
router.post('/', async (req, res) => {
  const {
    order_number,
    phone,
    name,
    category,
    description,
    priority,
    transcript,
  } = req.body;

  // Resolve order and customer from order_number if provided
  let order_id = null;
  let customer_id = null;
  let resolvedOrderNumber = null;

  if (order_number) {
    const orderResult = await db.execute({
      sql: 'SELECT id, customer_id, order_number FROM orders WHERE order_number = ?',
      args: [order_number],
    });
    if (orderResult.rows.length) {
      order_id = orderResult.rows[0].id;
      customer_id = orderResult.rows[0].customer_id;
      resolvedOrderNumber = orderResult.rows[0].order_number;
    }
  }

  const normalizedPhone = phone ? normalizePhone(phone) : null;

  const count = await db.execute({ sql: 'SELECT COUNT(*) as c FROM tickets', args: [] });
  const ticketNumber = `T${String(count.rows[0].c + 1).padStart(4, '0')}`;

  await db.execute({
    sql: `INSERT INTO tickets
            (ticket_number, order_id, caller_type, caller_id, caller_phone, caller_name, category, description, priority, transcript)
          VALUES (?, ?, 'customer', ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      ticketNumber,
      order_id,
      customer_id,
      normalizedPhone,
      name || null,
      category || null,
      description || null,
      priority || 'normal',
      transcript || null,
    ],
  });

  res.status(201).json({
    success: true,
    ticket_number: ticketNumber,
    order_number: resolvedOrderNumber,
    customer_id,
  });
});

/**
 * @openapi
 * /api/tickets:
 *   get:
 *     tags: [Tickets]
 *     summary: List tickets
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [open, resolved, escalated]
 *       - in: query
 *         name: caller_type
 *         schema:
 *           type: string
 *           enum: [customer, store_staff, rider]
 *       - in: query
 *         name: priority
 *         schema:
 *           type: string
 *           enum: [normal, high]
 *     responses:
 *       200:
 *         description: List of tickets
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Ticket'
 */
router.get('/', async (req, res) => {
  const { status, caller_type, priority } = req.query;
  let sql = 'SELECT * FROM tickets WHERE 1=1';
  const args = [];

  if (status) { sql += ' AND status = ?'; args.push(status); }
  if (caller_type) { sql += ' AND caller_type = ?'; args.push(caller_type); }
  if (priority) { sql += ' AND priority = ?'; args.push(priority); }

  sql += ' ORDER BY created_at DESC';
  const result = await db.execute({ sql, args });
  res.json(result.rows);
});

/**
 * @openapi
 * /api/tickets/caller/{caller_type}/{caller_id}:
 *   get:
 *     tags: [Tickets]
 *     summary: Get all tickets for a caller
 *     description: |
 *       Returns all tickets raised by a specific customer, store staff member, or rider.
 *       Use this after identity to show the caller their open issues without asking for a ticket number.
 *     parameters:
 *       - in: path
 *         name: caller_type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [customer, store_staff, rider]
 *         example: customer
 *       - in: path
 *         name: caller_id
 *         required: true
 *         schema:
 *           type: integer
 *         example: 6001
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [open, resolved, escalated]
 *         description: Optionally filter by ticket status
 *     responses:
 *       200:
 *         description: List of tickets for this caller
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Ticket'
 */
router.get('/caller/:caller_type/:caller_id', async (req, res) => {
  const { caller_type, caller_id } = req.params;
  const { status } = req.query;

  let sql = 'SELECT * FROM tickets WHERE caller_type = ? AND caller_id = ?';
  const args = [caller_type, caller_id];

  if (status) { sql += ' AND status = ?'; args.push(status); }
  sql += ' ORDER BY created_at DESC';

  const result = await db.execute({ sql, args });
  res.json(result.rows);
});

/**
 * @openapi
 * /api/tickets/{identifier}:
 *   get:
 *     tags: [Tickets]
 *     summary: Get ticket(s) by ticket number or phone number
 *     description: |
 *       Pass either a ticket number (e.g. `T1001`) or a phone number (any Jordanian format).
 *       - **Ticket number** → returns a single ticket object.
 *       - **Phone number** → returns all tickets linked to that phone (registered customer or caller_phone), newest first.
 *     parameters:
 *       - in: path
 *         name: identifier
 *         required: true
 *         schema:
 *           type: string
 *         examples:
 *           ticket:
 *             summary: By ticket number
 *             value: T1001
 *           phone:
 *             summary: By phone number
 *             value: '0795000001'
 *     responses:
 *       200:
 *         description: Ticket or list of tickets
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - $ref: '#/components/schemas/Ticket'
 *                 - type: array
 *                   items:
 *                     $ref: '#/components/schemas/Ticket'
 *       404:
 *         description: Ticket not found / no tickets for this phone
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:identifier', async (req, res) => {
  const { identifier } = req.params;

  // Ticket number — starts with a letter (e.g. T1001)
  if (/^[A-Za-z]/i.test(identifier)) {
    const result = await db.execute({
      sql: 'SELECT * FROM tickets WHERE ticket_number = ?',
      args: [identifier],
    });
    if (!result.rows.length) return res.status(404).json({ error: 'Ticket not found' });
    return res.json(result.rows[0]);
  }

  // Phone number — normalize and look up by caller_phone OR registered customer
  const normalized = normalizePhone(identifier);

  const customer = await db.execute({
    sql: 'SELECT id FROM customers WHERE phone = ?',
    args: [normalized],
  });

  let sql, args;
  if (customer.rows.length) {
    const customer_id = customer.rows[0].id;
    // Match by stored caller_phone OR by customer_id (for tickets created before phone was captured)
    sql = `SELECT * FROM tickets
           WHERE caller_phone = ? OR (caller_type = 'customer' AND caller_id = ?)
           ORDER BY created_at DESC`;
    args = [normalized, customer_id];
  } else {
    sql = 'SELECT * FROM tickets WHERE caller_phone = ? ORDER BY created_at DESC';
    args = [normalized];
  }

  const result = await db.execute({ sql, args });
  if (!result.rows.length) return res.status(404).json({ error: 'No tickets found for this phone number' });
  return res.json(result.rows);
});

/**
 * @openapi
 * /api/tickets/{ticketNumber}:
 *   patch:
 *     tags: [Tickets]
 *     summary: Update a ticket status
 *     parameters:
 *       - in: path
 *         name: ticketNumber
 *         required: true
 *         schema:
 *           type: string
 *         example: T1001
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [open, resolved, escalated]
 *               resolved_by:
 *                 type: string
 *                 example: human-agent-sarah
 *     responses:
 *       200:
 *         description: Ticket updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 */
router.patch('/:ticketNumber', async (req, res) => {
  const { status, resolved_by } = req.body;

  await db.execute({
    sql: `UPDATE tickets SET status = ?, resolved_by = ?, updated_at = datetime('now') WHERE ticket_number = ?`,
    args: [status, resolved_by || null, req.params.ticketNumber],
  });

  res.json({ success: true });
});

/**
 * @openapi
 * /api/tickets/{ticketNumber}/escalate:
 *   post:
 *     tags: [Tickets]
 *     summary: Escalate a ticket to a human agent
 *     description: |
 *       Marks the ticket as escalated and attaches the call summary and full transcript.
 *       The receiving human agent gets full context and never needs to ask the caller to repeat.
 *     parameters:
 *       - in: path
 *         name: ticketNumber
 *         required: true
 *         schema:
 *           type: string
 *         example: T1001
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               summary:
 *                 type: string
 *                 example: Customer reports quality issue with produce. Offered credit but customer insisted on speaking to a manager.
 *               transcript:
 *                 type: string
 *                 example: "Agent: Hello... Customer: I want to speak to a manager..."
 *               team:
 *                 type: string
 *                 example: quality-team
 *     responses:
 *       200:
 *         description: Escalated successfully
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
router.post('/:ticketNumber/escalate', async (req, res) => {
  const { summary, transcript, team } = req.body;

  await db.execute({
    sql: `UPDATE tickets SET status = 'escalated', description = description || '\n\nEscalation Summary: ' || ?,
          transcript = ?, updated_at = datetime('now') WHERE ticket_number = ?`,
    args: [summary || '', transcript || null, req.params.ticketNumber],
  });

  res.json({
    success: true,
    message: `Call escalated to ${team || 'human agent'} with full transcript`,
  });
});

export default router;
