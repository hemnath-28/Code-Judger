import mongoose from 'mongoose';
import { executeCode } from '../services/execution.service.js';
import { buildHarness } from '../services/harness.service.js';
import { judgeSubmission } from '../services/submission.service.js';
import { Problem } from '../models/problem.model.js';
import { Submission } from '../models/submission.model.js';
import { TestCase } from '../models/testCase.model.js';
import { apiError } from '../utils/apiError.js';
import { normalizeOutput } from '../utils/normalizeOutput.js';

// To Get the List of Problem avaialble to Display it To Users
// Only Title,Slug,difficulty,Topic
export async function listProblems(_req, res, next) {
  try {
    const problems = await Problem.find({ isPublished: true })
      .select('title slug difficulty topic')
      .sort({ createdAt: -1 })
      .lean();

    res.json({ problems });
  } catch (error) {
    next(error);
  }
}

// Get the Problem and testCases For Problem Selected
export async function getProblem(req, res, next) {
  try {
    const { problemId } = req.validated.params;
    console.log(problemId)
    const query = mongoose.Types.ObjectId.isValid(problemId)
      ? { _id: problemId }
      : { slug: problemId };

    const problem = await Problem.findOne({ ...query, isPublished: true }).lean();
    if (!problem) {
      throw apiError(404, 'Problem not found');
    }

    const sampleCases = await TestCase.find({
      problemId: problem._id,
      isHidden: false
    })
      .select('input expectedOutput order')
      .sort({ order: 1, createdAt: 1 })
      .lean();

    res.json({ problem, sampleCases });
  } catch (error) {
    next(error);
  }
}
// To get the List of ALL submissions
export async function listSubmissions(req, res, next) {
  try {
    const userId = req.user?._id || req.user?.id;
    const filter = {};

    if (userId) {
      filter.userId = userId;
    }

    if (req.query.problemId && mongoose.Types.ObjectId.isValid(req.query.problemId)) {
      filter.problemId = req.query.problemId;
    }

    const submissions = await Submission.find(filter)
      .populate('problemId', 'title slug difficulty')
      .select('-code')
      .sort({ submittedAt: -1 })
      .limit(100)
      .lean();

    res.json({ submissions });
  } catch (error) {
    next(error);
  }
}
