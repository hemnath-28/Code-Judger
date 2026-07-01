import { createApp } from './app.js';
import { connectDatabase } from './config/database.js';
import { env } from './config/env.js';

await connectDatabase();

const app = createApp();
app.listen(env.port, () => {
  console.log(`Coding backend listening on port ${env.port}`);
});
