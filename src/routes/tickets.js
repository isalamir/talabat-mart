import { Router } from 'express';
import { db } from '../db.js';

const router = Router();

/**
 * @openapi
 * /api/tickets:
 *   post:
 *     tags: [Tickets]
 *     summary: Create a support ticket
 *     description: |
 *       Creates a ticket with full context of the voice call. The transcript field should contain
 *       the full conversation log so human agents never have to ask the caller to repeat themselves.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [caller_type, caller_id, category, description]
 *             properties:
 *               order_id:
 *                 type: integer
 *                 nullable: true
 *                 example: 5001
 *               caller_type:
 *                 type: string
 *                 enum: [customer, store_staff, rider]
 *                 example: customer
 *               caller_id:
 *                 type: integer
 *                 example: 6001
 *               category:
 *                 type: string
 *                 example: missing_item
 *                 description: "One of: missing_item, wrong_item, refund_request, quality_concern, payment_issue, inventory_error, tablet_issue, rider_delay, customer_unreachable, order_damaged, earnings_question, account_issue"
 *               description:
 *                 type: string
 *                 example: Ahmad reports white cheese missing from order 5001
 *               priority:
 *                 type: string
 *                 enum: [normal, high]
 *                 default: normal
 *               transcript:
 *                 type: string
 *                 nullable: true
 *                 example: "Agent: Hello... Customer: My order is missing an item..."
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
 *                   example: T1009
 *       400:
 *         description: Missing required fields
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/', async (req, res) => {
  const { order_id, caller_type, caller_id, category, description, priority, transcript } = req.body;

  if (!caller_type || !caller_id || !category || !description) {
    return res.status(400).json({ error: 'caller_type, caller_id, category, description are required' });
  }

  const count = await db.execute({ sql: 'SELECT COUNT(*) as c FROM tickets', args: [] });
  const ticketNumber = `T${String(count.rows[0].c + 1).padStart(4, '0')}`;

  await db.execute({
    sql: `INSERT INTO tickets (ticket_number, order_id, caller_type, caller_id, category, description, priority, transcript)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      ticketNumber,
      order_id || null,
      caller_type,
      caller_id,
      category,
      description,
      priority || 'normal',
      transcript || null,
    ],
  });

  res.status(201).json({ success: true, ticket_number: ticketNumber });
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
 * /api/tickets/{ticketNumber}:
 *   get:
 *     tags: [Tickets]
 *     summary: Get a ticket by number
 *     parameters:
 *       - in: path
 *         name: ticketNumber
 *         required: true
 *         schema:
 *           type: string
 *         example: T1001
 *     responses:
 *       200:
 *         description: Ticket details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Ticket'
 *       404:
 *         description: Ticket not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:ticketNumber', async (req, res) => {
  const result = await db.execute({
    sql: 'SELECT * FROM tickets WHERE ticket_number = ?',
    args: [req.params.ticketNumber],
  });

  if (!result.rows.length) return res.status(404).json({ error: 'Ticket not found' });
  res.json(result.rows[0]);
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
