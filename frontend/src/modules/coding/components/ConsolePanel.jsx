export default function ConsolePanel({ output, error, isRunning }) {
  const content = error || output || (isRunning ? 'Running...' : '');

  return (
    <section className="border-t border-gray-200 bg-white">
      <div className="flex h-10 items-center justify-between border-b border-gray-200 px-4">
        <h2 className="text-sm font-semibold text-gray-800">Console</h2>
        {error ? (
          <span className="text-xs font-semibold text-red-600">Error</span>
        ) : null}
      </div>
      <pre className="min-h-40 max-h-72 overflow-auto whitespace-pre-wrap p-4 font-mono text-sm text-gray-900">
        {content}
      </pre>
    </section>
  );
}
