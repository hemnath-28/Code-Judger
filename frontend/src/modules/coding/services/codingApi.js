import { api } from '../../../lib/api.js';

export async function fetchProblems() {
  const { data } = await api.get('/problems');
  return data.problems;
}

export async function fetchProblem(problemId) {
  const { data } = await api.get(`/problems/${problemId}`);
  return data;
}

export async function runCode(payload) {
  const { data } = await api.post('/run', payload);
  return data;
}

export async function runBatch(payload) {
  const { data } = await api.post('/run/batch', payload);
  return data;
}

export async function submitCode(payload) {
  const { data } = await api.post('/submit', payload);
  return data;
}

export async function getSubmissionStatus(submissionId) {
  const { data } = await api.get(`/submissions/status/${submissionId}`);
  return data;
}

export async function fetchSubmissions(problemId) {
  const { data } = await api.get('/submissions', {
    params: problemId ? { problemId } : {}
  });
  return data.submissions;
}

