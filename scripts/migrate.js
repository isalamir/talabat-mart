import '../src/env.js';
import { createSchema } from '../src/schema.js';
import { seedData } from '../src/seed.js';

console.log('Running migration...');
await createSchema();
await seedData();
console.log('Done.');
process.exit(0);
