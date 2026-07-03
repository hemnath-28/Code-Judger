import { languages } from '../utils/language.js';

export default function LanguageSelector({ value, onChange }) {
  return (
    <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
      <span>Language</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
      >
        {languages.map((language) => (
          <option key={language.id} value={language.id}>
            {language.label}
          </option>
        ))}
      </select>
    </label>
  );
}
