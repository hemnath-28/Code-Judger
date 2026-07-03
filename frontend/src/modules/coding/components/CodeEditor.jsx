import Editor from '@monaco-editor/react';
import { getMonacoLanguage } from '../utils/language.js';

export default function CodeEditor({ language, value, onChange }) {
  return (
    <div className="h-full min-h-[480px] overflow-hidden border border-gray-200 bg-white">
      <Editor
        height="100%"
        language={getMonacoLanguage(language)}
        value={value}
        theme="vs-dark"
        onChange={(nextValue) => onChange(nextValue ?? '')}
        options={{
          minimap: { enabled: false },
          fontSize: 14,
          lineNumbersMinChars: 3,
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
          wordWrap: 'on'
        }}
      />
    </div>
  );
}
