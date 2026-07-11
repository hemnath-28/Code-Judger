import mongoose from 'mongoose';
import { executeCode } from './execution.service.js';
import { buildHarness, buildBatchHarness } from './harness.service.js';
import { Problem } from '../models/problem.model.js';
import { Submission } from '../models/submission.model.js';
import { TestCase } from '../models/testCase.model.js';
import { apiError } from '../utils/apiError.js';
import { normalizeOutput } from '../utils/normalizeOutput.js';

export async function judgeSubmission({ submissionId, userId, problemId, language, code }) {
  if (!mongoose.Types.ObjectId.isValid(problemId)) {
    throw apiError(400, 'Invalid problemId');
  }

  const problem = await Problem.findById(problemId).lean();
  if (!problem) {
    throw apiError(404, 'Problem not found');
  }

  const testCases = await TestCase.find({ problemId })
    .sort({ order: 1, createdAt: 1 })
    .lean();

  if (testCases.length === 0) {
    throw apiError(409, 'No test cases configured for this problem');
  }

  // Build batch harness for all test cases
  const inputs = testCases.map(tc => tc.input);
  const execution = buildBatchHarness({
    problem,
    language,
    code,
    inputs
  });

  // Execute batch wrapper in the warm container pool (or host reference)
  // Give it an aggregate timeout buffer (timeLimitMs * testCases.length) to prevent premature TLE
  const result = await executeCode({
    language,
    code: execution.code,
    input: execution.input,
    timeoutMs: problem.timeLimitMs * testCases.length,
    memoryLimitMb: problem.memoryLimitMb
  });

  let verdict = 'Accepted';
  let passed = 0;
  let failedTest = null;
  const runtimeMs = result.runtimeMs;

  const rawLines = result.output ? result.output.split('\n').map(l => l.trim()) : [];
  const testcaseOutputs = [];
  const userStdoutLines = [];

  for (const line of rawLines) {
    if (line.startsWith('__RESULT__:')) {
      testcaseOutputs.push(line.slice(11).trim());
    } else if (line.length > 0) {
      userStdoutLines.push(line);
    }
  }

  const userStdout = userStdoutLines.join('\n');

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];

    // If execution stopped before printing outputs for remaining cases
    if (i >= testcaseOutputs.length) {
      verdict = result.verdict || 'Runtime Error';
      failedTest = {
        input: tc.input,
        expectedOutput: tc.expectedOutput,
        actualOutput: null,
        error: result.error || (userStdout ? `Stdout:\n${userStdout}\n\nExecution stopped` : 'Execution stopped')
      };
      break;
    }

    const line = testcaseOutputs[i];

    // If an error occurred inside the harness loop on this case
    if (line.startsWith('ERROR:')) {
      verdict = 'Runtime Error';
      failedTest = {
        input: tc.input,
        expectedOutput: tc.expectedOutput,
        actualOutput: null,
        error: line.slice(6) + (userStdout ? `\n\nStdout:\n${userStdout}` : '')
      };
      break;
    }

    const normActual = normalizeOutput(line);
    const normExpected = normalizeOutput(tc.expectedOutput);

    if (normActual !== normExpected) {
      verdict = 'Wrong Answer';
      failedTest = {
        input: tc.input,
        expectedOutput: tc.expectedOutput,
        actualOutput: line,
        error: userStdout ? `Stdout:\n${userStdout}` : null
      };
      break;
    }

    passed += 1;
  }

  const submissionDoc = {
    _id: submissionId,
    userId,
    problemId,
    language,
    verdict,
    passed,
    total: testCases.length,
    runtimeMs,
    code,
    failedTest,
    submittedAt: new Date()
  };

  return {
    submissionDoc,
    result: {
      verdict,
      passed,
      total: testCases.length,
      runtime: `${runtimeMs}ms`,
      submissionId,
      failedTest
    }
  };
}

