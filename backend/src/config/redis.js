import { createClient } from 'redis';
import { env } from './env.js';

export const redisClient = createClient({
  url: `redis://${env.redis.host}:${env.redis.port}`
});

redisClient.on('error', (err) => {
  console.error('Redis Client Error:', err);
});

await redisClient.connect();
console.log('Successfully connected to Redis using node-redis.');

// Connection config for BullMQ (which uses ioredis internally)
export const bullDbConnection = {
  host: env.redis.host,
  port: env.redis.port,
  maxRetriesPerRequest: null
};
