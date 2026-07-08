import { createApp } from './app.js';
import { connectDatabase } from './config/database.js';
import { env } from './config/env.js';
import { initPool } from './modules/services/pool.service.js';

await connectDatabase();
await initPool();

const app = createApp();
app.listen(env.port, () => {
  console.log(`Coding backend listening on port ${env.port}`);
});

