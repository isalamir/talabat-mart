import swaggerJsdoc from 'swagger-jsdoc';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Talabat Mart Voice Agent API',
      version: '1.0.0',
      description:
        'Mock backend for the Breez AI Voice Agent handling Talabat Mart call center flows — customers, store staff, and riders.',
    },
    servers: [{ url: 'https://talabat-mart.vercel.app', description: 'Production' }],
    tags: [
      { name: 'Identification', description: 'Identify any caller by phone, order number, or store ID — single unified endpoint' },
      { name: 'Customer Intents', description: 'Order tracking, cancellation, refunds, and store credits — called by customers' },
      { name: 'Store / Staff Intents', description: 'Inventory management and order packing updates — called by store staff' },
      { name: 'Rider Intents', description: 'Rider assignment, status, earnings, and unreachable reports — called by riders' },
      { name: 'Tickets', description: 'Support ticket creation, updates, and escalation — shared across all caller types' },
      { name: 'Admin / Debug', description: 'Full CRUD access to every table and database re-seed — for admin use only' },
      { name: 'Health', description: 'Service health check' },
    ],
    components: {
      schemas: {
        Customer: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 6001 },
            name: { type: 'string', example: 'Ahmad Khalid' },
            phone: { type: 'string', example: '+962790520759' },
            email: { type: 'string', example: 'ahmad.khalid@example.com' },
            address: { type: 'string', example: 'Amman, Khalda, Building 12, Apt 4' },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        Order: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 5001 },
            order_number: { type: 'string', example: '5001' },
            customer_id: { type: 'integer', example: 6001 },
            rider_id: { type: 'integer', nullable: true, example: 7001 },
            status: {
              type: 'string',
              enum: ['pending', 'preparing', 'out_for_delivery', 'delivered', 'cancelled'],
              example: 'out_for_delivery',
            },
            packing_stage: {
              type: 'string',
              enum: ['not_started', 'picking', 'packed'],
              example: 'packed',
            },
            items: { type: 'string', description: 'JSON array of order items', example: '[{"name":"Pita Bread","qty":2,"price":1.5}]' },
            total_amount: { type: 'number', format: 'float', example: 12.5 },
            delivery_address: { type: 'string', example: 'Amman, Khalda, Building 12, Apt 4' },
            eta_minutes: { type: 'integer', nullable: true, example: 15 },
            payment_method: { type: 'string', enum: ['card', 'cash'], example: 'card' },
            payment_status: { type: 'string', enum: ['paid', 'pending', 'refunded'], example: 'paid' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },
        Rider: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 7001 },
            name: { type: 'string', example: 'Samer Bataineh' },
            phone: { type: 'string', example: '+962796814523' },
            status: { type: 'string', enum: ['available', 'on_delivery', 'offline'], example: 'on_delivery' },
            current_order_id: { type: 'integer', nullable: true, example: 5001 },
            account_status: { type: 'string', enum: ['active', 'suspended'], example: 'active' },
            earnings_total: { type: 'number', format: 'float', example: 287.5 },
          },
        },
        StoreStaff: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 8001 },
            name: { type: 'string', example: 'Musa Hamdan' },
            phone: { type: 'string', example: '+962771529384' },
            store_id: { type: 'string', example: '1001' },
            role: { type: 'string', enum: ['supervisor', 'picker'], example: 'supervisor' },
          },
        },
        InventoryItem: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 9001 },
            store_id: { type: 'string', example: '1001' },
            item_name: { type: 'string', example: 'Pita Bread' },
            sku: { type: 'string', example: 'APITA1' },
            quantity: { type: 'integer', example: 50 },
            status: { type: 'string', enum: ['in_stock', 'out_of_stock'], example: 'in_stock' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },
        Ticket: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            ticket_number: { type: 'string', example: 'T1001' },
            order_id: { type: 'integer', nullable: true, example: 5001 },
            caller_type: { type: 'string', enum: ['customer', 'store_staff', 'rider'], example: 'customer' },
            caller_id: { type: 'integer', example: 6001 },
            category: { type: 'string', example: 'missing_item' },
            description: { type: 'string', example: 'White cheese missing from order 5001' },
            status: { type: 'string', enum: ['open', 'resolved', 'escalated'], example: 'open' },
            priority: { type: 'string', enum: ['normal', 'high'], example: 'normal' },
            transcript: { type: 'string', nullable: true },
            resolved_by: { type: 'string', nullable: true },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string', example: 'Order not found' },
          },
        },
      },
    },
  },
  apis: ['./src/routes/*.js', './src/app.js'],
};

export const swaggerSpec = swaggerJsdoc(options);
