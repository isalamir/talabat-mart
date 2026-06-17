import './env.js';
import express from 'express';
import cors from 'cors';
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

// Serve Swagger UI from CDN — works on Vercel (no static file serving from node_modules)
app.get('/docs', (_, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html>
<head>
  <title>Talabat Mart Voice Agent API</title>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
</head>
<body>
<div id="swagger-ui"></div>
<script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
<script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-standalone-preset.js"></script>
<script>
window.onload = function() {
  SwaggerUIBundle({
    url: '/docs.json',
    dom_id: '#swagger-ui',
    presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
    layout: 'StandaloneLayout',
    defaultModelsExpandDepth: 1,
    defaultModelExpandDepth: 2,
  });
};
</script>
</body>
</html>`);
});
app.get('/docs.json', (_, res) => res.json(swaggerSpec));

app.get('/health', (_, res) => res.json({ status: 'ok', service: 'talabat-mart-voice-agent-api' }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

export default app;
