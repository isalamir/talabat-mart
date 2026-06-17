import './env.js';
import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './swagger.js';
import identityRouter from './routes/identity.js';
import ordersRouter from './routes/orders.js';
import paymentsRouter from './routes/payments.js';
import inventoryRouter from './routes/inventory.js';
import dispatchRouter from './routes/dispatch.js';
import ticketsRouter from './routes/tickets.js';
import notificationsRouter from './routes/notifications.js';
import adminRouter from './routes/admin.js';

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/identity', identityRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/dispatch', dispatchRouter);
app.use('/api/tickets', ticketsRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/admin', adminRouter);

app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'Talabat Mart Voice Agent API',
  swaggerOptions: { defaultModelsExpandDepth: 1, defaultModelExpandDepth: 2 },
}));
app.get('/docs.json', (_, res) => res.json(swaggerSpec));

app.get('/health', (_, res) => res.json({ status: 'ok', service: 'talabat-mart-voice-agent-api' }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

export default app;
