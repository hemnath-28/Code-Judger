import mongoose from 'mongoose';
import { createApp } from './app.js';
import { connectDatabase } from './config/database.js';
import { env } from './config/env.js';
import { redisClient } from './config/redis.js';
import { initPool, shutdownPool } from './modules/services/pool.service.js';
import { submissionQueue } from './modules/queues/submission.queue.js';
import { submissionWorker } from './modules/workers/submission.worker.js';
import {
  startBatchWriteInterval,
  stopBatchWriteInterval,
  flushSubmissionsBatch
} from './modules/services/batchWrite.service.js';

// 1. Establish database connection
await connectDatabase();

// 2. Initialize warm docker container pool
await initPool();

// 3. Start periodic MongoDB batch write service (ticks every 5 seconds)
startBatchWriteInterval();

// 4. Initialize Express App
const app = createApp();
const server = app.listen(env.port, () => {
  console.log(`Coding backend listening on port ${env.port}`);
});

// 5. Coordinated Graceful Shutdown
let isShuttingDown = false;

async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\nReceived ${signal}. Starting coordinated graceful shutdown...`);

  // A. Stop accepting new HTTP requests
  server.close(() => {
    console.log('HTTP server closed.');
  });

  // B. Stop batch flusher and flush remaining logs
  stopBatchWriteInterval();
  console.log('Flushing final submissions to MongoDB...');
  await flushSubmissionsBatch();

  // C. Close BullMQ worker
  console.log('Closing BullMQ worker...');
  await submissionWorker.close();

  // D. Close BullMQ queue
  console.log('Closing BullMQ queue...');
  await submissionQueue.close();

  // E. Stop docker containers
  await shutdownPool();

  // F. Close Redis client
  console.log('Disconnecting Redis Client...');
  await redisClient.quit();

  // G. Close MongoDB connection
  console.log('Closing MongoDB connection...');
  await mongoose.connection.close();

  console.log('Graceful shutdown completed successfully. Exiting.');
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGUSR2', () => gracefulShutdown('SIGUSR2'));

