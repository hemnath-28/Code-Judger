/**
 * Normalise a program's stdout for verdict comparison.
 *
 * The function-mode harness always emits the return value as the very LAST
 * print statement, so we extract only the last non-empty line.  Any debug
 * prints the user added earlier are still shown in the console but ignored
 * during judging.
 *
 * We also strip surrounding JSON-string quotes so a stored expected value
 * of  "true"  matches the harness output  true  (and vice-versa).
 */
export function normalizeOutput(value) {
  const lines = String(value ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);

  let s = lines.length > 0 ? lines[lines.length - 1].trim() : '';

  // Strip surrounding JSON-string quotes: "true" → true, "123" → 123, etc.
  if (s.startsWith('"') && s.endsWith('"')) {
    try {
      const parsed = JSON.parse(s);
      if (typeof parsed === 'string') {
        s = parsed.trim();
      }
    } catch {
      // not valid JSON string — leave as-is
    }
  }

  return s;
}

