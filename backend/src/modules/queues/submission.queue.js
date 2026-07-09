import { Queue } from 'bullmq';
import { bullDbConnection } from '../../config/redis.js';

export const submissionQueue = new Queue('submissionQueue', {
  connection: bullDbConnection
});

export async function addSubmissionJob({ submissionId, problemId, language, code, userId }) {
  await submissionQueue.add('execute-submission', {
    submissionId,
    problemId,
    language,
    code,
    userId
  });
}
