const styles = {
  Accepted: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  'Wrong Answer': 'bg-amber-50 text-amber-700 ring-amber-200',
  'Compilation Error': 'bg-red-50 text-red-700 ring-red-200',
  'Runtime Error': 'bg-red-50 text-red-700 ring-red-200',
  'Time Limit Exceeded': 'bg-orange-50 text-orange-700 ring-orange-200'
};

export default function VerdictBadge({ verdict }) {
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-1 text-xs font-semibold ring-1 ${
        styles[verdict] || 'bg-gray-50 text-gray-700 ring-gray-200'
      }`}
    >
      {verdict}
    </span>
  );
}
