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
    servers: [{ url: 'http://localhost:3000', description: 'Local dev' }],
    tags: [
      { name: 'Identity', description: 'Caller authentication and identification' },
      { name: 'Orders', description: 'Order management, status, and cancellations' },
      { name: 'Payments', description: 'Charge lookup, refunds, and store credits' },
      { name: 'Inventory', description: 'Dark store stock levels and availability' },
      { name: 'Dispatch', description: 'Rider tracking and assignment' },
      { name: 'Tickets', description: 'Support ticket creation and escalation' },
      { name: 'Notifications', description: 'SMS notifications to customers (mocked)' },
    ],
    components: {
      schemas: {
        Customer: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            name: { type: 'string', example: 'Ahmed Al-Rashid' },
            phone: { type: 'string', example: '+971501234567' },
            email: { type: 'string', example: 'ahmed@example.com' },
            address: { type: 'string', example: 'Dubai Marina, Building 5, Apt 302' },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        Order: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            order_number: { type: 'string', example: 'ORD-2024-001' },
            customer_id: { type: 'integer', example: 1 },
            rider_id: { type: 'integer', nullable: true, example: 1 },
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
            items: { type: 'string', description: 'JSON array of order items', example: '[{"name":"Whey Protein","qty":1,"price":89.99}]' },
            total_amount: { type: 'number', format: 'float', example: 100.99 },
            delivery_address: { type: 'string', example: 'Dubai Marina, Building 5, Apt 302' },
            eta_minutes: { type: 'integer', nullable: true, example: 12 },
            payment_method: { type: 'string', enum: ['card', 'cash'], example: 'card' },
            payment_status: { type: 'string', enum: ['paid', 'pending', 'refunded'], example: 'paid' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },
        Rider: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            name: { type: 'string', example: 'Raj Kumar' },
            phone: { type: 'string', example: '+971506666666' },
            status: { type: 'string', enum: ['available', 'on_delivery', 'offline'], example: 'on_delivery' },
            current_order_id: { type: 'integer', nullable: true },
            account_status: { type: 'string', enum: ['active', 'suspended'], example: 'active' },
            earnings_total: { type: 'number', format: 'float', example: 1250.5 },
          },
        },
        StoreStaff: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            name: { type: 'string', example: 'Mohammed Al-Zaabi' },
            phone: { type: 'string', example: '+971502222222' },
            store_id: { type: 'string', example: 'STORE-001' },
            role: { type: 'string', example: 'picker' },
            status: { type: 'string', example: 'active' },
          },
        },
        InventoryItem: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            store_id: { type: 'string', example: 'STORE-001' },
            item_name: { type: 'string', example: 'Whey Protein Concentrate 1kg' },
            sku: { type: 'string', example: 'WPC-001' },
            quantity: { type: 'integer', example: 5 },
            status: { type: 'string', enum: ['in_stock', 'out_of_stock'], example: 'in_stock' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },
        Ticket: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            ticket_number: { type: 'string', example: 'TKT-0001' },
            order_id: { type: 'integer', nullable: true },
            caller_type: { type: 'string', enum: ['customer', 'store_staff', 'rider'], example: 'customer' },
            caller_id: { type: 'integer', example: 1 },
            category: { type: 'string', example: 'missing_item' },
            description: { type: 'string', example: 'Whey protein missing from delivery bag' },
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
  apis: ['./src/routes/*.js'],
};

export const swaggerSpec = swaggerJsdoc(options);
