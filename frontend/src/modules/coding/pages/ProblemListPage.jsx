import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchProblems } from '../services/codingApi.js';

export default function ProblemListPage() {
  const [problems, setProblems] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchProblems().then(setProblems).catch((err) => {
      setError(err.response?.data?.message || 'Unable to load problems');
    });
  }, []);

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-950">Problems</h1>
        <Link className="text-sm font-medium text-indigo-600" to="/submissions">
          Submissions
        </Link>
      </div>

      {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}

      <div className="overflow-hidden border border-gray-200 bg-white">
        <table className="w-full table-fixed text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Title</th>
              <th className="w-32 px-4 py-3">Difficulty</th>
              <th className="w-64 px-4 py-3">Topics</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {problems.map((problem) => (
              <tr key={problem._id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <Link
                    className="font-medium text-gray-950 hover:text-indigo-600"
                    to={`/problems/${problem.slug || problem._id}`}
                  >
                    {problem.title}
                  </Link>
                </td>
                <td className="px-4 py-3 text-gray-700">{problem.difficulty}</td>
                <td className="truncate px-4 py-3 text-gray-500">
                  {(problem.topic || []).join(', ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
