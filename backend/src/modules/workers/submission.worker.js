import { Worker } from 'bullmq';
import { redisClient, bullDbConnection } from '../../config/redis.js';
import { judgeSubmission } from '../services/submission.service.js';

export const submissionWorker = new Worker(
  'submissionQueue',
  async (job) => {
    const { submissionId, problemId, language, code, userId } = job.data;
    console.log(`Worker processing submission: ${submissionId}`);

    try {
      // 1. Update status to Processing
      await redisClient.set(
        `sub:status:${submissionId}`,
        JSON.stringify({ status: 'Processing' }),
        { EX: 600 } // 10 minutes TTL
      );

      // 2. Run the evaluation
      const { submissionDoc, result } = await judgeSubmission({
        submissionId,
        userId,
        problemId,
        language,
        code
      });

      // 3. Save completed result in Redis for polling
      await redisClient.set(
        `sub:status:${submissionId}`,
        JSON.stringify({ status: 'Completed', result }),
        { EX: 600 }
      );

      // 4. Push to batch write list in Redis
      await redisClient.lPush('mongo:write_queue', JSON.stringify(submissionDoc));
      console.log(`Successfully enqueued submission ${submissionId} to write queue.`);
    } catch (error) {
      console.error(`Error processing submission ${submissionId}:`, error);

      // Save failure state in Redis for polling
      const failedResult = {
        verdict: 'Runtime Error',
        passed: 0,
        total: 0,
        runtime: '0ms',
        submissionId,
        failedTest: {
          error: error.message || 'Execution failed'
        }
      };

      await redisClient.set(
        `sub:status:${submissionId}`,
        JSON.stringify({ status: 'Failed', result: failedResult }),
        { EX: 600 }
      );

      // Push failed doc to Mongo batch write queue
      const failedDoc = {
        _id: submissionId,
        userId,
        problemId,
        language,
        verdict: 'Runtime Error',
        passed: 0,
        total: 0,
        runtimeMs: 0,
        code,
        failedTest: failedResult.failedTest,
        submittedAt: new Date()
      };

      await redisClient.lPush('mongo:write_queue', JSON.stringify(failedDoc));
    }
  },
  {
    connection: bullDbConnection,
    concurrency: 150 // Limit concurrent job executions to 150
  }
);

submissionWorker.on('completed', (job) => {
  console.log(`Job ${job.id} completed successfully.`);
});

submissionWorker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed with {error:`, err);
});
