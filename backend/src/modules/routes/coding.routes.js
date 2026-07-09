import { Router } from 'express';
import { validateRequest } from '../../middleware/validateRequest.js';
import {
  listProblems,
  getProblem,
  listSubmissions,
  runBatch,
  runCode,
  submitCode,
  getSubmissionStatus
} from '../controllers/coding.controller.js';
import {
  problemIdParamSchema,
  runBatchSchema,
  runSchema,
  submitSchema,
  submissionIdParamSchema
} from '../utils/validation.js';

const router = Router();

router.get('/problems', listProblems);
router.get('/problems/:problemId', validateRequest(problemIdParamSchema), getProblem);
router.post('/run', validateRequest(runSchema), runCode);
router.post('/run/batch', validateRequest(runBatchSchema), runBatch);
router.post('/submit', validateRequest(submitSchema), submitCode);
router.get('/submissions/status/:submissionId', validateRequest(submissionIdParamSchema), getSubmissionStatus);
router.get('/submissions', listSubmissions);

export default router;