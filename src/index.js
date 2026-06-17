import './env.js';
import app from './app.js';
import { createSchema } from './schema.js';
import { seedData } from './seed.js';

const PORT = process.env.PORT || 3000;

async function start() {
  await createSchema();
  await seedData();
  app.listen(PORT, () => {
    console.log(`Talabat Mart Voice Agent API running on http://localhost:${PORT}`);
  });
}

start().catch(console.error);
