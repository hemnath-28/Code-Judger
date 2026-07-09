import { redisClient } from '../../config/redis.js';
import { Submission } from '../models/submission.model.js';

let intervalId = null;

export async function flushSubmissionsBatch() {
  try {
    const queueLength = await redisClient.lLen('mongo:write_queue');
    if (queueLength === 0) return;

    const batchSize = Math.min(queueLength, 100);
    const multi = redisClient.multi();
    for (let i = 0; i < batchSize; i++) {
      multi.rPop('mongo:write_queue');
    }
    const results = await multi.exec();
    console.log("Multi Batch result:",results)
    
    const docs = results.filter(Boolean).map(item => JSON.parse(item));
    if (docs.length === 0) return;

    const bulkOps = docs.map(doc => ({
      updateOne: {
        filter: { _id: doc._id },
        update: { $set: doc },
        upsert: true
      }
    }));

    try {
      await Submission.bulkWrite(bulkOps);
      console.log(`[Batch Writer] Successfully flushed ${docs.length} submissions to MongoDB.`);
    } catch (dbError) {
      console.error('[Batch Writer] Failed to write batch to MongoDB. Restoring to Redis queue...', dbError);
      // Restore popped documents to prevent data loss
      for (const doc of docs) {
        try {
          await redisClient.lPush('mongo:write_queue', JSON.stringify(doc));
        } catch (pushErr) {
          console.error('[Batch Writer] Failed to restore document to queue:', pushErr, doc);
        }
      }
    }
  } catch (error) {
    console.error('[Batch Writer] Error during batch flush operation:', error);
  }
}

export function startBatchWriteInterval(intervalMs = 5000) {
  if (intervalId) return;
  console.log(`[Batch Writer] Starting MongoDB batch write service (interval: ${intervalMs}ms)...`);
  intervalId = setInterval(flushSubmissionsBatch, intervalMs);
}

export function stopBatchWriteInterval() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('[Batch Writer] Stopped MongoDB batch write service.');
  }
}
