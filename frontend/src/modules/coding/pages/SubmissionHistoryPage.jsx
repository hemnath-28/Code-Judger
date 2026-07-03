import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import VerdictBadge from '../components/VerdictBadge.jsx';
import { fetchSubmissions } from '../services/codingApi.js';
import { getLanguageLabel } from '../utils/language.js';

export default function SubmissionHistoryPage() {
  const [submissions, setSubmissions] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchSubmissions().then(setSubmissions).catch((err) => {
      setError(err.response?.data?.message || 'Unable to load submissions');
    });
  }, []);

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-950">Submission History</h1>
        <Link className="text-sm font-medium text-indigo-600" to="/">
          Problems
        </Link>
      </div>

      {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}

      <div className="overflow-hidden border border-gray-200 bg-white">
        <table className="w-full table-fixed text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Problem</th>
              <th className="w-44 px-4 py-3">Verdict</th>
              <th className="w-36 px-4 py-3">Language</th>
              <th className="w-28 px-4 py-3">Passed</th>
              <th className="w-28 px-4 py-3">Runtime</th>
              <th className="w-44 px-4 py-3">Submitted</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {submissions.map((submission) => (
              <tr key={submission._id} className="hover:bg-gray-50">
                <td className="truncate px-4 py-3 font-medium text-gray-950">
                  {submission.problemId?.title || 'Problem'}
                </td>
                <td className="px-4 py-3">
                  <VerdictBadge verdict={submission.verdict} />
                </td>
                <td className="px-4 py-3 text-gray-700">
                  {getLanguageLabel(submission.language)}
                </td>
                <td className="px-4 py-3 text-gray-700">
                  {submission.passed}/{submission.total}
                </td>
                <td className="px-4 py-3 text-gray-700">{submission.runtimeMs}ms</td>
                <td className="px-4 py-3 text-gray-500">
                  {new Date(submission.submittedAt).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
