import { Play, Send } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import CodeEditor from '../components/CodeEditor.jsx';
import ConsolePanel from '../components/ConsolePanel.jsx';
import LanguageSelector from '../components/LanguageSelector.jsx';
import TestCasePanel from '../components/TestCasePanel.jsx';
import VerdictBadge from '../components/VerdictBadge.jsx';
import { fetchProblem, runBatch, submitCode, getSubmissionStatus } from '../services/codingApi.js';

/* ─────────────────────────── helpers ─────────────────────────── */

/**
 * Serialize a custom case back to a JSON input string for the API.
 *
 * Function-mode: { paramValues: { nums: "[2,7]", target: "9" } }
 *   → '{"nums":[2,7],"target":9}'
 *
 * Stdin-mode: { input: "raw text" }
 *   → "raw text"
 */
function serializeCustomCase(customCase, problem) {
  if (problem?.judgeMode === 'function') {
    const obj = {};
    for (const param of (problem.parameters || [])) {
      const raw = (customCase.paramValues?.[param.name] ?? '').trim();
      if (raw === '') { obj[param.name] = null; continue; }

      if (param.type === 'string') {
        obj[param.name] = raw; // stored without quotes → keep as string
      } else {
        try { obj[param.name] = JSON.parse(raw); }
        catch { obj[param.name] = raw; }
      }
    }
    return JSON.stringify(obj, null, 2);
  }
  return customCase.input ?? '';
}

/* ─────────────────────────── component ───────────────────────── */

export default function ProblemPage() {
  const { problemId } = useParams();
  const [language, setLanguage] = useState('python');
  const [problem, setProblem]   = useState(null);
  const [sampleCases, setSampleCases] = useState([]);
  const [codeByLanguage, setCodeByLanguage] = useState({});

  // Custom test cases — client-side only, max 3
  // Function mode: { paramValues: { [paramName]: string } }
  // Stdin mode:    { input: string }
  const [customCases, setCustomCases] = useState([]);

  // Results from /run/batch
  const [sampleResults, setSampleResults] = useState([]);
  const [customResults, setCustomResults] = useState([]);

  // Submit verdict
  const [submission, setSubmission] = useState(null);

  const [isRunning, setIsRunning]       = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError]       = useState('');

  const consoleContent = useMemo(() => {
    if (isRunning) return 'Running code against sample and custom test cases...';
    if (isSubmitting) return 'Submitting code to judge...';
    
    if (submission) {
      return `Submission Result:\nVerdict: ${submission.verdict}\nPassed: ${submission.passed}/${submission.total}\nRuntime: ${submission.runtime}`;
    }
    
    if (sampleResults.length > 0) {
      let lines = ['Test Case Results:'];
      sampleResults.forEach((res, i) => {
        const status = res.passed === true ? 'Accepted' : (res.verdict || res.error || 'Failed');
        lines.push(`Case ${i + 1}: ${status} (${res.runtimeMs} ms)`);
      });
      customResults.forEach((res, i) => {
        const status = res.passed === true ? 'Accepted' : (res.verdict || res.error || 'Failed');
        lines.push(`Custom ${i + 1}: ${status} (${res.runtimeMs} ms)`);
      });
      return lines.join('\n');
    }
    
    return 'Click "Run" to run test cases, or "Submit" to judge your solution.';
  }, [isRunning, isSubmitting, submission, sampleResults, customResults]);

  useEffect(() => {
    fetchProblem(problemId)
      .then(({ problem: p, sampleCases: sc }) => {
        setProblem(p);
        setSampleCases(sc);
        setCodeByLanguage(p.starterCode);
      })
      .catch((err) => {
        setLoadError(err.response?.data?.message || 'Unable to load problem');
      });
  }, [problemId]);

  const code = useMemo(
    () => codeByLanguage[language] || problem?.starterCode?.[language] || '',
    [codeByLanguage, language, problem]
  );

  function updateCode(next) {
    setCodeByLanguage((cur) => ({ ...cur, [language]: next }));
  }

  function handleCustomCasesChange(next) {
    setCustomCases(next);
    setCustomResults([]); // clear stale results when cases change
  }

  async function handleRun() {
    if (!problem) return;
    setIsRunning(true);
    setSampleResults([]);
    setCustomResults([]);
    setSubmission(null);

    try {
      // Serialize custom cases to the input format expected by /run/batch
      const serializedCustomCases = customCases.map((cc) => ({
        input: serializeCustomCase(cc, problem)
      }));

      const result = await runBatch({
        problemId: problem._id,
        language,
        code,
        customCases: serializedCustomCases
      });

      setSampleResults(result.sampleResults ?? []);
      setCustomResults(result.customResults ?? []);
    } catch (err) {
      // Surface a per-case error if the whole batch call fails
      const msg = err.response?.data?.message || 'Run failed';
      setSampleResults(sampleCases.map(() => ({ output: null, error: msg, passed: false, runtimeMs: 0 })));
    } finally {
      setIsRunning(false);
    }
  }

  async function handleSubmit() {
    if (!problem) return;
    setIsSubmitting(true);
    setSubmission(null);

    try {
      const response = await submitCode({ problemId: problem._id, language, code });
      const submissionId = response.submissionId;

      // Poll for submission result
      let attempts = 0;
      const maxAttempts = 120; // 60 seconds max

      while (attempts < maxAttempts) {
        attempts++;
        await new Promise((resolve) => setTimeout(resolve, 500)); // wait 500ms

        const statusRes = await getSubmissionStatus(submissionId);
        if (statusRes.status === 'Completed' || statusRes.status === 'Failed') {
          setSubmission(statusRes.result);
          return;
        }
      }

      throw new Error('Judging timed out');
    } catch (err) {
      setSubmission({
        verdict: err.response?.data?.message || err.message || 'Submit failed',
        passed: 0,
        total: 0,
        runtime: '—'
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  /* ── early returns ─────────────────────────────────────────── */
  if (loadError) return <main className="p-8 text-sm text-red-600">{loadError}</main>;
  if (!problem)  return <main className="p-8 text-sm text-gray-400">Loading…</main>;

  /* ── render ────────────────────────────────────────────────── */
  return (
    <main className="grid min-h-screen grid-cols-1 bg-gray-100 lg:grid-cols-[minmax(360px,42%)_1fr]">

      {/* ── Left: problem description + test cases ─────────── */}
      <section className="overflow-auto border-r border-gray-200 bg-white p-6">
        {/* nav */}
        <div className="mb-5 flex items-center justify-between">
          <Link className="text-sm font-medium text-indigo-600" to="/">Problems</Link>
          <Link className="text-sm font-medium text-indigo-600" to="/submissions">History</Link>
        </div>

        {/* title + difficulty + tags */}
        <div className="mb-6">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-gray-950">{problem.title}</h1>
            <span className="rounded bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-600">
              {problem.difficulty}
            </span>
          </div>
          <div className="mb-5 flex flex-wrap gap-2">
            {(problem.topic || []).map((t) => (
              <span key={t} className="rounded bg-indigo-50 px-2 py-1 text-xs text-indigo-600">{t}</span>
            ))}
          </div>
          <article className="prose prose-sm max-w-none whitespace-pre-wrap text-gray-800">
            {problem.description}
          </article>
        </div>

        {/* constraints */}
        {(problem.constraints || []).length > 0 && (
          <div className="mb-8">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Constraints</h2>
            <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">
              {problem.constraints.map((c) => <li key={c}>{c}</li>)}
            </ul>
          </div>
        )}

        {/* test cases */}
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Test Cases</h2>
        </div>

        <TestCasePanel
          problem={problem}
          sampleCases={sampleCases}
          customCases={customCases}
          onCustomCasesChange={handleCustomCasesChange}
          sampleResults={sampleResults}
          customResults={customResults}
        />
      </section>

      {/* ── Right: editor + verdict ─────────────────────────── */}
      <section className="flex min-h-screen flex-col">
        {/* toolbar */}
        <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3">
          <LanguageSelector value={language} onChange={setLanguage} />
          <div className="flex items-center gap-2">
            <button
              id="run-code-btn"
              type="button"
              onClick={handleRun}
              disabled={isRunning || isSubmitting}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Play size={15} />
              {isRunning ? 'Running…' : 'Run'}
            </button>
            <button
              id="submit-code-btn"
              type="button"
              onClick={handleSubmit}
              disabled={isRunning || isSubmitting}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-indigo-600 px-3 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Send size={15} />
              {isSubmitting ? 'Judging…' : 'Submit'}
            </button>
          </div>
        </div>

        {/* code editor */}
        <div className="min-h-0 flex-1">
          <CodeEditor language={language} value={code} onChange={updateCode} />
        </div>

        {/* submission verdict bar */}
        {submission && (
          <section className="border-t border-gray-200 bg-white p-4">
            <div className="flex flex-wrap items-center gap-4">
              <VerdictBadge verdict={submission.verdict} />
              {submission.total > 0 && (
                <span className="text-sm text-gray-700">
                  Passed {submission.passed}/{submission.total}
                </span>
              )}
              {submission.runtime && submission.runtime !== '—' && (
                <span className="text-sm text-gray-700">{submission.runtime}</span>
              )}
            </div>

            {submission.failedTest && (
              <div className="mt-4 border-t border-gray-100 pt-4 text-sm">
                <h3 className="mb-2 font-semibold text-red-600">Failed Test Case:</h3>
                
                <div className="space-y-3 rounded bg-gray-50 p-3 font-mono text-xs">
                  <div>
                    <span className="font-semibold text-gray-500 block mb-1">Input:</span>
                    <pre className="whitespace-pre-wrap rounded bg-gray-100 p-2 border border-gray-200 text-gray-800">
                      {submission.failedTest.input}
                    </pre>
                  </div>
                  
                  {submission.failedTest.expectedOutput && (
                    <div>
                      <span className="font-semibold text-gray-500 block mb-1">Expected Output:</span>
                      <pre className="whitespace-pre-wrap rounded bg-gray-100 p-2 border border-gray-200 text-gray-800">
                        {submission.failedTest.expectedOutput}
                      </pre>
                    </div>
                  )}
                  
                  {submission.failedTest.actualOutput && (
                    <div>
                      <span className="font-semibold text-gray-500 block mb-1">Your Output:</span>
                      <pre className="whitespace-pre-wrap rounded bg-red-50 p-2 border border-red-200 text-red-700">
                        {submission.failedTest.actualOutput}
                      </pre>
                    </div>
                  )}

                  {submission.failedTest.error && (
                    <div>
                      <span className="font-semibold text-red-600 block mb-1">Error Details:</span>
                      <pre className="whitespace-pre-wrap rounded bg-red-50 p-2 border border-red-200 text-red-700">
                        {submission.failedTest.error}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        )}

        <ConsolePanel output={consoleContent} error={null} isRunning={isRunning || isSubmitting} />
      </section>
    </main>
  );
}
