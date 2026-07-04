import mongoose from 'mongoose';
import { executeCode } from './execution.service.js';
import { buildHarness } from './harness.service.js';
import { Problem } from '../models/problem.model.js';
import { Submission } from '../models/submission.model.js';
import { TestCase } from '../models/testCase.model.js';
import { apiError } from '../utils/apiError.js';
import { normalizeOutput } from '../utils/normalizeOutput.js';

export async function judgeSubmission({ userId, problemId, language, code }) {
  if (!mongoose.Types.ObjectId.isValid(problemId)) {
    throw apiError(400, 'Invalid problemId');
  }

  const problem = await Problem.findById(problemId).lean();
  if (!problem) {
    throw apiError(404, 'Problem not found');
  }

  const testCases = await TestCase.find({ problemId, isHidden: true })
    .sort({ order: 1, createdAt: 1 })
    .lean();

  if (testCases.length === 0) {
    throw apiError(409, 'No hidden test cases configured for this problem');
  }

  let verdict = 'Accepted';
  let passed = 0;
  let runtimeMs = 0;
  let failedTest = null;

  for (const testCase of testCases) {
    const execution = buildHarness({
      problem,
      language,
      code,
      input: testCase.input
    });

    const result = await executeCode({
      language,
      code: execution.code,
      input: execution.input,
      timeoutMs: problem.timeLimitMs,
      memoryLimitMb: problem.memoryLimitMb
    });

    runtimeMs += result.runtimeMs;

    if (!result.ok) {
      verdict = result.verdict;
      failedTest = {
        input: testCase.input,
        expectedOutput: testCase.expectedOutput,
        actualOutput: null,
        error: result.error
      };
      break;
    }

    const normActual = normalizeOutput(result.output);
    const normExpected = normalizeOutput(testCase.expectedOutput);

    if (normActual !== normExpected) {
      verdict = 'Wrong Answer';
      failedTest = {
        input: testCase.input,
        expectedOutput: testCase.expectedOutput,
        actualOutput: result.output,
        error: null
      };
      break;
    }

    passed += 1;
  }

  const submission = await Submission.create({
    userId,
    problemId,
    language,
    verdict,
    passed,
    total: testCases.length,
    runtimeMs,
    code,
    failedTest
  });

  return {
    verdict,
    passed,
    total: testCases.length,
    runtime: `${runtimeMs}ms`,
    submissionId: submission._id,
    failedTest
  };
}
