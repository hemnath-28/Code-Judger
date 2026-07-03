import { CheckCircle2, Plus, Trash2, XCircle } from 'lucide-react';
import { useState } from 'react';

const MAX_CUSTOM = 3;

/* ─────────────────────────── helpers ─────────────────────────── */

function parseJsonInput(str) {
  try { return JSON.parse(str); } catch { return null; }
}

function splitOutput(rawOutput) {
  if (!rawOutput) return { output: '', stdout: '' };
  
  const lines = String(rawOutput)
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trimEnd());
  
  let lastNonEmptyIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim().length > 0) {
      lastNonEmptyIdx = i;
      break;
    }
  }
  
  if (lastNonEmptyIdx === -1) {
    return { output: '', stdout: '' };
  }
  
  const output = lines[lastNonEmptyIdx].trim();
  const stdout = lines.slice(0, lastNonEmptyIdx).join('\n').trim();
  
  return { output, stdout };
}

function paramDisplayValue(parsedInput, param) {
  if (!parsedInput || !(param.name in parsedInput)) return '';
  const val = parsedInput[param.name];
  return typeof val === 'string' ? val : JSON.stringify(val);
}

/* ─────────────────────────── sub-components ──────────────────── */

function TabBtn({ label, passed, active, onClick }) {
  const dot =
    passed === true  ? 'bg-emerald-500' :
    passed === false ? 'bg-red-500'     : null;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
        active ? 'bg-gray-800 text-white shadow' : 'text-gray-500 hover:text-gray-700'
      }`}
    >
      {dot && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />}
      {label}
    </button>
  );
}

function ParamBox({ name, value, onChange }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-gray-400">
        <span className="font-mono font-semibold text-gray-600">{name}</span>
        <span className="ml-1">=</span>
      </p>
      {onChange ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          spellCheck={false}
          className="w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 font-mono text-xs text-gray-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
        />
      ) : (
        <pre className="overflow-auto whitespace-pre-wrap rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 font-mono text-xs text-gray-900">
          {value || <span className="italic text-gray-400">(empty)</span>}
        </pre>
      )}
    </div>
  );
}

function OutputBox({ label, value, status, hint }) {
  const color =
    status === 'pass' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' :
    status === 'fail' ? 'border-red-200 bg-red-50 text-red-900'             :
                        'border-gray-200 bg-gray-50 text-gray-900';

  const displayValue = typeof value === 'object' && value !== null
    ? JSON.stringify(value)
    : (value !== undefined && value !== null ? String(value) : '');

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-500">{label}</p>
        {hint && <span className="text-xs text-gray-400">{hint}</span>}
      </div>
      <pre className={`overflow-auto whitespace-pre-wrap rounded-lg border px-3 py-2.5 font-mono text-xs ${color}`}>
        {displayValue || <span className="italic text-gray-400">(empty)</span>}
      </pre>
    </div>
  );
}

function ResultSection({ result, expectedOutput, hasReference = true }) {
  if (!result) {
    return expectedOutput !== undefined ? (
      <OutputBox label="Expected Output" value={expectedOutput} />
    ) : null;
  }

  // Classify error / verdict
  const isTle = result.verdict === 'Time Limit Exceeded' || result.error === 'Time Limit Exceeded';
  const isCompileError = result.verdict === 'Compilation Error' || (result.error && result.error.includes('Compilation Error'));
  const isRuntimeError = result.verdict === 'Runtime Error' || (result.error && !isTle && !isCompileError);
  const isGenericError = result.error && !isTle && !isCompileError && !isRuntimeError;

  let verdictText = '';
  let verdictColor = 'text-red-600';
  let passedStatus = null;

  if (isTle) {
    verdictText = 'Time Limit Exceeded';
  } else if (isCompileError) {
    verdictText = 'Compile Error';
  } else if (isRuntimeError) {
    verdictText = 'Runtime Error';
  } else if (isGenericError) {
    verdictText = 'Execution Error';
  } else if (result.passed === true) {
    verdictText = 'Correct';
    verdictColor = 'text-emerald-600';
    passedStatus = 'pass';
  } else if (result.passed === false) {
    verdictText = 'Wrong Answer';
    passedStatus = 'fail';
  } else {
    verdictText = 'Finished';
    verdictColor = 'text-indigo-600';
  }

  const errorText = result.error && !isTle ? result.error : null;
  const { output, stdout } = splitOutput(result.output);

  return (
    <div className="space-y-4">
      {/* Verdict banner */}
      <div className="flex items-center gap-2">
        {verdictColor === 'text-emerald-600' ? (
          <span className={`flex items-center gap-1 text-xs font-semibold ${verdictColor}`}>
            <CheckCircle2 size={13} /> {verdictText}
          </span>
        ) : (
          <span className={`flex items-center gap-1 text-xs font-semibold ${verdictColor}`}>
            <XCircle size={13} /> {verdictText}
          </span>
        )}
        {result.runtimeMs > 0 && (
          <span className="text-xs text-gray-400">{result.runtimeMs} ms</span>
        )}
      </div>

      {/* Stderr / error message output block */}
      {errorText && (
        <OutputBox
          label={isCompileError ? 'Compile Error Message' : 'Runtime Error / Stderr'}
          value={errorText}
          status="fail"
        />
      )}

      {/* Stdout / print logs block */}
      {stdout && (
        <OutputBox
          label="Stdout"
          value={stdout}
          status="none"
        />
      )}

      {/* User's Output */}
      {!isCompileError && !isTle && output !== null && (
        <OutputBox
          label="Your Output"
          value={output}
          status={passedStatus || 'none'}
        />
      )}

      {/* Expected Output */}
      {hasReference && expectedOutput !== null && expectedOutput !== undefined && (
        <OutputBox
          label="Expected Output"
          value={expectedOutput}
          status="none"
        />
      )}

      {/* Graceful fallback message */}
      {!hasReference && result.passed === null && !result.error && (
        <p className="text-xs text-gray-400 italic">
          ℹ️ No reference solution available for this problem — output shown above.
        </p>
      )}
    </div>
  );
}

/* ─────────────────────────── main component ──────────────────── */

export default function TestCasePanel({
  problem,
  sampleCases,
  customCases,
  onCustomCasesChange,
  sampleResults,
  customResults
}) {
  const [activeTab, setActiveTab] = useState({ section: 'sample', index: 0 });

  const parameters = problem?.parameters  || [];
  const isFnMode   = problem?.judgeMode === 'function';

  /* ── custom case helpers ───────────────────────────────────── */

  function addCustomCase() {
    if (customCases.length >= MAX_CUSTOM) return;
    // Pre-fill params from first sample case so user has a valid starting point
    let paramValues = {};
    if (isFnMode && sampleCases[0]) {
      const parsed = parseJsonInput(sampleCases[0].input) || {};
      for (const p of parameters) paramValues[p.name] = paramDisplayValue(parsed, p);
    }
    const next = [...customCases, { paramValues, input: '' }];
    onCustomCasesChange(next);
    setActiveTab({ section: 'custom', index: next.length - 1 });
  }

  function removeCustomCase(idx) {
    const next = customCases.filter((_, i) => i !== idx);
    onCustomCasesChange(next);
    setActiveTab(
      next.length > 0
        ? { section: 'custom', index: Math.max(0, idx - 1) }
        : { section: 'sample', index: 0 }
    );
  }

  function updateCustomParam(caseIdx, paramName, value) {
    onCustomCasesChange(
      customCases.map((c, i) =>
        i === caseIdx ? { ...c, paramValues: { ...c.paramValues, [paramName]: value } } : c
      )
    );
  }

  function updateCustomStdin(caseIdx, value) {
    onCustomCasesChange(
      customCases.map((c, i) => (i === caseIdx ? { ...c, input: value } : c))
    );
  }

  /* ── active tab data ───────────────────────────────────────── */
  const isCustom     = activeTab.section === 'custom';
  const sampleCase   = !isCustom ? sampleCases[activeTab.index]      : null;
  const customCase   = isCustom  ? customCases[activeTab.index]      : null;
  const sampleResult = !isCustom ? sampleResults?.[activeTab.index]  : null;
  const customResult = isCustom  ? customResults?.[activeTab.index]  : null;

  const parsedSampleInput = sampleCase ? parseJsonInput(sampleCase.input) : null;

  /* ── render ────────────────────────────────────────────────── */
  return (
    <section className="space-y-4">

      {/* ── Tab bar ──────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-1 border-b border-gray-100 pb-3">
        {sampleCases.map((_, i) => (
          <TabBtn
            key={`s-${i}`}
            label={`Case ${i + 1}`}
            passed={sampleResults?.[i]?.passed ?? null}
            active={!isCustom && activeTab.index === i}
            onClick={() => setActiveTab({ section: 'sample', index: i })}
          />
        ))}

        {customCases.length > 0 && sampleCases.length > 0 && (
          <span className="h-4 w-px bg-gray-200" />
        )}

        {customCases.map((cc, i) => (
          <TabBtn
            key={`c-${i}`}
            label={`Custom ${i + 1}`}
            passed={
              customResults?.[i]
                ? customResults[i].passed   // true / false / null
                : null
            }
            active={isCustom && activeTab.index === i}
            onClick={() => setActiveTab({ section: 'custom', index: i })}
          />
        ))}

        {customCases.length < MAX_CUSTOM && (
          <button
            type="button"
            onClick={addCustomCase}
            className="flex items-center gap-1 rounded-full border border-dashed border-gray-300 px-3 py-1.5 text-xs text-gray-400 transition hover:border-indigo-400 hover:text-indigo-500"
          >
            <Plus size={11} /> Add case
          </button>
        )}

        {customCases.length > 0 && (
          <span className="ml-auto text-xs text-gray-400">{customCases.length}/{MAX_CUSTOM} custom</span>
        )}
      </div>

      {/* ── Sample case (read-only) ───────────────────────────── */}
      {!isCustom && sampleCase && (
        <div className="space-y-4">
          {isFnMode && parameters.length > 0
            ? parameters.map((p) => (
                <ParamBox key={p.name} name={p.name} value={paramDisplayValue(parsedSampleInput, p)} />
              ))
            : <ParamBox name="stdin" value={sampleCase.input} />
          }

          <ResultSection
            result={sampleResult}
            expectedOutput={sampleCase.expectedOutput}
            hasReference={true}
          />
        </div>
      )}

      {/* ── Custom case (editable) ────────────────────────────── */}
      {isCustom && customCase && (
        <div className="space-y-4">
          {/* Remove button */}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => removeCustomCase(activeTab.index)}
              className="flex items-center gap-1 text-xs text-gray-400 transition hover:text-red-500"
            >
              <Trash2 size={11} /> Remove
            </button>
          </div>

          {/* Per-parameter inputs */}
          {isFnMode && parameters.length > 0
            ? parameters.map((p) => (
                <ParamBox
                  key={p.name}
                  name={p.name}
                  value={customCase.paramValues?.[p.name] ?? ''}
                  onChange={(val) => updateCustomParam(activeTab.index, p.name, val)}
                />
              ))
            : (
                <ParamBox
                  name="stdin"
                  value={customCase.input ?? ''}
                  onChange={(val) => updateCustomStdin(activeTab.index, val)}
                />
              )
          }

          {/* ── Output after running ──────────────────────────── */}
          {customResult && (
            <ResultSection
              result={customResult}
              expectedOutput={customResult.expectedOutput}
              hasReference={customResult.hasReference}
            />
          )}
        </div>
      )}
    </section>
  );
}
